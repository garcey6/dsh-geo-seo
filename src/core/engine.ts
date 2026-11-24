/**
 * The check pipeline: scan -> rules -> score -> report. This is the single entry
 * point shared by the CLI, the DSH tools and the sidebar panel.
 */
import path from 'node:path';
import type { FactGraph, ParseError, Report } from './types.js';
import { scanDirectory, type ScanOptions } from './scan.js';
import { band, evaluateRules, scoreFindings } from './score.js';
import { DIMENSIONS, RULE_PACK, RULE_PACK_VERSION } from './rules.js';
import { ENGINE_VERSION, REPORT_SCHEMA_VERSION } from './types.js';
import { commandNames, configKeysOf, toolNames } from './scan.js';
import { mtimeIso, relativeTo } from './util.js';

export interface CheckOptions extends ScanOptions {
  /** Fix "now" for deterministic tests. */
  now?: Date;
  /** Reuse an already-built graph (panel cache, tests). */
  graph?: FactGraph;
}

export interface CheckOutcome {
  report: Report;
  graph: FactGraph;
  ruleErrors: { ruleId: string; message: string }[];
}

export function runCheck(dir: string, options: CheckOptions = {}): CheckOutcome {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const graph = options.graph ?? scanDirectory(dir, options);
  const { findings, advisories, ruleErrors } = evaluateRules(graph, now);
  const score = scoreFindings(findings, advisories);

  const parseErrors: ParseError[] = [...graph.errors];
  for (const error of ruleErrors) {
    parseErrors.push({ file: '<rule:' + error.ruleId + '>', message: error.message });
  }

  const jsonLdTypes: string[] = [];
  for (const block of graph.site.jsonLd) {
    const value = block.value as Record<string, unknown> | null;
    const type = value?.['@type'];
    if (typeof type === 'string') jsonLdTypes.push(type);
    else if (Array.isArray(type)) {
      for (const item of type) if (typeof item === 'string') jsonLdTypes.push(item);
    }
  }

  const documents = graph.docs.map((doc) => ({
    file: doc.file,
    kind: doc.kind,
    words: doc.wordCount,
    headings: doc.headings.length,
    lastModified: graph.mtimes[doc.file] ?? mtimeIso(path.join(graph.dir, doc.file)) ?? '',
  }));

  const facts: Report['facts'] = {
    documents,
    tools: toolNames(graph),
    commands: commandNames(graph),
    configKeys: configKeysOf(graph),
    hasLlmsTxt: Boolean(graph.site.llmsTxt),
    hasAiTxt: Boolean(graph.site.aiTxt),
    jsonLdTypes: [...new Set(jsonLdTypes)],
    robotsAgents: graph.site.robots?.agents ?? [],
    hasSitemap: Boolean(graph.site.sitemap),
  };
  if (graph.packageJson?.name) facts.name = graph.packageJson.name;
  if (graph.packageJson?.version) facts.version = graph.packageJson.version;
  if (graph.packageJson?.license) facts.license = graph.packageJson.license;
  if (graph.packageJson?.description) facts.description = graph.packageJson.description;
  if (graph.declaredUpdatedAt) facts.declaredUpdatedAt = graph.declaredUpdatedAt;
  if (graph.git.lastCommitDate) facts.gitLastCommit = graph.git.lastCommitDate;

  const counts = { errors: 0, warnings: 0, infos: 0 };
  for (const finding of score.findings) {
    if (finding.severity === 'error') counts.errors += 1;
    else if (finding.severity === 'warning') counts.warnings += 1;
    else counts.infos += 1;
  }

  const report: Report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    rulePackVersion: RULE_PACK_VERSION,
    generatedAt: now.toISOString(),
    target: {
      dir: graph.dir,
      ...(graph.packageJson?.name ? { name: graph.packageJson.name } : {}),
      ...(graph.packageJson?.version ? { version: graph.packageJson.version } : {}),
    },
    summary: {
      total: score.total,
      band: band(score.total),
      capped: score.capped,
      errors: counts.errors,
      warnings: counts.warnings,
      infos: counts.infos,
      documents: graph.docs.length,
      filesScanned: graph.files.length,
      durationMs: Date.now() - startedAt,
    },
    ...(score.capReason ? { capReason: score.capReason } : {}),
    dimensions: score.dimensions,
    findings: score.findings,
    advisories: score.advisories,
    facts,
    parseErrors,
  };

  relativizeAnchors(report, graph.dir);
  return { report, graph, ruleErrors };
}

/** Rewrite absolute anchor paths to repository-relative ones for reports. */
function relativizeAnchors(report: Report, dir: string): void {
  const fix = (anchor: { file: string }): void => {
    if (path.isAbsolute(anchor.file)) {
      const relative = path.relative(dir, anchor.file);
      anchor.file = relative.startsWith('..') ? anchor.file : relativeTo(dir, anchor.file);
    }
  };
  for (const finding of report.findings) for (const anchor of finding.anchors) fix(anchor);
  for (const advisory of report.advisories) for (const anchor of advisory.anchors) fix(anchor);
  for (const document of report.facts.documents) {
    if (path.isAbsolute(document.file)) document.file = relativeTo(dir, document.file);
  }
  for (const error of report.parseErrors) {
    if (path.isAbsolute(error.file)) error.file = relativeTo(dir, error.file);
  }
}

/** Human-readable dimension label lookup, used by the renderers. */
export function dimensionLabel(id: string): string {
  return DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? id;
}

export { DIMENSIONS, RULE_PACK, RULE_PACK_VERSION };
