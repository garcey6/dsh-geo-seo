import { ADVISORY_RULES, DIMENSIONS, RULES } from './rules.js';
import { primaryDocument, combinedText } from './scan.js';
import { normalizeWhitespace, round } from './util.js';
export const CAP_ON_GATE = 60;
export function buildRuleContext(graph, now = new Date()) {
    const primary = primaryDocument(graph.docs);
    const context = {
        graph,
        allText: combinedText(graph).toLowerCase(),
        now,
    };
    if (primary)
        context.primary = primary;
    return context;
}
/** Runs every rule. A crashing rule is reported, never fatal. */
export function evaluateRules(graph, now = new Date()) {
    const ctx = buildRuleContext(graph, now);
    const findings = [];
    const ruleErrors = [];
    for (const rule of RULES) {
        let produced;
        try {
            produced = rule.check(ctx);
        }
        catch (error) {
            ruleErrors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : String(error) });
            continue;
        }
        for (const item of produced) {
            const finding = {
                ruleId: rule.id,
                dimension: rule.dimension,
                severity: rule.severity,
                deduction: item.deduction ?? rule.deduction,
                title: item.title || rule.title,
                detail: item.detail || rule.detail,
                suggestion: item.suggestion || rule.suggestion,
                anchors: dedupeAnchors(item.anchors),
                evidence: rule.evidence,
                rationale: rule.rationale,
            };
            if (rule.gate)
                finding.gate = true;
            findings.push(finding);
        }
    }
    const advisories = [];
    for (const rule of ADVISORY_RULES) {
        let produced;
        try {
            produced = rule.check(ctx);
        }
        catch (error) {
            ruleErrors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : String(error) });
            continue;
        }
        for (const item of produced) {
            advisories.push({
                ruleId: rule.id,
                severity: rule.severity,
                title: rule.title,
                detail: item.detail,
                suggestion: item.suggestion,
                anchors: dedupeAnchors(item.anchors),
                evidence: 'heuristic',
            });
        }
    }
    return { findings, advisories, ruleErrors };
}
/**
 * One deduction per (rule, suggestion) pair across all files: the PRD says a
 * repeated suggestion is only counted once.
 */
export function dedupeFindings(findings) {
    const byKey = new Map();
    for (const finding of findings) {
        const key = finding.ruleId + '|' + normalizeWhitespace(finding.suggestion).toLowerCase();
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...finding, anchors: dedupeAnchors(finding.anchors) });
            continue;
        }
        existing.anchors = dedupeAnchors([...existing.anchors, ...finding.anchors]);
        if (finding.deduction > existing.deduction)
            existing.deduction = finding.deduction;
        if (finding.detail.length > existing.detail.length)
            existing.detail = finding.detail;
    }
    return [...byKey.values()];
}
function dedupeAnchors(anchors) {
    const seen = new Set();
    const out = [];
    for (const anchor of anchors) {
        const key = anchor.file + ':' + (anchor.line ?? '') + ':' + (anchor.path ?? '');
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(anchor);
        if (out.length >= 6)
            break;
    }
    return out;
}
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
const DIMENSION_ORDER = DIMENSIONS.map((dimension) => dimension.id);
/** Applies weights, per-dimension caps and the compliance gate. */
export function scoreFindings(findings, advisories = []) {
    const deduped = dedupeFindings(findings);
    const dimensions = DIMENSIONS.map((dimension) => {
        const own = deduped.filter((finding) => finding.dimension === dimension.id);
        const rawDeduction = own.reduce((sum, finding) => sum + finding.deduction, 0);
        const deducted = Math.min(dimension.weight, round(rawDeduction, 1));
        return {
            id: dimension.id,
            label: dimension.label,
            weight: dimension.weight,
            score: round(dimension.weight - deducted, 1),
            deducted,
            findings: sortFindings(own),
        };
    });
    const subtotal = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
    const gateHits = deduped.filter((finding) => finding.gate);
    const capped = gateHits.length > 0 && subtotal > CAP_ON_GATE;
    const total = capped ? CAP_ON_GATE : round(subtotal, 1);
    const sorted = sortFindings(deduped);
    return {
        total,
        capped,
        ...(capped
            ? {
                capReason: 'Total capped at ' + CAP_ON_GATE + ' because a compliance error was found (' +
                    [...new Set(gateHits.map((finding) => finding.ruleId))].join(', ') + ').',
            }
            : {}),
        dimensions,
        advisories: [...advisories].sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
        findings: sorted,
    };
}
export function sortFindings(findings) {
    return [...findings].sort((a, b) => {
        const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (severity !== 0)
            return severity;
        const dimension = DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension);
        if (dimension !== 0)
            return dimension;
        return b.deduction - a.deduction;
    });
}
export function band(total) {
    if (total >= 85)
        return 'excellent';
    if (total >= 70)
        return 'good';
    if (total >= 50)
        return 'fair';
    return 'poor';
}
