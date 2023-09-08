import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic,
} from 'homebridge';
import mdns from 'mdns-js';
import { mDNSReply, PLATFORM_NAME, PLUGIN_NAME } from './settings';
import AirportExpressAccessory from './airportExpressAccessory';
import { IConfigOrig, IConfig } from './IConfig';

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
        public config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform: ', this.config.name);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            this.log.debug('Executed didFinishLaunching callback');

            this.log.debug('Processing configuration:');
            this.log.debug(this.config as unknown as string);
            this.config = this.processConfiguration(
                this.config as unknown as IConfig,
            ) as PlatformConfig;
            this.log.debug(this.config as unknown as string);

            this.loadCachedDevices();

            // discover devices periodically
            if (this.config.discovery.enabled) {
                // discover devices periodically
                this.log.info('Searching for AirPort Express devices ...');
                this.discoverDevices();
                if (this.config.discovery.always) {
                    setInterval(
                        this.discoverDevices.bind(this),
                        this.config.discovery.intervals * 1000,
                    );
                }
            } else {
                this.log.info(
                    'Not searching for AirPort Express devices, due to the discovery being disabled.',
                );
            }
        });
    }

    loadCachedDevices(): void {
        for (const accessory of this.accessories) {
            if (
                !this.evalBlackWhiteList(accessory.context.device.serialNumber)
            ) {
                const l: string = this.config.discovery.whitelist.enabled
                    ? 'not whitelisted'
                    : 'blacklisted';
                this.log.warn(
                    `Cache: The cached AirPort Express device "${accessory.context.device.displayName}" (serial number: \
${accessory.context.device.serialNumber}) would not be discovered with the current configuration as it is ${l}. You can remove the cached \
device in the Homebridge UI.`,
                );
            }

            this.log.info(
                'Cache: Restoring existing accessory from cache: ',
                accessory.context.device.displayName,
            );

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            new AirportExpressAccessory(this, accessory);
            this.log.debug(
                'Finished restoring accessory from cache: ',
                accessory.context.device.displayName,
            );
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
        this.log.debug(
            `Cache: Finished loading accessory ${accessory.displayName}`,
        );
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        this.log.debug('Discovery: Creating browser');
        const mdnsBrowser = mdns.createBrowser(mdns.tcp('airplay'));

        // discover devices
        mdnsBrowser.on('ready', () => {
            this.log.debug('Discovery: Starting discovery with browser');
            mdnsBrowser.discover();
        });

        mdnsBrowser.on('update', (data: mDNSReply) => {
            // make sure we are looking at an AirPort Express 2nd Gen.
            if (
                !data ||
                !data.txt ||
                !data.txt.includes('model=AirPort10,115')
            ) {
                return;
            }

            // extract serial number
            const serialNumber: string =
                data.txt
                    .find((str) => str.indexOf('serialNumber') > -1)
                    ?.replace('serialNumber=', '') || '';

            // generate distinct ID
            const uuid: string = this.api.hap.uuid.generate(serialNumber);
            this.log.debug(
                `Discovery: AirPort Express with serial number ${serialNumber} found. Generated uuid ${uuid}.`,
            );

            // see if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(
                (accessory) => accessory.UUID === uuid,
            );
            if (existingAccessory) {
                this.log.debug(
                    `Discovery: AirPort Express with uuid ${uuid} already exists.`,
                );
                return;
            }

            if (!this.evalBlackWhiteList(serialNumber)) {
                const l: string = this.config.discovery.whitelist.enabled
                    ? 'not on the whitelist'
                    : 'on the blacklist';
                this.log.info(
                    `Discovery: Won't add AirPort Express with serial number ${serialNumber} since it is ${l}.`,
                );
                return;
            }

            // check if fullname is legit
            if (
                !data.fullname ||
                !data.fullname.includes('._airplay._tcp.local')
            ) {
                this.log.debug(
                    `Dicovery: Fullname "${
                        data.fullname as string
                    }" is invalid. Not adding as an accessory.`,
                );
                return;
            }

            // extract additional meta information
            const displayName = data.fullname.replace(
                '._airplay._tcp.local',
                '',
            );

            // the accessory does not yet exist, so we need to create it
            this.log.info('Discovery: Adding new accessory ', displayName);

            // create a new accessory
            const accessory = new this.api.platformAccessory(displayName, uuid);

            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = {
                serialNumber,
                displayName,
                data,
            };

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            new AirportExpressAccessory(this, accessory);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
                accessory,
            ]);

            this.configureAccessory(accessory);

            this.log.debug(
                `Discovery: Finished creating and configuring accessory ${displayName}`,
            );
        });

        setTimeout(() => {
            try {
                this.log.debug('Discovery: Stopping browser');
                mdnsBrowser.stop();
            } catch (err) {
                this.log.debug(
                    `Discovery: Error during stopping the browser: ${err}`,
                );
            }
        }, this.config.discovery.intervals * 1000);
    }

    evalBlackWhiteList(serialNumber: string): boolean {
        if (
            this.config.discovery.whitelist.enabled &&
            this.config.discovery.blacklist.enabled
        ) {
            this.log.error(
                'Whitelist and Blacklist cannot be enabled at the same time',
            );
            return true;
        }
        if (this.config.discovery.whitelist.enabled) {
            return this.config.discovery.whitelist.list.includes(serialNumber);
        }
        if (this.config.discovery.blacklist.enabled) {
            return !this.config.discovery.blacklist.list.includes(serialNumber);
        }
        return true;
    }

    processConfiguration(config: IConfigOrig): IConfig {
        const c: IConfig = {
            name: config.name,
            platform: config.platform,
            update: {
                refreshRate: config.update?.refreshRate || 3,
                unreachable: {
                    ignore: config.update?.unreachable?.ignore || false,
                    threshold: config.update?.unreachable?.threshold || 30,
                    reportDisconnect: config.update?.unreachable?.reportDisconnect || false,
                },
            },
            discovery: {
                enabled: config.discovery?.enabled || true,
                always: config.discovery?.always || true,
                intervals: config.discovery?.intervals || 60,
                whitelist: {
                    enabled: config.discovery?.whitelist?.enabled || false,
                    list: config.discovery?.whitelist?.list || [],
                },
                blacklist: {
                    enabled: config.discovery?.blacklist?.enabled || false,
                    list: config.discovery?.blacklist?.list || [],
                },
            },
        };

        if (
            c.discovery.whitelist.enabled &&
            c.discovery.blacklist.enabled
        ) {
            this.log.warn(
                'Both whitelist and blacklist are enabled. Disabling both. Only enable one or the other in the configuration.',
            );
            c.discovery.whitelist.enabled = false;
            c.discovery.blacklist.enabled = false;
        }

        return c;
    }
}
