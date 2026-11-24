/**
 * F4: crawlability and engine reachability. Separate from the 100-point score
 * because these are binary facts about the deployment, not content quality.
 *
 * The audit is deliberately pessimistic about what a local check can prove:
 * every result carries the note that an allow-listed crawler is not the same as
 * a citable page, and that domestic indexing cannot be verified offline.
 */
import type { AuditResult, FactGraph } from './types.js';
export declare const AUDIT_NOTES: string[];
export declare function runAudit(graph: FactGraph): AuditResult;
export declare function auditSummary(result: AuditResult): {
    errors: number;
    warnings: number;
    infos: number;
};
