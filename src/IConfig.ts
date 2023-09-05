export interface IConfig {
    name: string;
    platform: string;
    update: {
        refreshRate: number;
        unreachableThreshold: number;
    };
    discovery: {
        enabled: boolean;
        always: boolean;
        intervals: number;
        whitelist: {
            enabled: boolean;
            list: string[];
        };
        blacklist: {
            enabled: boolean;
            list: string[];
        };
    };
}

export interface IConfigOrig {
    name: string;
    platform: string;
    update?: {
        refreshRate?: number;
        unreachableThreshold?: number;
    };
    discovery?: {
        enabled?: boolean;
        always?: boolean;
        intervals?: number;
        whitelist?: {
            enabled?: boolean;
            list?: string[];
        };
        blacklist?: {
            enabled?: boolean;
            list?: string[];
        };
    };
}