export interface IConfig {
    discovery: {
        always: boolean;
        blacklist: {
            enabled: boolean;
            list: string[];
        };
        discardKnownDevices: boolean;
        enabled: boolean;
        intervals: number;
        whitelist: {
            enabled: boolean;
            list: string[];
        };
    };
    name: string;
    platform: string;
    update: {
        ignoreGroupWithLeadingDevice: boolean;
        refreshRate: number;
        unreachable: {
            ignore: boolean;
            reportDisconnect: boolean;
            threshold: number;
        };
    };
}

export interface IConfigOrig {
    discovery?: {
        always?: boolean;
        blacklist?: {
            enabled?: boolean;
            list?: string[];
        };
        discardKnownDevices?: boolean;
        enabled?: boolean;
        intervals?: number;
        whitelist?: {
            enabled?: boolean;
            list?: string[];
        };
    };
    name: string;
    platform: string;
    update?: {
        ignoreGroupWithLeadingDevice?: boolean;
        refreshRate?: number;
        unreachable?: {
            ignore?: boolean;
            reportDisconnect?: boolean;
            threshold?: number;
        };
    };
}