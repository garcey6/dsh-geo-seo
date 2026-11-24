import type { FactGraph, GenerateResult } from './types.js';
export interface GenerateOptions {
    /** Directory to write into. Defaults to a scratch directory under the OS temp dir. */
    outDir?: string;
    /** Overwrite existing files. Without it, existing files are skipped, never clobbered. */
    force?: boolean;
    /** Render and verify but write nothing. */
    dryRun?: boolean;
    /** Maximum number of pages listed in llms.txt. */
    maxEntries?: number;
    now?: Date;
}
interface PageEntry {
    file: string;
    title: string;
    description: string;
}
/** Picks the core pages: README first, then docs, README of subfolders last. */
export declare function selectPages(graph: FactGraph, maxEntries?: number): PageEntry[];
export declare function buildLlmsTxt(graph: FactGraph, options?: GenerateOptions): {
    content: string;
    entries: PageEntry[];
};
export declare function buildLlmsFullTxt(graph: FactGraph, options?: GenerateOptions): {
    content: string;
    pages: string[];
};
export interface JsonLdBuild {
    value: Record<string, unknown>;
    /** Fields that were dropped because the body does not support them. */
    dropped: {
        field: string;
        reason: string;
    }[];
    /** Required fields that could not be verified: when non-empty the write is refused. */
    blocking: {
        field: string;
        reason: string;
    }[];
}
/**
 * Builds a SoftwareApplication payload from verifiable facts only. Nothing is
 * invented: no rating, no price, no aggregate, no areaServed.
 */
export declare function buildJsonLd(graph: FactGraph): JsonLdBuild;
export interface VerifyResult {
    ok: boolean;
    checkedFacts: number;
    mismatches: {
        kind: string;
        claim: string;
        evidence: string;
    }[];
}
/** Cross-checks the rendered JSON-LD against the fact graph and the page text. */
export declare function verifyJsonLd(build: JsonLdBuild, graph: FactGraph): VerifyResult;
/** Renders the JSON-LD file: valid JSON only, so provenance lives in a property. */
export declare function renderJsonLd(value: Record<string, unknown>): string;
export declare function defaultOutDir(graph: FactGraph): string;
/** Generates all four assets. Never overwrites without \`force\`. */
export declare function generateAssets(graph: FactGraph, options?: GenerateOptions): GenerateResult;
export {};
