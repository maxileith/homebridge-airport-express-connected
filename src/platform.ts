import {
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  PlatformConfig,
  StaticPlatformPlugin,
} from "homebridge";
import mdns from 'mdns-js';
import {
  mDNSReply,
  PLATFORM_NAME,
} from './settings';
import AirportExpress from "./platformAccessory";

mdns.excludeInterface('0.0.0.0')

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerPlatform(PLATFORM_NAME, AirportExpressPlayingPlatform);
};

class AirportExpressPlayingPlatform implements StaticPlatformPlugin {
  private readonly log: Logging;
  private readonly config: PlatformConfig;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config;
    log.info('platform finished initializing!');
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    const foundAccessories: AirportExpress[] = [];
    const mdnsBrowser = mdns.createBrowser(mdns.tcp("airplay"));

    mdnsBrowser.on('ready', () => {
      this.log('Searching for Airport Express devices')
      mdnsBrowser.discover();
    });
    
    mdnsBrowser.on('update', (data: mDNSReply) => {
      if (data.txt.includes('model=AirPort10,115') && foundAccessories.findIndex(acc => data.txt.includes(`serialNumber=${acc.serialNumber}`)) === -1) {
        foundAccessories.push(
          new AirportExpress(hap, mdns, this.log, this.config, data)
        )
      }
    });
    
    setTimeout(
      () => {
        mdnsBrowser.stop();
        callback(foundAccessories);
      },
      5000
    );
  }
}
