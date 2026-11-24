/** Plugin id, used for log prefixes and client route discovery. */
export declare const name = "dsh-geo-seo";
/**
 * Services this plugin needs. The web server is required for the panel; the
 * tools service is optional (a headless host may not expose one).
 */
export declare const inject: string[];
interface HostContext {
    webServer?: {
        register?: (route: {
            kind: 'prefix' | 'exact';
            path: string;
            handler: (req: HostRequest, res: HostResponse) => void | Promise<void>;
        }) => () => void;
    };
    tools?: {
        register?: (definition: unknown) => () => void;
    };
    effect?: (fn: () => (() => void) | void) => void;
    logger?: (name: string) => {
        warn?: (msg: string) => void;
        info?: (msg: string) => void;
    };
}
interface HostRequest {
    url?: string;
    method?: string;
    headers?: Record<string, string | string[] | undefined>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
}
interface HostResponse {
    statusCode?: number;
    headersSent?: boolean;
    writeHead?: (status: number, headers?: Record<string, string>) => void;
    write?: (chunk: string) => void;
    end?: (chunk?: string) => void;
    destroy?: () => void;
}
interface HostConfig {
    /** Directory scanned when the caller does not pass one. */
    defaultDir?: string;
    /** Set false to skip tool registration (panel-only install). */
    tools?: boolean;
}
export declare function apply(ctx: HostContext, config?: HostConfig): void;
export {};
