import { API } from "homebridge";

import { PLATFORM_NAME } from "./settings";
import AirportExpressConnectedPlatform from "./airportExpressConnectedPlatform";

import mdns from "mdns-js";

mdns.excludeInterface("0.0.0.0");

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
    api.registerPlatform(PLATFORM_NAME, AirportExpressConnectedPlatform);
};
