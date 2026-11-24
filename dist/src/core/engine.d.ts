import type { FactGraph, Report } from './types.js';
import { type ScanOptions } from './scan.js';
import { DIMENSIONS, RULE_PACK, RULE_PACK_VERSION } from './rules.js';
export interface CheckOptions extends ScanOptions {
    /** Fix "now" for deterministic tests. */
    now?: Date;
    /** Reuse an already-built graph (panel cache, tests). */
    graph?: FactGraph;
}
export interface CheckOutcome {
    report: Report;
    graph: FactGraph;
    ruleErrors: {
        ruleId: string;
        message: string;
    }[];
}
export declare function runCheck(dir: string, options?: CheckOptions): CheckOutcome;
/** Human-readable dimension label lookup, used by the renderers. */
export declare function dimensionLabel(id: string): string;
export { DIMENSIONS, RULE_PACK, RULE_PACK_VERSION };
