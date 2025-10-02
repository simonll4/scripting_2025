export declare const sleep: (ms: number) => Promise<void>;
export declare const retry: <T>(fn: () => Promise<T>, maxRetries?: number, delay?: number) => Promise<T>;
export declare const ensureDirectoryExists: (dirPath: string) => Promise<void>;
export declare const isValidSessionId: (sessionId: string) => boolean;
export declare const normalizeTimestamp: (ts: number | string | Date) => number;
export declare const formatDuration: (ms: number) => string;
//# sourceMappingURL=utils.d.ts.map