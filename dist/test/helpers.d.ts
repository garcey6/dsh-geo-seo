/** Creates a temporary workspace from a { relativePath: content } map. */
export declare function makeWorkspace(files: Record<string, string>): string;
/** Points the history store at a throw-away directory for the current test. */
export declare function isolatedState(): string;
/** A body long enough to clear the minimum-length rule. */
export declare function longBody(paragraphs?: number): string;
/** A README that passes most rules: title, summary, install, features, usage. */
export declare function healthyReadme(extra?: string): string;
/** Runs async work with stdout/stderr muted so CLI tests stay readable. */
export declare function quietly<T>(fn: () => Promise<T> | T): Promise<T>;
