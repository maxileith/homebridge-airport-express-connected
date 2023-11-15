/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME: string = 'AirportExpressConnected';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME: string = 'homebridge-airport-express-connected';

export interface mDNSReply {
    txt: string[];
    fullname: string;
}
