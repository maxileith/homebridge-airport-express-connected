import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic,
} from "homebridge";
import mdns from "mdns-js";
import { mDNSReply, PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import AirportExpressAccessory from "./platformAccessory";

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export default class AirportExpressConnectedPlatform
    implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic =
        this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API
    ) {
        this.log.debug("Finished initializing platform: ", this.config.name);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on("didFinishLaunching", () => {
            log.debug("Executed didFinishLaunching callback");
            this.loadCachedDevices();

            // discover devices periodically
            this.log.info('Searching for AirPort Express devices');
            this.discoverDevices();
            setInterval(this.discoverDevices.bind(this), 30000);
        });
    }

    loadCachedDevices(): void {
        for (var accessory of this.accessories) {
            this.log.info(
                "Cache: Restoring existing accessory from cache: ",
                accessory.displayName
            );

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new AirportExpressAccessory(this, accessory);
            this.log.debug("Finished restoring accessory from cache: ", accessory.displayName);
        }
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory): void {
        this.log.info(`Cache: Loading accessory ${accessory.displayName}`);

        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this.accessories.push(accessory);
        this.log.debug(`Cache: Finished loading accessory ${accessory.displayName}`);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        this.log.debug("Discovery: Creating browser");
        const mdnsBrowser = mdns.createBrowser(mdns.tcp("airplay"));

        // discover devices
        mdnsBrowser.on("ready", () => {
            this.log.debug("Discovery: Starting discovery with browser");
            mdnsBrowser.discover();
        });

        mdnsBrowser.on("update", (data: mDNSReply) => {
            // make sure we are looking at an AirPort Express 2nd Gen.
            if (
                !data ||
                !data.txt ||
                !data.txt.includes("model=AirPort10,115")
            ) {
                return;
            }

            // extract serial number
            const serialNumber: string =
                data.txt
                    .find((str) => str.indexOf("serialNumber") > -1)
                    ?.replace("serialNumber=", "") || "";

            // generate distinct ID
            const uuid: string = this.api.hap.uuid.generate(serialNumber);
            this.log.debug(`Discovery: AirPort Express with serial number ${serialNumber} found. Generated uuid ${uuid}.`);

            // see if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(
                (accessory) => accessory.UUID === uuid
            );

            if (existingAccessory) {
                this.log.debug(`Discovery: AirPort Express with uuid ${uuid} already exists.`);
                return;
            }
            if (!data.fullname || !data.fullname.includes("._airplay._tcp.local")) {
                this.log.debug(
                    `Dicovery: Fullname "${data.fullname as string}" is invalid. Not adding as an accessory.`
                );
                return;
            }

            // extract additional meta information
            const displayName = data.fullname.replace(
                "._airplay._tcp.local",
                ""
            );

            // the accessory does not yet exist, so we need to create it
            this.log.info("Discovery: Adding new accessory ", displayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(displayName, uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = {
                serialNumber,
                displayName,
                data
            };

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new AirportExpressAccessory(this, accessory);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
                accessory,
            ]);

            this.configureAccessory(accessory);

            this.log.debug(`Discovery: Finished creating and configuring accessory ${displayName}`);
        });

        setTimeout(() => {
            try {
                this.log.debug("Discovery: Stopping browser");
                mdnsBrowser.stop();
            } catch (err) {
                this.log.debug(
                    `Discovery: Error during stopping the browser: ${err}`
                );
            }
        }, 5000);
    }
}
