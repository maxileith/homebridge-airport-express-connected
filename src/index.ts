import type { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import AirportExpressConnectedPlatform from './airportExpressConnectedPlatform';

import mdns from 'mdns-js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
mdns.excludeInterface('0.0.0.0');

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
    api.registerPlatform(PLATFORM_NAME, AirportExpressConnectedPlatform);
};
