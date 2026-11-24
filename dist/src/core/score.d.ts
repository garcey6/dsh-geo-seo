/**
 * The scoring layer: run the rule pack over a fact graph, de-duplicate the
 * deductions, and apply the PRD's weights and gates.
 */
import type { Advisory, FactGraph, Finding, RuleContext, ScoreResult } from './types.js';
export declare const CAP_ON_GATE = 60;
export declare function buildRuleContext(graph: FactGraph, now?: Date): RuleContext;
export interface EvaluateResult {
    findings: Finding[];
    advisories: Advisory[];
    ruleErrors: {
        ruleId: string;
        message: string;
    }[];
}
/** Runs every rule. A crashing rule is reported, never fatal. */
export declare function evaluateRules(graph: FactGraph, now?: Date): EvaluateResult;
/**
 * One deduction per (rule, suggestion) pair across all files: the PRD says a
 * repeated suggestion is only counted once.
 */
export declare function dedupeFindings(findings: readonly Finding[]): Finding[];
/** Applies weights, per-dimension caps and the compliance gate. */
export declare function scoreFindings(findings: readonly Finding[], advisories?: readonly Advisory[]): ScoreResult;
export declare function sortFindings(findings: readonly Finding[]): Finding[];
export declare function band(total: number): 'excellent' | 'good' | 'fair' | 'poor';
