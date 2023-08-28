# homebridge-airport-express-connected

[![mit license](https://badgen.net/badge/license/MIT/red)](https://github.com/maxileith/homebridge-airport-express-connected/blob/master/LICENSE)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://img.shields.io/npm/v/homebridge-airport-express-connected)](https://www.npmjs.com/package/homebridge-airport-express-connected)
[![npm](https://badgen.net/npm/dt/homebridge-airport-express-connected)](https://www.npmjs.com/package/homebridge-airport-express-connected)
[![donate](https://badgen.net/badge/donate/paypal/91BE09)](https://www.paypal.me/maxileith)

[Homebridge](https://github.com/homebridge/homebridge) plugin that creates an occupancy sensor that shows wether or not there is an active AirPlay 2 connection to AirPort Express (2nd Gen.) devices.

This project is a fork of [homebridge-airport-express-playing](https://github.com/apexad/homebridge-airport-express-playing). The key differences is that this plugin reports if there is a device connected and not if music is playing or paused. This is helpful for automatically turning on or off the connected HiFi system via automations.

## Configuration
This easiest way to use this plugin is to use [homebridge-config-ui-x](https://www.npmjs.com/package/homebridge-config-ui-x).  
To configure manually, add to the `platforms` section of Homebridge's `config.json` after installing the plugin.

**Config:**
```json
{
  "platform": "AirportExpressConnected",
  "name": "Airport Express Connected Platform"
}
```
