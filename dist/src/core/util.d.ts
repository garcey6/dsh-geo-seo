export declare function toPosix(p: string): string;
export declare function relativeTo(root: string, file: string): string;
export declare function exists(target: string): boolean;
export declare function isDirectory(target: string): boolean;
export declare function readTextSafe(file: string, limit?: number): string | undefined;
export declare function mtimeIso(file: string): string | undefined;
export interface ListOptions {
    maxDepth?: number;
    maxFiles?: number;
    ignore?: Set<string>;
}
/** Walks a directory tree, returning POSIX-style paths relative to `root`. */
export declare function listFiles(root: string, options?: ListOptions): string[];
export declare function sha1(input: string): string;
/** Counts Latin words plus CJK characters, so Chinese docs are not scored as empty. */
export declare function countWords(text: string): number;
export declare function normalizeWhitespace(text: string): string;
/** Lowercases and collapses whitespace: the canonical form for text searches. */
export declare function lower(text: string): string;
export declare function stripInlineMarkdown(text: string): string;
export declare function clip(text: string, max: number): string;
/**
 * Parses the date formats that actually show up in READMEs and package.json.
 * Returns an ISO date (UTC midnight) so comparisons are stable.
 */
export declare function parseDate(input: string | undefined): string | undefined;
export declare function daysBetween(fromIso: string, toIso: string): number;
export declare function containsAny(haystack: string, needles: readonly string[]): string | undefined;
export declare function uniq<T>(items: readonly T[]): T[];
export declare function round(value: number, digits?: number): number;
export declare function clamp(value: number, min: number, max: number): number;
export declare function escapeRegExp(input: string): string;
export declare function formatBytes(bytes: number): string;
