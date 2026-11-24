#!/usr/bin/env node
export declare const EXIT_OK = 0;
export declare const EXIT_THRESHOLD = 1;
export declare const EXIT_USAGE = 2;
export declare const EXIT_INTERNAL = 3;
export interface ParsedArgs {
    command: string;
    flags: Map<string, string | true>;
    positionals: string[];
}
export declare class UsageError extends Error {
}
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function main(argv: string[]): Promise<number>;
