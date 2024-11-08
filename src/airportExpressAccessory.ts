import type {
    Service,
    PlatformAccessory,
    CharacteristicValue,
    Nullable,
} from 'homebridge';
import mdns from 'mdns-js';
import type AirportExpressConnectedPlatform from './airportExpressConnectedPlatform';
import type { MDNSReply } from './settings';
import type IDevice from './IDevice';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export default class AirportExpressAccessory {

    private accessoryInformation: Service;
    private readonly device: IDevice;
    private lastOnline = 0;
    private reachable = true;
    private service: Service;

    public constructor(
        private readonly platform: AirportExpressConnectedPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.device = this.accessory.context.device;

        this.platform.log.debug(
            `${this.device.displayName} - Accessory: Constructing`,
        );

        // set accessory information
        this.accessoryInformation = this.accessory
            .getService(this.platform.service.AccessoryInformation)!
            .setCharacteristic(
                this.platform.characteristic.Manufacturer,
                'Apple Inc.',
            )
            .setCharacteristic(this.platform.characteristic.Model, 'A1392')
            .setCharacteristic(
                this.platform.characteristic.SerialNumber,
                this.device.serialNumber,
            );

        // get the OccupancySensor service if it exists, otherwise create a new OccupancySensor service
        // you can create multiple services for each accessory
        this.service =
            this.accessory.getService(this.platform.service.OccupancySensor) ||
            this.accessory.addService(this.platform.service.OccupancySensor);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this case we are using the name we stored in the `accessory.context` in the `discoverDevice
        this.service.setCharacteristic(
            this.platform.characteristic.Name,
            this.device.displayName,
        );

        // create handlers for required characteristics
        this.service
            .getCharacteristic(this.platform.characteristic.OccupancyDetected)
            .onGet(this.handleGet.bind(this));

        // log that an device has been created
        this.platform.log.info(
            `${this.device.displayName} - Accessory: AirPort Express device with serial number ${this.device.serialNumber} created!`,
        );

        // update the connection state periodically
        this.platform.log.debug(
            `${this.device.displayName} - Accessory: Starting update loop`,
        );
        this.updateConnectedStatus();
        setInterval(
            this.updateConnectedStatus.bind(this),
            this.platform.config.update.refreshRate * 1000,
        );
    }

    private changeFirmware(mdnsTxtRecord: string[]): void {
        let firmwareVersion: string = mdnsTxtRecord
            .find((r: string) => r.includes('fv'))!
            .replace('fv=', '');

        firmwareVersion =
            firmwareVersion === 'p20.78100.3' ? '7.8.1' : firmwareVersion;
        const prevFirmwareVersion: Nullable<CharacteristicValue> = this.accessoryInformation.getCharacteristic(
            this.platform.characteristic.FirmwareRevision,
        ).value;

        if (firmwareVersion !== prevFirmwareVersion) {
            this.platform.log.info(
                `Set Firmware of ${this.device.displayName} to "${firmwareVersion}".`,
            );
            this.accessoryInformation.setCharacteristic(
                this.platform.characteristic.FirmwareRevision,
                firmwareVersion,
            );
        }
    }

    private changeName(fullname: string): void {
        const displayName: string = fullname.replace(
            '._airplay._tcp.local',
            '',
        );
        if (this.device.displayName !== displayName) {
            this.platform.log.info(
                `${this.device.displayName} - Update: Renaming to "${displayName}" since the AirPlay speaker fullname was changed.`,
            );
            this.device.displayName = displayName;
            this.service.setCharacteristic(
                this.platform.characteristic.Name,
                displayName,
            );
        } else {
            this.platform.log.debug(
                `${this.device.displayName} - Update: Name unchanged.`,
            );
        }
    }

    private async handleGet(): Promise<Nullable<CharacteristicValue>> {
        const connected: Nullable<CharacteristicValue> =
            this.service.getCharacteristic(
                this.platform.characteristic.OccupancyDetected,
            ).value;
        const answer: string = !this.reachable
            ? 'not responding'
            : connected === this.platform.characteristic.OccupancyDetected.OCCUPANCY_DETECTED
                ? 'connected'
                : 'disconnected';

        this.platform.log.debug(
            `${this.device.displayName} - Pull: Received GET request from HomeKit. Answer: ${answer}`,
        );

        if (!this.reachable) {
            throw new this.platform.api.hap.HapStatusError(
                this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
            );
        }

        return connected;
    }

    private hexStringToBitString(hex: string): string {
        return this.reverseString(
            parseInt(hex, 16).toString(2).padStart(20, '0'),
        );
    }

    private isDeviceConnected(mdnsTxtRecord: string[]): 0 | 1 {
        const flagsHex: string = mdnsTxtRecord
            .find((r: string) => r.includes('flag'))!
            .replace('flags=', '');
        this.platform.log.debug(
            `${this.device.displayName} - Update: Flags hex ${flagsHex}`,
        );

        const flagsBits: string = this.hexStringToBitString(flagsHex);
        this.platform.log.debug(
            `${this.device.displayName} - Update: Flags Bits ${flagsBits}`,
        );

        /* bit11 corresponds to playing
         * see https://openairplay.github.io/airplay-spec/status_flags.html
         */
        const bit11: boolean = flagsBits.charAt(11) === '1';
        this.platform.log.debug(
            `${this.device.displayName} - Update: Bit 11 is "${bit11}"`,
        );

        const gcgl: boolean = mdnsTxtRecord
            .find((r: string) => r.includes('gcgl'))!
            .replace('gcgl=', '') === '1';
        this.platform.log.debug(
            `${this.device.displayName} - Update: gcgl is "${gcgl}"`,
        );

        if (this.platform.config.update.ignoreGroupWithLeadingDevice) {
            if (gcgl && bit11 || !bit11) {
                return this.platform.characteristic.OccupancyDetected
                    .OCCUPANCY_NOT_DETECTED;
            } else {
                return this.platform.characteristic.OccupancyDetected
                    .OCCUPANCY_DETECTED;
            }
        } else {
            if (bit11) {
                return this.platform.characteristic.OccupancyDetected
                    .OCCUPANCY_DETECTED;
            } else {
                return this.platform.characteristic.OccupancyDetected
                    .OCCUPANCY_NOT_DETECTED;
            }
        }
    }

    private reverseString(value: string): string {
        return value.split('').reverse().join('');
    }

    private setConnectStatus(status: 0 | 1): void {
        // exit if there is no status change
        if (
            this.service.getCharacteristic(
                this.platform.characteristic.OccupancyDetected,
            ).value === status
        ) {
            this.platform.log.debug(
                `${
                    this.device.displayName
                } - Update: Connection Status unchanged: ${
                    status ? 'connected' : 'disconnected'
                }`,
            );
            return;
        }

        this.service.setCharacteristic(
            this.platform.characteristic.OccupancyDetected,
            status,
        );
        if (
            status ===
            this.platform.characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        ) {
            this.platform.log.info(
                `${this.device.displayName} - Update: Has now an active AirPlay connection.`,
            );
        } else {
            this.platform.log.info(
                `${this.device.displayName} - Update: Has no active AirPlay connection.`,
            );
        }
    }

    private setReachableStatus(reachable: boolean): void {
        // check if unreachable should be ignored
        if (this.platform.config.update.unreachable.ignore) {
            return;
        }

        // exit if there is no status change
        if (this.reachable === reachable) {
            this.platform.log.debug(
                `${
                    this.device.displayName
                } - Update: Reachable status unchanged: ${
                    reachable ? 'reachable' : 'unreachable'
                }`,
            );
            return;
        }

        this.reachable = reachable;
        if (reachable) {
            this.platform.log.info(
                `${this.device.displayName} - Update: reachable`,
            );
        } else {
            this.platform.log.warn(
                `${this.device.displayName} - Update: unreachable`,
            );
            // report a disconnect if this has been configured to be done
            if (this.platform.config.update.unreachable.reportDisconnect) {
                this.setConnectStatus(
                    this.platform.characteristic.OccupancyDetected
                        .OCCUPANCY_NOT_DETECTED,
                );
            }
        }
    }

    private updateConnectedStatus(): void {
        let found: boolean = false;

        this.platform.log.debug(
            `${this.device.displayName} - Update: AirPort Express with serial number ${this.device.serialNumber}`,
        );

        this.platform.log.debug(
            `${this.device.displayName} - Update: Creating browser`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const mdnsBrowser: any = mdns.createBrowser(mdns.tcp('airplay'));

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mdnsBrowser.on('ready', () => {
            this.platform.log.debug(
                `${this.device.displayName} - Update: Starting discovery with browser`,
            );
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            mdnsBrowser.discover();
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mdnsBrowser.on('update', (data: MDNSReply) => {
            try {
                if (data?.txt) {
                    const foundSerialNumber: string | undefined = data.txt
                        .find((str) => str.includes('serialNumber'))
                        ?.replace('serialNumber=', '');

                    if (
                        data.txt.includes('model=AirPort10,115') &&
                        foundSerialNumber !== undefined &&
                        this.device.serialNumber ===
                            foundSerialNumber
                    ) {
                        this.platform.log.debug(
                            `${this.device.displayName} - Update: Got mDNS reply from correct device with serial number \
${this.device.serialNumber}`,
                        );
                        this.changeName(data.fullname);
                        this.platform.log.debug(
                            `${this.device.displayName} - Update: txt record contents: ${data.txt}`,
                        );
                        this.changeFirmware(data.txt);
                        this.setConnectStatus(this.isDeviceConnected(data.txt));
                        this.setReachableStatus(true);
                        this.lastOnline = Date.now() / 1000;

                        this.platform.log.debug(
                            `${this.device.displayName} - Update: Stopping browser`,
                        );
                        found = true;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        mdnsBrowser.stop();
                    }
                }
            } catch (error) {
                this.platform.log.error(
                    `${this.device.displayName} - Update: Error in mDNS check, found invalid record`,
                );
                this.platform.log.debug(error as string);
                this.platform.log.debug(
                    `${this.device.displayName} - Update: Stopping browser`,
                );
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                mdnsBrowser.stop();
            }
        });

        setTimeout(() => {
            try {
                if (!found) {
                    const secondsOffline: number = Math.round(
                        Date.now() / 1000 - this.lastOnline,
                    );
                    this.platform.log.debug(
                        `${this.device.displayName} - Update: Device did not respond to the mDNS disovery. The device is not responding \
since ${secondsOffline} seconds.`,
                    );
                    if (
                        this.lastOnline +
                            this.platform.config.update.unreachable.threshold <=
                        Date.now() / 1000
                    ) {
                        this.setReachableStatus(false);
                    }
                }
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                mdnsBrowser.stop();
            } catch (err) {
                this.platform.log.debug(
                    `${this.device.displayName} - Update: Error during stopping the browser: ${err}`,
                );
            }
        }, this.platform.config.update.refreshRate * 1000);
    }
}
