import type { FactGraph, LlmsFact, MarkdownDoc, RobotsFact } from './types.js';
import { exists } from './util.js';
export interface ScanOptions {
    maxDocs?: number;
    maxSources?: number;
    /** Set false to skip \`git\` (used by tests for determinism). */
    git?: boolean;
}
export declare function scanDirectory(dir: string, options?: ScanOptions): FactGraph;
/**
 * Finds the date the project claims for itself. Only explicit statements count:
 * "last updated", "更新于", "最近更新" and changelog headings.
 */
export declare function declaredUpdate(docs: readonly MarkdownDoc[]): string | undefined;
/** Convenience: the README document, else the first Markdown document. */
export declare function primaryDocument(docs: readonly MarkdownDoc[]): MarkdownDoc | undefined;
/** Every Markdown document joined for whole-repository text searches. */
export declare function combinedText(graph: FactGraph): string;
export declare function hasFile(graph: FactGraph, name: string): boolean;
export declare function findLlms(graph: FactGraph): LlmsFact | undefined;
export declare function findRobots(graph: FactGraph): RobotsFact | undefined;
export declare function configKeysOf(graph: FactGraph): string[];
export declare function toolNames(graph: FactGraph): string[];
export declare function commandNames(graph: FactGraph): string[];
export { exists };
