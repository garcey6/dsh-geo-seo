#!/usr/bin/env node
/**
 * geo-seo CLI. All commands are offline by default and never modify the
 * scanned source tree: generated files go to a temporary directory unless
 * --out is given explicitly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCheck } from '../core/engine.js';
import { scanDirectory } from '../core/scan.js';
import { runAudit, auditSummary } from '../core/audit.js';
import { generateAssets } from '../core/generate.js';
import { DIMENSIONS, RULE_PACK, RULE_PACK_VERSION, RULES } from '../core/rules.js';
import {
  MONITOR_QUESTIONS,
  MIN_SAMPLES,
  compareLastRun,
  questionText,
  recordRun,
  summarizeMonitor,
} from '../core/monitor.js';
import {
  appendHistory,
  appendMonitorRun,
  readMonitorRuns,
  rememberTarget,
} from '../core/store.js';
import { renderAudit, renderGenerate, renderMonitor, renderReport } from '../core/render.js';
import type { OutputFormat } from '../core/render.js';
import type { MonitorAnswer } from '../core/types.js';

export const EXIT_OK = 0;
export const EXIT_THRESHOLD = 1;
export const EXIT_USAGE = 2;
export const EXIT_INTERNAL = 3;

const BOOLEAN_FLAGS = new Set([
  'help',
  'version',
  'strict',
  'force',
  'dry-run',
  'color',
  'no-color',
  'json',
  'quiet',
  'questions',
  'no-history',
  'list',
]);

const VALUE_FLAGS = new Set([
  'dir',
  'format',
  'fail-under',
  'out',
  'platform',
  'answers',
  'max-entries',
  'max-findings',
  'note',
]);

export interface ParsedArgs {
  command: string;
  flags: Map<string, string | true>;
  positionals: string[];
}

export class UsageError extends Error {}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  let command = 'help';
  let index = 0;
  if (argv.length > 0 && !argv[0]!.startsWith('-')) {
    command = argv[0]!;
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === '-h') {
      flags.set('help', true);
      continue;
    }
    if (token === '-v') {
      flags.set('version', true);
      continue;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      flags.set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    if (BOOLEAN_FLAGS.has(body)) {
      flags.set(body, true);
      continue;
    }
    if (VALUE_FLAGS.has(body)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError('--' + body + ' needs a value');
      }
      flags.set(body, value);
      index += 1;
      continue;
    }
    throw new UsageError('unknown option --' + body);
  }
  return { command, flags, positionals };
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new UsageError('--' + name + ' must be a number');
  return parsed;
}

function formatOf(args: ParsedArgs): OutputFormat {
  if (args.flags.has('json')) return 'json';
  const value = flagString(args, 'format') ?? 'text';
  if (value !== 'text' && value !== 'json' && value !== 'markdown') {
    throw new UsageError('--format must be text, json or markdown');
  }
  return value;
}

function colorOf(args: ParsedArgs): boolean {
  if (args.flags.has('no-color')) return false;
  if (args.flags.has('color')) return true;
  return Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'];
}

function targetDir(args: ParsedArgs): string {
  const dir = flagString(args, 'dir') ?? process.cwd();
  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new UsageError('not a directory: ' + resolved);
  }
  return resolved;
}

const HELP = [
  'geo-seo - GEO/SEO checks for documentation and plugin repositories',
  '',
  'Usage: geo-seo <command> [options]',
  '',
  'Commands:',
  '  check       score documentation and repository metadata (default output: text)',
  '  generate    write llms.txt, llms-full.txt, ai.txt and structured-data.jsonld',
  '  audit       check crawlability and engine reachability (robots, sitemap, metadata)',
  '  monitor     record or summarise AI answer visibility samples',
  '  rules       list the rule pack, deductions and evidence levels',
  '  version     print the engine and rule pack version',
  '',
  'Options:',
  '  --dir <path>        repository to inspect (default: current directory)',
  '  --format <fmt>      text | json | markdown (default: text)',
  '  --json              same as --format json',
  '  --strict            exit 1 when any error-level finding exists',
  '  --fail-under <n>    exit 1 when the total score is below n',
  '  --out <dir>         output directory for generated assets',
  '  --force             overwrite generated files that already exist',
  '  --dry-run           render assets without writing them',
  '  --max-entries <n>   number of pages listed in llms.txt (10-20, default 20)',
  '  --no-color          disable ANSI colour',
  '  --help, -h          show this help',
  '  --version, -v       print the version',
  '',
  'Monitor:',
  '  geo-seo monitor --questions                print the fixed question bank',
  '  geo-seo monitor --answers <file> --platform <name>',
  '                                             record one sampling run (JSON answers)',
  '  geo-seo monitor                            summarise recorded runs and trend',
  '',
  'Exit codes: 0 ok, 1 threshold or strict failure, 2 usage error, 3 internal error.',
  '',
  'The score never promises rankings, traffic or citations, and no network request',
  'is made unless a monitoring run is recorded by hand.',
].join('\n');

function printVersion(): void {
  process.stdout.write('geo-seo ' + RULE_PACK.version + ' (rule pack ' + RULE_PACK_VERSION + ')\n');
}

function commandCheck(args: ParsedArgs): number {
  const format = formatOf(args);
  const color = colorOf(args);
  const dir = targetDir(args);
  const strict = args.flags.has('strict');
  const failUnder = flagNumber(args, 'fail-under');
  const maxFindings = flagNumber(args, 'max-findings');
  const quiet = args.flags.has('quiet');

  const outcome = runCheck(dir);
  if (!quiet) {
    process.stdout.write(
      renderReport(outcome.report, format, { color, ...(maxFindings !== undefined ? { maxFindings } : {}) }),
    );
  }
  if (!args.flags.has('no-history')) {
    appendHistory(dir, outcome.report);
    rememberTarget(dir);
  }
  const errors = outcome.report.summary.errors;
  if (failUnder !== undefined && outcome.report.summary.total < failUnder) {
    process.stderr.write(
      'score ' + outcome.report.summary.total + ' is below --fail-under ' + failUnder + '\n',
    );
    return EXIT_THRESHOLD;
  }
  if (strict && errors > 0) {
    process.stderr.write(errors + ' error-level finding(s) with --strict\n');
    return EXIT_THRESHOLD;
  }
  return EXIT_OK;
}

function commandGenerate(args: ParsedArgs): number {
  const format = formatOf(args);
  const color = colorOf(args);
  const dir = targetDir(args);
  const out = flagString(args, 'out');
  const force = args.flags.has('force');
  const dryRun = args.flags.has('dry-run');
  const maxEntries = flagNumber(args, 'max-entries');

  const outcome = runCheck(dir);
  const result = generateAssets(outcome.graph, {
    ...(out ? { outDir: path.resolve(out) } : {}),
    ...(force ? { force } : {}),
    ...(dryRun ? { dryRun } : {}),
    ...(maxEntries !== undefined ? { maxEntries } : {}),
  });
  process.stdout.write(renderGenerate(result, format, { color }));
  const refused = result.files.some((file) => !file.written && file.reason && file.reason.startsWith('refused'));
  if (!result.verification.ok || refused) return EXIT_THRESHOLD;
  return EXIT_OK;
}

function commandAudit(args: ParsedArgs): number {
  const format = formatOf(args);
  const color = colorOf(args);
  const dir = targetDir(args);
  const strict = args.flags.has('strict');

  const graph = scanDirectory(dir);
  const result = runAudit(graph);
  process.stdout.write(renderAudit(result, format, { color }));
  if (strict) {
    const counts = auditSummary(result);
    if (counts.errors > 0) {
      process.stderr.write(counts.errors + ' crawlability error(s) with --strict\n');
      return EXIT_THRESHOLD;
    }
  }
  return EXIT_OK;
}

function loadAnswers(file: string): { platform?: string; answers: { questionId: string; mentioned: boolean; cited: boolean; note?: string }[] } {
  let raw: string;
  try {
    raw = fs.readFileSync(path.resolve(file), 'utf8');
  } catch {
    throw new UsageError('cannot read answers file: ' + path.resolve(file));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError('answers file is not valid JSON: ' + path.resolve(file));
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { answers?: unknown }).answers;
  if (!Array.isArray(list)) throw new UsageError('answers file must be an array or { "answers": [...] }');
  const answers = list.map((entry, index) => {
    const item = entry as { questionId?: unknown; mentioned?: unknown; cited?: unknown; note?: unknown };
    if (typeof item.questionId !== 'string') throw new UsageError('answer ' + index + ' has no questionId');
    if (typeof item.mentioned !== 'boolean') throw new UsageError('answer ' + index + ' needs a boolean mentioned');
    return {
      questionId: item.questionId,
      mentioned: item.mentioned,
      cited: Boolean(item.cited),
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    };
  });
  const platform = Array.isArray(parsed) ? undefined : (parsed as { platform?: unknown }).platform;
  return { ...(typeof platform === 'string' ? { platform } : {}), answers };
}

function commandMonitor(args: ParsedArgs): number {
  const format = formatOf(args);
  const color = colorOf(args);
  const dir = targetDir(args);

  if (args.flags.has('questions')) {
    const name = path.basename(dir);
    const rows = MONITOR_QUESTIONS.map((question) => ({
      id: question.id,
      intent: question.intent,
      text: questionText(question, name),
    }));
    if (format === 'json') {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    } else {
      process.stdout.write('Question bank (' + rows.length + ' questions, fixed for comparability)\n\n');
      for (const row of rows) process.stdout.write('  ' + row.id + '  [' + row.intent + '] ' + row.text + '\n');
    }
    return EXIT_OK;
  }

  const answersFile = flagString(args, 'answers');
  if (answersFile) {
    const platform = flagString(args, 'platform') ?? 'unspecified';
    const loaded = loadAnswers(answersFile);
    const run = recordRun({
      target: dir,
      name: path.basename(dir),
      platform,
      answers: loaded.answers.map((answer) => ({ ...answer, platform })),
    });
    appendMonitorRun(dir, run);
    const summary = summarizeMonitor(readMonitorRuns(dir));
    process.stdout.write(renderMonitor(summary, format, { color }));
    const compared = compareLastRun(readMonitorRuns(dir));
    if (compared && !summary.insufficientSample) {
      process.stdout.write(
        '\nchange vs previous runs: mention ' +
          (compared.mentionDelta === null ? 'n/a' : (compared.mentionDelta * 100).toFixed(1) + 'pp') +
          ', citation ' +
          (compared.citationDelta === null ? 'n/a' : (compared.citationDelta * 100).toFixed(1) + 'pp') +
          '\n',
      );
    }
    return EXIT_OK;
  }

  const runs = readMonitorRuns(dir);
  if (runs.length === 0) {
    process.stderr.write(
      'no monitoring runs recorded for ' +
        dir +
        '\nrecord one with: geo-seo monitor --answers answers.json --platform <name>\n',
    );
    return EXIT_THRESHOLD;
  }
  const summary = summarizeMonitor(runs);
  process.stdout.write(renderMonitor(summary, format, { color }));
  process.stdout.write('\nminimum for a trend claim: ' + MIN_SAMPLES + ' samples\n');
  return EXIT_OK;
}

function commandRules(args: ParsedArgs): number {
  const format = formatOf(args);
  if (format === 'json') {
    process.stdout.write(JSON.stringify({ pack: RULE_PACK, dimensions: DIMENSIONS, rules: RULES }, null, 2) + '\n');
    return EXIT_OK;
  }
  const lines: string[] = [];
  lines.push('Rule pack ' + RULE_PACK.version + ' (released ' + RULE_PACK.released + ')');
  lines.push('');
  for (const dimension of DIMENSIONS) {
    lines.push(dimension.label.toUpperCase() + ' - ' + dimension.weight + ' points');
    lines.push('  ' + dimension.purpose);
    for (const rule of RULES.filter((entry) => entry.dimension === dimension.id)) {
      lines.push(
        '  ' +
          rule.id +
          '  -' +
          rule.deduction +
          '  [' +
          rule.severity +
          '/' +
          rule.evidence +
          '] ' +
          rule.title,
      );
      lines.push('      ' + rule.rationale);
    }
    lines.push('');
  }
  lines.push('Negative deductions are capped at each dimension weight; the total is capped at 60 when');
  lines.push('a blocking compliance rule fires. Formatting hints are listed separately and score 0.');
  process.stdout.write(lines.join('\n') + '\n');
  return EXIT_OK;
}

export async function main(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.stderr.write('run geo-seo --help\n');
    return EXIT_USAGE;
  }
  if (args.flags.has('help') || args.command === 'help') {
    process.stdout.write(HELP + '\n');
    return EXIT_OK;
  }
  if (args.flags.has('version') || args.command === 'version') {
    printVersion();
    return EXIT_OK;
  }
  try {
    switch (args.command) {
      case 'check':
        return commandCheck(args);
      case 'generate':
        return commandGenerate(args);
      case 'audit':
        return commandAudit(args);
      case 'monitor':
        return commandMonitor(args);
      case 'rules':
        return commandRules(args);
      default:
        process.stderr.write('unknown command: ' + args.command + '\n');
        process.stderr.write(HELP + '\n');
        return EXIT_USAGE;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(error.message + '\n');
      return EXIT_USAGE;
    }
    process.stderr.write('internal error: ' + (error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
    return EXIT_INTERNAL;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
      process.exitCode = EXIT_INTERNAL;
    });
}
