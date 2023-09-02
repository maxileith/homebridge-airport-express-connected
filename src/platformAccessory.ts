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
    private accessoryInformation: Service;

    private secondsUntilReportedAsOffline: number = 60;
    private lastOnline: number =
        Date.now() / 1000 - (this.secondsUntilReportedAsOffline - 10);

    constructor(
        private readonly platform: AirportExpressConnectedPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Accessory: Constructing`
        );

        // set accessory information
        this.accessoryInformation = this.accessory
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
            `${this.accessory.context.device.displayName} - Accessory: AirPort Express device with serial number ${this.accessory.context.device.serialNumber} created!`
        );

        // update the connection state periodically
        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Accessory: Starting update loop`
        );
        this.updateConnectedStatus();
        setInterval(this.updateConnectedStatus.bind(this), 2500);
    }

    updateConnectedStatus() {
        var found: boolean = false;

        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Update: AirPort Express with serial number ${this.accessory.context.device.serialNumber}`
        );

        this.platform.log.debug(`${this.accessory.context.device.displayName} - Update: Creating browser`);
        const mdnsBrowser = mdns.createBrowser(mdns.tcp("airplay"));

        mdnsBrowser.on("ready", () => {
            this.platform.log.debug(`${this.accessory.context.device.displayName} - Update: Starting discovery with browser`);
            mdnsBrowser.discover();
        });

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
                            `${this.accessory.context.device.displayName} - Update: Got mDNS reply from correct device with serial number ${this.accessory.context.device.serialNumber}`
                        );
                        this.changeName(data.fullname);
                        this.platform.log.debug(
                            `${this.accessory.context.device.displayName} - Update: txt record contents: ${data.txt}`
                        );
                        this.changeFirmware(data.txt);
                        this.setConnectStatus(this.isDeviceConnected(data.txt));
                        this.setReachableStatus(
                            this.platform.Characteristic.StatusFault.NO_FAULT
                        );
                        this.lastOnline = Date.now() / 1000;

                        this.platform.log.debug(
                            `${this.accessory.context.device.displayName} - Update: Stopping browser`
                        );
                        found = true;
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
                    `${this.accessory.context.device.displayName} - Update: Error in mDNS check, found invalid record`
                );
                this.platform.log.debug(error as string);
                this.platform.log.debug(
                    `${this.accessory.context.device.displayName} - Update: Stopping browser`
                );
                mdnsBrowser.stop();
            }
        });

        setTimeout(() => {
            try {
                if (!found) {
                    const secondsOffline: number = Math.round(Date.now() / 1000 - this.lastOnline);
                    this.platform.log.debug(
                        `${this.accessory.context.device.displayName} - Update: Device did not respond to the mDNS disovery. The device is no respondig since ${secondsOffline} seconds.`
                    );
                }
                mdnsBrowser.stop();
            } catch (err) {
                this.platform.log.debug(
                    `${this.accessory.context.device.displayName} - Update: Error during stopping the browser: ${err}`
                );
            }
        }, 2500);
    }

    setConnectStatus(status: 0 | 1) {
        // exit if there is no status change
        if (
            this.service.getCharacteristic(
                this.platform.Characteristic.OccupancyDetected
            ).value === status
        ) {
            this.platform.log.debug(
                `${this.accessory.context.device.displayName} - Update: Connection Status unchanged: ${status ? "connected" : "disconnected"}`
            );
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
                `${this.accessory.context.device.displayName} - Update: Has now an active AirPlay connection.`
            );
        } else {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} - Update: Has no active AirPlay connection.`
            );
        }
    }

    isDeviceConnected(mDNS_TXT_record: Array<string>): 0 | 1 {
        const flagsHex: string = mDNS_TXT_record
            .find((r: string) => r.indexOf("flag") > -1)!
            .replace("flags=", "");
        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Update: Flags hex ${flagsHex}`
        );

        const flagsBits: string = this.hexStringToBitString(flagsHex);
        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Update: Flags Bits ${flagsBits}`
        );

        /* bit11 corresponds to playing
         * see https://openairplay.github.io/airplay-spec/status_flags.html
         */
        const bit11: boolean = flagsBits.charAt(11) === "1";
        this.platform.log.debug(
            `${this.accessory.context.device.displayName} - Update: Bit 11 is "${bit11}"`
        );

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
        if (
            this.service.getCharacteristic(
                this.platform.Characteristic.StatusFault
            ).value === status
        ) {
            this.platform.log.debug(
                `${this.accessory.context.device.displayName} - Update: Reachable status unchanged: ${status ? "unreachable" : "reachable"}`
            );
            return;
        }

        this.service.setCharacteristic(
            this.platform.Characteristic.StatusFault,
            status
        );
        if (status === this.platform.Characteristic.StatusFault.GENERAL_FAULT) {
            this.platform.log.warn(
                `${this.accessory.context.device.displayName} - Update: unreachable`
            );
            this.setConnectStatus(
                this.platform.Characteristic.OccupancyDetected
                    .OCCUPANCY_NOT_DETECTED
            );
        } else {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} - Update: reachable`
            );
        }
    }

    hexStringToBitString(hex: string): string {
        return this.reverseString(
            parseInt(hex, 16).toString(2).padStart(20, "0")
        );
    }

    reverseString(value: string): string {
        return value.split("").reverse().join("");
    }

    changeName(fullname: string): void {
        const displayName: string = fullname.replace(
            "._airplay._tcp.local",
            ""
        );
        if (this.accessory.context.device.displayName !== displayName) {
            this.platform.log.info(
                `${this.accessory.context.device.displayName} - Update: Renaming to "${displayName}" since the AirPlay speaker fullname was changed.`
            );
            this.accessory.context.device.displayName = displayName;
            this.service.setCharacteristic(
                this.platform.Characteristic.Name,
                displayName
            );
        } else {
            this.platform.log.debug(
                `${this.accessory.context.device.displayName} - Update: Name unchanged.`
            );
        }
    }

    changeFirmware(mDNS_TXT_record: Array<string>): void {
        var firmwareVersion: string = mDNS_TXT_record
            .find((r: string) => r.indexOf("fv") > -1)!
            .replace("fv=", "");

        firmwareVersion =
            firmwareVersion === "p20.78100.3" ? "7.8.1" : firmwareVersion;
        const prevFirmwareVersion = this.accessoryInformation.getCharacteristic(
            this.platform.Characteristic.FirmwareRevision
        ).value;

        if (firmwareVersion !== prevFirmwareVersion) {
            this.platform.log.info(
                `Set Firmware of ${this.accessory.context.device.displayName} to "${firmwareVersion}".`
            );
            this.accessoryInformation.setCharacteristic(
                this.platform.Characteristic.FirmwareRevision,
                firmwareVersion
            );
        }
    }
}
