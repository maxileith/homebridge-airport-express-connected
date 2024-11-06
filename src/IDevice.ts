import type { MDNSReply } from './settings';

export default interface IDevice {
    data: MDNSReply;
    displayName: string;
    serialNumber: string;
}
