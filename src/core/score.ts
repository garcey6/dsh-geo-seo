/**
 * The scoring layer: run the rule pack over a fact graph, de-duplicate the
 * deductions, and apply the PRD's weights and gates.
 */
import type {
  Advisory,
  DimensionId,
  DimensionScore,
  FactGraph,
  Finding,
  RuleContext,
  ScoreResult,
} from './types.js';
import { ADVISORY_RULES, DIMENSIONS, RULES } from './rules.js';
import { primaryDocument, combinedText } from './scan.js';
import { renderPrompt, type PromptValues } from './prompt.js';
import { normalizeWhitespace, round } from './util.js';

export const CAP_ON_GATE = 60;

export function buildRuleContext(graph: FactGraph, now: Date = new Date()): RuleContext {
  const primary = primaryDocument(graph.docs);
  const context: RuleContext = {
    graph,
    allText: combinedText(graph).toLowerCase(),
    now,
  };
  if (primary) context.primary = primary;
  return context;
}

export interface EvaluateResult {
  findings: Finding[];
  advisories: Advisory[];
  ruleErrors: { ruleId: string; message: string }[];
}

/** Collects what a repair prompt may name, leaving the rest to the renderer's fallback. */
function promptValues(
  graph: FactGraph,
  anchor: Finding['anchors'][number] | undefined,
  title: string,
  suggestion: string,
  missing?: readonly string[],
): PromptValues {
  const values: PromptValues = { title, suggestion };
  const plugin = graph.packageJson?.name;
  if (plugin !== undefined) values.plugin = plugin;
  if (anchor?.file !== undefined) values.file = anchor.file;
  if (anchor?.line !== undefined) values.line = anchor.line;
  if (missing !== undefined && missing.length > 0) values.missing = missing;
  return values;
}

/** Runs every rule. A crashing rule is reported, never fatal. */
export function evaluateRules(graph: FactGraph, now: Date = new Date()): EvaluateResult {
  const ctx = buildRuleContext(graph, now);
  const findings: Finding[] = [];
  const ruleErrors: { ruleId: string; message: string }[] = [];

  for (const rule of RULES) {
    let produced: ReturnType<typeof rule.check>;
    try {
      produced = rule.check(ctx);
    } catch (error) {
      ruleErrors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const item of produced) {
      const title = item.title || rule.title;
      const suggestion = item.suggestion || rule.suggestion;
      const anchors = dedupeAnchors(item.anchors);
      const values = promptValues(graph, anchors[0], title, suggestion, item.missing);
      const finding: Finding = {
        ruleId: rule.id,
        dimension: rule.dimension,
        severity: rule.severity,
        deduction: item.deduction ?? rule.deduction,
        title,
        detail: item.detail || rule.detail,
        suggestion,
        anchors,
        evidence: rule.evidence,
        rationale: rule.rationale,
        priority: rule.priority,
        impact: rule.impact,
        impactZh: rule.impactZh,
        prompt: renderPrompt(rule.promptTemplateEn, values),
        promptZh: renderPrompt(rule.promptTemplate, values),
      };
      if (rule.gate) finding.gate = true;
      if (item.missing !== undefined) finding.missing = item.missing;
      findings.push(finding);
    }
  }

  const advisories: Advisory[] = [];
  for (const rule of ADVISORY_RULES) {
    let produced: ReturnType<typeof rule.check>;
    try {
      produced = rule.check(ctx);
    } catch (error) {
      ruleErrors.push({ ruleId: rule.id, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const item of produced) {
      const anchors = dedupeAnchors(item.anchors);
      const values = promptValues(graph, anchors[0], rule.title, item.suggestion);
      advisories.push({
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        detail: item.detail,
        suggestion: item.suggestion,
        anchors,
        evidence: 'heuristic',
        priority: rule.priority,
        impact: rule.impact,
        impactZh: rule.impactZh,
        prompt: renderPrompt(rule.promptTemplateEn, values),
        promptZh: renderPrompt(rule.promptTemplate, values),
      });
    }
  }

  return { findings, advisories, ruleErrors };
}

/**
 * One deduction per (rule, suggestion) pair across all files: the PRD says a
 * repeated suggestion is only counted once.
 */
export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const key = finding.ruleId + '|' + normalizeWhitespace(finding.suggestion).toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...finding, anchors: dedupeAnchors(finding.anchors) });
      continue;
    }
    existing.anchors = dedupeAnchors([...existing.anchors, ...finding.anchors]);
    if (finding.deduction > existing.deduction) existing.deduction = finding.deduction;
    if (finding.detail.length > existing.detail.length) existing.detail = finding.detail;
  }
  return [...byKey.values()];
}

function dedupeAnchors(anchors: Finding['anchors']): Finding['anchors'] {
  const seen = new Set<string>();
  const out: Finding['anchors'] = [];
  for (const anchor of anchors) {
    const key = anchor.file + ':' + (anchor.line ?? '') + ':' + (anchor.path ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(anchor);
    if (out.length >= 6) break;
  }
  return out;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };
const DIMENSION_ORDER: DimensionId[] = DIMENSIONS.map((dimension) => dimension.id);

/** Applies weights, per-dimension caps and the compliance gate. */
export function scoreFindings(findings: readonly Finding[], advisories: readonly Advisory[] = []): ScoreResult {
  const deduped = dedupeFindings(findings);
  const dimensions: DimensionScore[] = DIMENSIONS.map((dimension) => {
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
          capReason:
            'Total capped at ' + CAP_ON_GATE + ' because a compliance error was found (' +
            [...new Set(gateHits.map((finding) => finding.ruleId))].join(', ') + ').',
        }
      : {}),
    dimensions,
    advisories: [...advisories].sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
    findings: sorted,
  };
}

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    const dimension = DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension);
    if (dimension !== 0) return dimension;
    return b.deduction - a.deduction;
  });
}

export function band(total: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (total >= 85) return 'excellent';
  if (total >= 70) return 'good';
  if (total >= 50) return 'fair';
  return 'poor';
}
