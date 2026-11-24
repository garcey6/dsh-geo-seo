/**
 * Presentation layer. It only formats values produced by the engine: no rule
 * runs here, and no claim is added that the facts do not support.
 */
import type { Advisory, Anchor, AuditResult, DimensionScore, Finding, GenerateResult, MonitorSummary, Report } from './types.js';

export type OutputFormat = 'text' | 'json' | 'markdown';

export interface RenderOptions {
  /** Colourise terminal output; ignored for json. */
  color?: boolean;
  /** Cap on findings shown in text mode. */
  maxFindings?: number;
}

const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
} as const;

const TICK = '\u0060';

function makePaint(enabled: boolean) {
  const paint = (code: string, text: string): string => (enabled ? code + text + CODES.reset : text);
  return {
    bold: (text: string) => paint(CODES.bold, text),
    dim: (text: string) => paint(CODES.dim, text),
    red: (text: string) => paint(CODES.red, text),
    yellow: (text: string) => paint(CODES.yellow, text),
    green: (text: string) => paint(CODES.green, text),
    cyan: (text: string) => paint(CODES.cyan, text),
  };
}

function bar(score: number, weight: number, width = 12): string {
  const ratio = weight === 0 ? 0 : Math.max(0, Math.min(1, score / weight));
  const filled = Math.round(ratio * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function anchorText(anchor: Anchor): string {
  const line = anchor.line ? ':' + anchor.line : '';
  return anchor.path ? anchor.file + line + ' (' + anchor.path + ')' : anchor.file + line;
}

function severityLabel(severity: string): string {
  if (severity === 'error') return 'ERROR';
  if (severity === 'warning') return 'WARN ';
  return 'INFO ';
}

function pct(value: number | null): string {
  if (value === null) return 'n/a';
  return (value * 100).toFixed(1) + '%';
}

export function bandLabel(band: Report['summary']['band']): string {
  switch (band) {
    case 'excellent':
      return 'excellent';
    case 'good':
      return 'good';
    case 'fair':
      return 'fair';
    default:
      return 'poor';
  }
}

export function renderFindings(findings: Finding[], options: RenderOptions = {}): string[] {
  const paint = makePaint(Boolean(options.color));
  const limit = options.maxFindings ?? findings.length;
  const out: string[] = [];
  for (const finding of findings.slice(0, limit)) {
    const severity =
      finding.severity === 'error'
        ? paint.red(severityLabel(finding.severity))
        : finding.severity === 'warning'
          ? paint.yellow(severityLabel(finding.severity))
          : paint.dim(severityLabel(finding.severity));
    const deduction = finding.deduction > 0 ? ' -' + finding.deduction : '';
    out.push(severity + ' ' + paint.bold(finding.ruleId + deduction) + '  ' + finding.title);
    out.push('        ' + finding.detail);
    out.push('        ' + paint.cyan('fix') + ': ' + finding.suggestion);
    if (finding.anchors.length > 0) {
      out.push('        ' + paint.dim('at ' + finding.anchors.map(anchorText).join(', ')));
    }
    out.push('        ' + paint.dim('evidence: ' + finding.evidence));
  }
  if (findings.length > limit) {
    out.push(paint.dim('... ' + (findings.length - limit) + ' more finding(s); use --format json for all'));
  }
  return out;
}

function renderAdvisories(advisories: Advisory[], options: RenderOptions): string[] {
  const paint = makePaint(Boolean(options.color));
  if (advisories.length === 0) return [];
  const out = [paint.bold('Formatting hints (not scored)')];
  for (const advisory of advisories) {
    out.push('  ' + paint.dim(advisory.ruleId) + ' ' + advisory.title + ' \u2014 ' + advisory.suggestion);
    if (advisory.anchors.length > 0) out.push('      ' + paint.dim(advisory.anchors.map(anchorText).join(', ')));
  }
  return out;
}

function headerLines(report: Report, options: RenderOptions): string[] {
  const paint = makePaint(Boolean(options.color));
  const name = report.target.name ?? report.target.dir;
  const version = report.target.version ? ' v' + report.target.version : '';
  return [
    paint.bold('GEO/SEO check') + ' \u2014 ' + name + version,
    paint.dim(report.target.dir),
    paint.dim(
      'generated ' +
        report.generatedAt +
        ' \u00b7 engine ' +
        report.engineVersion +
        ' \u00b7 rule pack ' +
        report.rulePackVersion,
    ),
    '',
  ];
}

function scoreLines(report: Report, options: RenderOptions): string[] {
  const paint = makePaint(Boolean(options.color));
  const total = report.summary.total;
  const colour = total >= 85 ? paint.green : total >= 50 ? paint.yellow : paint.red;
  const out = [colour(paint.bold(String(total))) + paint.dim(' / 100') + '  ' + bandLabel(report.summary.band), ''];
  const labelWidth = Math.max(...report.dimensions.map((dimension) => dimension.label.length)) + 2;
  for (const dimension of report.dimensions) {
    const line =
      '  ' +
      dimension.label.padEnd(labelWidth) +
      bar(dimension.score, dimension.weight) +
      '  ' +
      String(dimension.score).padStart(3) +
      '/' +
      String(dimension.weight).padEnd(3);
    out.push(dimension.score === dimension.weight ? paint.green(line) : line);
  }
  out.push('');
  out.push(
    paint.dim(
      '  ' +
        report.summary.filesScanned +
        ' files, ' +
        report.summary.documents +
        ' docs, ' +
        report.summary.errors +
        ' errors, ' +
        report.summary.warnings +
        ' warnings, ' +
        report.summary.durationMs +
        'ms',
    ),
  );
  if (report.summary.capped) {
    out.push('');
    out.push(paint.yellow('  Score capped: ' + (report.capReason ?? 'a blocking compliance issue was found')));
  }
  return out;
}

export function renderReport(report: Report, format: OutputFormat = 'text', options: RenderOptions = {}): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';

  const paint = makePaint(Boolean(options.color));
  if (format === 'markdown') {
    const lines: string[] = [];
    lines.push('## GEO/SEO check \u2014 ' + (report.target.name ?? report.target.dir));
    lines.push('');
    lines.push('**Score: ' + report.summary.total + ' / 100 (' + bandLabel(report.summary.band) + ')**');
    if (report.summary.capped) {
      lines.push('');
      lines.push('> Score capped: ' + (report.capReason ?? 'blocking compliance issue'));
    }
    lines.push('');
    lines.push('| Dimension | Score | Max |');
    lines.push('| --- | ---: | ---: |');
    for (const dimension of report.dimensions) {
      lines.push('| ' + dimension.label + ' | ' + dimension.score + ' | ' + dimension.weight + ' |');
    }
    lines.push('');
    if (report.findings.length > 0) {
      lines.push('### Findings');
      lines.push('');
      for (const finding of report.findings) {
        const deduction = finding.deduction > 0 ? ' (-' + finding.deduction + ')' : '';
        const anchors =
          finding.anchors.length > 0 ? ' ' + finding.anchors.map((anchor) => TICK + anchorText(anchor) + TICK).join(', ') : '';
        lines.push(
          '- **' +
            finding.severity +
            '** ' +
            TICK +
            finding.ruleId +
            TICK +
            deduction +
            ' ' +
            finding.title +
            ' \u2014 ' +
            finding.suggestion +
            anchors,
        );
      }
      lines.push('');
    }
    if (report.advisories.length > 0) {
      lines.push('### Formatting hints (not scored)');
      lines.push('');
      for (const advisory of report.advisories) lines.push('- ' + advisory.title + ' \u2014 ' + advisory.suggestion);
      lines.push('');
    }
    lines.push(
      '<sub>engine ' + report.engineVersion + ' \u00b7 rule pack ' + report.rulePackVersion + ' \u00b7 ' + report.generatedAt + '</sub>',
    );
    return lines.join('\n') + '\n';
  }

  const lines = [...headerLines(report, options), ...scoreLines(report, options)];
  if (report.findings.length > 0) {
    lines.push('', paint.bold('Findings'));
    lines.push(...renderFindings(report.findings, options));
  } else {
    lines.push('', paint.green('No findings: every scored check passed.'));
  }
  const advisories = renderAdvisories(report.advisories, options);
  if (advisories.length > 0) lines.push('', ...advisories);
  if (report.parseErrors.length > 0) {
    lines.push('', paint.yellow('Parse errors'));
    for (const error of report.parseErrors) lines.push('  ' + error.file + ': ' + error.message);
  }
  lines.push('', paint.dim('No ranking, traffic or citation outcome is promised by this score.'));
  return lines.join('\n') + '\n';
}

export function renderAudit(result: AuditResult, format: OutputFormat = 'text', options: RenderOptions = {}): string {
  if (format === 'json') return JSON.stringify(result, null, 2) + '\n';
  const paint = makePaint(Boolean(options.color));
  if (format === 'markdown') {
    const lines = ['## Crawlability audit', '', '| Scope | Severity | Rule | Finding |', '| --- | --- | --- | --- |'];
    for (const finding of result.findings) {
      lines.push('| ' + finding.scope + ' | ' + finding.severity + ' | ' + finding.ruleId + ' | ' + finding.title + ' |');
    }
    if (result.findings.length === 0) lines.push('| \u2014 | \u2014 | \u2014 | No crawlability problems found |');
    lines.push('');
    for (const note of result.notes) lines.push('> ' + note);
    return lines.join('\n') + '\n';
  }
  const lines = [paint.bold('Crawlability audit'), ''];
  for (const scope of ['international', 'domestic'] as const) {
    const findings = result.findings.filter((finding) => finding.scope === scope);
    lines.push(paint.bold(scope === 'international' ? 'International (AI crawlers)' : 'Domestic (Chinese engines)'));
    if (findings.length === 0) lines.push('  ' + paint.green('no problems found in the local configuration'));
    for (const finding of findings) {
      const label =
        finding.severity === 'error'
          ? paint.red(severityLabel(finding.severity))
          : finding.severity === 'warning'
            ? paint.yellow(severityLabel(finding.severity))
            : paint.dim(severityLabel(finding.severity));
      lines.push('  ' + label + ' ' + finding.ruleId + ' ' + finding.title);
      lines.push('        ' + finding.detail);
      lines.push('        ' + paint.cyan('fix') + ': ' + finding.suggestion);
      if (finding.anchors.length > 0) lines.push('        ' + paint.dim(finding.anchors.map(anchorText).join(', ')));
    }
    lines.push('');
  }
  lines.push(paint.bold('Notes'));
  for (const note of result.notes) lines.push('  - ' + note);
  return lines.join('\n') + '\n';
}

export function renderGenerate(result: GenerateResult, format: OutputFormat = 'text', options: RenderOptions = {}): string {
  if (format === 'json') return JSON.stringify(result, null, 2) + '\n';
  const paint = makePaint(Boolean(options.color));
  if (format === 'markdown') {
    const lines = ['## Generated assets', '', '| File | Bytes | Status |', '| --- | ---: | --- |'];
    for (const file of result.files) {
      const status = file.written ? 'written' : 'skipped: ' + (file.reason ?? '');
      lines.push('| ' + TICK + file.path + TICK + ' | ' + file.bytes + ' | ' + status + ' |');
    }
    lines.push('');
    lines.push(
      result.verification.ok
        ? 'Consistency check passed (' + result.verification.checkedFacts + ' facts).'
        : 'Consistency check failed: ' +
            result.verification.mismatches.map((mismatch) => mismatch.claim + ' != ' + mismatch.evidence).join('; '),
    );
    return lines.join('\n') + '\n';
  }
  const lines = [paint.bold('Generated assets') + (result.dryRun ? paint.dim(' (dry run)') : ''), ''];
  for (const file of result.files) {
    if (file.written) {
      lines.push('  ' + paint.green('written') + '  ' + file.path + paint.dim('  ' + file.bytes + ' bytes'));
    } else if (file.reason) {
      lines.push('  ' + paint.yellow('skipped') + '  ' + file.path + '  ' + file.reason);
    }
  }
  lines.push('');
  if (result.verification.ok) {
    lines.push(paint.green('Consistency check passed') + paint.dim(' (' + result.verification.checkedFacts + ' facts verified)'));
  } else {
    lines.push(paint.red('Consistency check failed'));
    for (const mismatch of result.verification.mismatches) {
      lines.push('  ' + mismatch.kind + ': claim "' + mismatch.claim + '" != source "' + mismatch.evidence + '"');
    }
  }
  lines.push('', paint.dim('Files carry a source comment header; review them before publishing.'));
  return lines.join('\n') + '\n';
}

export function renderMonitor(summary: MonitorSummary, format: OutputFormat = 'text', options: RenderOptions = {}): string {
  if (format === 'json') return JSON.stringify(summary, null, 2) + '\n';
  const paint = makePaint(Boolean(options.color));
  if (format === 'markdown') {
    const lines = ['## Visibility monitoring', '', '| Metric | Value |', '| --- | --- |'];
    lines.push('| Runs | ' + summary.runs + ' |');
    lines.push('| Samples | ' + summary.samples + ' |');
    lines.push('| Mentioned | ' + pct(summary.mentionRate) + ' |');
    lines.push('| Cited this site | ' + pct(summary.citationRate) + ' |');
    lines.push('');
    if (summary.insufficientSample) {
      lines.push('> Fewer than 20 samples: the rates above are anecdotal and not statistically meaningful.');
    }
    return lines.join('\n') + '\n';
  }
  const lines = [paint.bold('Visibility monitoring'), ''];
  lines.push('  runs:       ' + summary.runs);
  lines.push('  samples:    ' + summary.samples);
  lines.push('  mentioned:  ' + pct(summary.mentionRate));
  lines.push('  cited:      ' + pct(summary.citationRate));
  if (summary.insufficientSample) {
    lines.push('', paint.yellow('  Fewer than 20 samples: the rates above are anecdotal and not statistically meaningful.'));
  }
  if (summary.platforms.length > 0) {
    lines.push('', paint.bold('Per platform'));
    for (const platform of summary.platforms) {
      lines.push(
        '  ' +
          platform.platform.padEnd(18) +
          String(platform.samples).padStart(4) +
          ' samples  ' +
          pct(platform.mentions / Math.max(1, platform.samples)) +
          ' mentioned  ' +
          pct(platform.citations / Math.max(1, platform.samples)) +
          ' cited',
      );
    }
  }
  if (summary.trend.length > 0) {
    lines.push('', paint.bold('Trend'));
    for (const point of summary.trend) {
      lines.push(
        '  ' + point.at.slice(0, 19).replace('T', ' ') + '  mentioned ' + pct(point.mentionRate) + '  cited ' + pct(point.citationRate),
      );
    }
  }
  lines.push('', paint.dim('Only observed facts are recorded; no effect is attributed to this tool.'));
  return lines.join('\n') + '\n';
}

export function dimensionLabelOf(dimensions: DimensionScore[], id: string): string {
  return dimensions.find((dimension) => dimension.id === id)?.label ?? id;
}
