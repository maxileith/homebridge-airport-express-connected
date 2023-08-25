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
        this.service
            .setCharacteristic(
                this.platform.Characteristic.Name,
                this.accessory.context.device.displayName
            )
            .setCharacteristic(
                this.platform.Characteristic.OccupancyDetected,
                false
            );

        // log that an device has been created
        this.platform.log.info(
            `Airport Express device ${this.accessory.context.device.displayName} (serial number: ${this.accessory.context.device.serialNumber} created!`
        );

        this.setConnectStatus(
            this.isDeviceConnected(accessory.context.device.data.txt)
        );

        // update the media state periodically
        setInterval(this.updateConnectedStatus.bind(this), 5000);
    }

    updateConnectedStatus() {
        this.platform.log.debug(
            `Updating Airport Exrpess with serial number ${this.accessory.context.device.serialNumber}`
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
                    }
                }
            } catch (error) {
                this.platform.log.error(
                    `Error in mDNS check, found invalid record`
                );
                this.platform.log.debug(error as string);
            } finally {
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
            }, 5000);
        });
    }

    setConnectStatus(status: boolean) {
        this.service.setCharacteristic(
            this.platform.Characteristic.OccupancyDetected,
            status
        );
    }

    isDeviceConnected(mDNS_TXT_record: Array<string>): boolean {
        const bit11 = parseInt(
            mDNS_TXT_record
                .find((r: string) => r.indexOf("flag") > -1)!
                .replace("flags=", ""),
            16
        )
            .toString(2)
            .padStart(12, "0")
            .charAt(0);
        /* bit11 correspponds to playing
         * see https://github.com/openairplay/airplay-spec/blob/master/src/status_flags.md
         */
        if (bit11 === "0") {
            return false;
        } else {
            return true;
        }
    }
}
