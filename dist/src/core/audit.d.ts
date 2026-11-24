/**
 * F4: crawlability and engine reachability. Separate from the 100-point score
 * because these are binary facts about the deployment, not content quality.
 *
 * The audit is deliberately pessimistic about what a local check can prove:
 * every result carries the note that an allow-listed crawler is not the same as
 * a citable page, and that domestic indexing cannot be verified offline.
 */
import type { AuditResult, FactGraph, Priority } from './types.js';
export declare const AUDIT_NOTES: string[];
/**
 * The fixed checklist: every audit rule is always reported as a row, passed or
 * failed, so the panel can say "11/13 passed" without guessing what exists.
 */
export interface AuditCheckDefinition {
    id: string;
    scope: 'international' | 'domestic';
    title: string;
    titleZh: string;
    priority: Priority;
    impact: string;
    impactZh: string;
    /** Chinese repair prompt. */
    promptTemplate: string;
    /** English repair prompt. */
    promptTemplateEn: string;
}
export declare const AUDIT_CHECKS: AuditCheckDefinition[];
export declare function runAudit(graph: FactGraph): AuditResult;
export declare function auditSummary(result: AuditResult): {
    errors: number;
    warnings: number;
    infos: number;
};
