/** Plugin id, used for log prefixes and client route discovery. */
export declare const name = "dsh-geo-seo";
/**
 * Services this plugin needs. The web server is required for the panel; the
 * tools registry is optional (a headless host may not expose one), so it is
 * read through `ctx.reflect.get` instead of being injected — cordis throws on
 * `ctx.<name>` reads for services that are not declared.
 */
export declare const inject: string[];
/** One node of the enforced JSON Schema subset the host accepts. */
interface JsonSchemaNode {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, JsonSchemaNode>;
    required?: string[];
    additionalProperties?: boolean;
    items?: JsonSchemaNode;
    enum?: Array<string | number | boolean | null>;
    description?: string;
    title?: string;
}
/** The definition shape tools.register() consumes: raw JSON Schema, not a shorthand map. */
interface ToolDefinition {
    name: string;
    description: string;
    parameters: JsonSchemaNode;
    output: {
        schema: JsonSchemaNode;
        render: (args: any, value: any) => Array<{
            type: 'text';
            text: string;
        }>;
    };
    isConcurrencySafe?: (args: any) => boolean;
    execute: (args: any, exec: any) => Promise<unknown>;
}
interface WebRouteRegistration {
    kind: 'prefix' | 'exact';
    path: string;
    handler: (req: HostRequest, res: HostResponse) => void | Promise<void>;
}
/** The slice of the host tool registry this plugin uses. */
type ToolRegistrar = (definition: ToolDefinition) => () => void;
interface HostContext {
    webServer?: {
        register?: (route: WebRouteRegistration) => () => void;
    };
    tools?: {
        register?: ToolRegistrar;
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
