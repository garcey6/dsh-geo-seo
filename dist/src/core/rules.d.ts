/**
 * The versioned rule pack.
 *
 * Rules are data plus a small check function, and the pack carries its own
 * version so a report can always say which rules produced it. Deductions are
 * capped per dimension by the scorer, not here.
 */
import type { DimensionId, RuleContext, RuleDefinition, RulePromptFields } from './types.js';
import { bodyText } from './markdown.js';
export declare const RULE_PACK_VERSION = "2026.02.1";
export declare const RULE_PACK_RELEASED = "2026-02-18";
export declare const RULE_PACK: {
    readonly name: "geo-seo-core";
    readonly version: "2026.02.1";
    readonly released: "2026-02-18";
    /** Bumped whenever weights or gate conditions change. */
    readonly scoringVersion: 1;
    readonly notes: string;
};
export declare const DIMENSIONS: {
    id: DimensionId;
    label: string;
    weight: number;
    purpose: string;
}[];
declare const MIN_WORDS = 600;
declare const STALE_DAYS = 365;
declare const DRIFT_DAYS = 90;
/** Rules that never score: typography is reported for the reader only. */
export interface AdvisoryRule {
    id: string;
    severity: 'info' | 'warning';
    title: string;
    check: (ctx: RuleContext) => {
        detail: string;
        suggestion: string;
        anchors: {
            file: string;
            line?: number;
        }[];
    }[];
}
/**
 * The published pack: rule data plus the panel half of each rule (urgency, the
 * cost to the reader, and a copy-ready repair prompt).
 */
export declare const RULES: RuleDefinition[];
/** Advisories carry the same panel copy, but never score. */
export declare const ADVISORY_RULES: (AdvisoryRule & RulePromptFields)[];
export { MIN_WORDS, STALE_DAYS, DRIFT_DAYS };
export { bodyText };
