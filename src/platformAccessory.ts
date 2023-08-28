import { Service, PlatformAccessory } from "homebridge";
import mdns from "mdns-js";
import AirportExpressConnectedPlatform from "./platform";
import { mDNSReply } from "./settings";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export default class AirportExpressAccessory {
    private service: Service;
    private prevConnectionStatus: 0 | 1;
    private prevReachableStatus: 0 | 1 =
        this.platform.Characteristic.StatusFault.NO_FAULT;

    private secondsUntilReportedAsOffline: number = 60;
    private lastOnline: number =
        Date.now() / 1000 - (this.secondsUntilReportedAsOffline - 10);

    constructor(
        private readonly platform: AirportExpressConnectedPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        // set accessory information
        this.accessory
            .getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(
                this.platform.Characteristic.Manufacturer,
                "Apple Inc."
            )
            .setCharacteristic(this.platform.Characteristic.Model, "A1392")
            .setCharacteristic(
                this.platform.Characteristic.SerialNumber,
                this.accessory.context.device.serialNumber
            );

        // get the OccupancySensor service if it exists, otherwise create a new OccupancySensor service
        // you can create multiple services for each accessory
        this.service =
            this.accessory.getService(this.platform.Service.OccupancySensor) ||
            this.accessory.addService(this.platform.Service.OccupancySensor);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this case we are using the name we stored in the `accessory.context` in the `discoverDevice
        this.service.setCharacteristic(
            this.platform.Characteristic.Name,
            this.accessory.context.device.displayName
        );

        // log that an device has been created
        this.platform.log.info(
            `Airport Express device ${this.accessory.context.device.displayName} (serial number: ${this.accessory.context.device.serialNumber} created!`
        );

        this.prevConnectionStatus = this.isDeviceConnected(
            this.accessory.context.device.data.txt
        );
        this.setConnectStatus(this.prevConnectionStatus);

        // update the connection state periodically
        setInterval(this.updateConnectedStatus.bind(this), 2500);
    }

    updateConnectedStatus() {
        this.platform.log.debug(
            `Updating Airport Express with serial number ${this.accessory.context.device.serialNumber}`
        );

        const mdnsBrowser = mdns.createBrowser(mdns.tcp("airplay"));

        mdnsBrowser.on("ready", () => mdnsBrowser.discover());

        mdnsBrowser.on("update", (data: mDNSReply) => {
            try {
                if (data && data.txt) {
                    const foundSerialNumber = data.txt
                        .find((str) => str.indexOf("serialNumber") > -1)
                        ?.replace("serialNumber=", "");

                    if (
                        data.txt.includes("model=AirPort10,115") &&
                        foundSerialNumber &&
                        this.accessory.context.device.serialNumber ===
                            foundSerialNumber
                    ) {
                        this.platform.log.debug(
                            `txt record contents: ${data.txt}`
                        );
                        this.setConnectStatus(this.isDeviceConnected(data.txt));
                        this.setReachableStatus(
                            this.platform.Characteristic.StatusFault.NO_FAULT
                        );
                        this.lastOnline = Date.now() / 1000;
                        mdnsBrowser.stop();
                    } else if (
                        this.lastOnline + this.secondsUntilReportedAsOffline <
                        Date.now() / 1000
                    ) {
                        this.setReachableStatus(
                            this.platform.Characteristic.StatusFault
                                .GENERAL_FAULT
                        );
                    }
                }
            } catch (error) {
                this.platform.log.error(
                    `Error in mDNS check, found invalid record`
                );
                this.platform.log.debug(error as string);
                mdnsBrowser.stop();
            }

            setTimeout(() => {
                try {
                    // make sure mdnsBrowser was stopped if it was not stopped above
                    mdnsBrowser.stop();
                } catch (err) {
                    this.platform.log.debug(
                        `mdns browser for stop via timeout error: ${err}`
                    );
                }
            }, 2500);
        });
    }

    setConnectStatus(status: 0 | 1) {
        // exit if there is no status change
        if (this.prevConnectionStatus === status) {
            return;
        }

        this.service.setCharacteristic(
            this.platform.Characteristic.OccupancyDetected,
            status
        );
        if (
            status ===
            this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        ) {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} has now an active AirPlay connection.`
            );
        } else {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} has no active AirPlay connection.`
            );
        }

        this.prevConnectionStatus = status;
    }

    isDeviceConnected(mDNS_TXT_record: Array<string>): 0 | 1 {
        const flagsHex: string = mDNS_TXT_record
            .find((r: string) => r.indexOf("flag") > -1)!
            .replace("flags=", "");
        const flagsBits: string = this.hexStringToBitString(flagsHex);

        /* bit11 corresponds to playing
         * see https://openairplay.github.io/airplay-spec/status_flags.html
         */
        this.platform.log.debug(`Flags: ${flagsBits}`);
        const bit11: boolean = flagsBits.charAt(11) === "1";
        if (bit11 === false) {
            return this.platform.Characteristic.OccupancyDetected
                .OCCUPANCY_NOT_DETECTED;
        } else {
            return this.platform.Characteristic.OccupancyDetected
                .OCCUPANCY_DETECTED;
        }
    }

    setReachableStatus(status: 0 | 1) {
        // exit if there is no status change
        if (this.prevReachableStatus === status) {
            return;
        }

        this.service.setCharacteristic(
            this.platform.Characteristic.StatusFault,
            status
        );
        if (status === this.platform.Characteristic.StatusFault.GENERAL_FAULT) {
            this.platform.log.warn(
                `${this.accessory.context.device.displayName} is not reachable.`
            );
            this.setConnectStatus(
                this.platform.Characteristic.OccupancyDetected
                    .OCCUPANCY_NOT_DETECTED
            );
        } else {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} is reachable.`
            );
        }

        this.prevReachableStatus = status;
    }

    hexStringToBitString(hex: string): string {
        return this.reverseString(
            parseInt(hex, 16).toString(2).padStart(20, "0")
        );
    }

    reverseString(value: string): string {
        return value.split("").reverse().join("");
    }
}
