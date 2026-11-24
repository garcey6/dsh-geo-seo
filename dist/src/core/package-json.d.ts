/**
 * package.json reader for F1: name, version, description, keywords, deps,
 * entry points and the fields that later become machine-readable output.
 */
import type { PackageFact, ParseError } from './types.js';
export interface PackageReadResult {
    fact?: PackageFact;
    error?: ParseError;
}
export declare function readPackageJson(file: string): PackageReadResult;
