/**
 * Small, dependency-free helpers used across the kernel.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function relativeTo(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}

export function exists(target: string): boolean {
  try {
    fs.accessSync(target);
    return true;
  } catch {
    return false;
  }
}

export function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function readTextSafe(file: string, limit = 4 * 1024 * 1024): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > limit) return undefined;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function mtimeIso(file: string): string | undefined {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return undefined;
  }
}

const DEFAULT_IGNORE = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.cache',
  '.turbo', 'vendor', '.venv', '__pycache__', '.idea', '.vscode', 'tmp', '.geo-seo',
]);

export interface ListOptions {
  maxDepth?: number;
  maxFiles?: number;
  ignore?: Set<string>;
}

/** Walks a directory tree, returning POSIX-style paths relative to `root`. */
export function listFiles(root: string, options: ListOptions = {}): string[] {
  const maxDepth = options.maxDepth ?? 8;
  const maxFiles = options.maxFiles ?? 4000;
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const out: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || out.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        out.push(relativeTo(root, full));
      }
    }
  };

  walk(root, 0);
  return out.sort();
}

export function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/** Counts Latin words plus CJK characters, so Chinese docs are not scored as empty. */
export function countWords(text: string): number {
  if (!text) return 0;
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9'_\-]*/g)?.length ?? 0;
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  return latin + cjk;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Lowercases and collapses whitespace: the canonical form for text searches. */
export function lower(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_|-]{2,}/g, ' ');
}

export function clip(text: string, max: number): string {
  const flat = normalizeWhitespace(text);
  return flat.length <= max ? flat : flat.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Parses the date formats that actually show up in READMEs and package.json.
 * Returns an ISO date (UTC midnight) so comparisons are stable.
 */
export function parseDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const text = input.trim();
  if (!text) return undefined;

  let m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (m) {
    const month = MONTHS.indexOf((m[1] ?? '').slice(0, 3).toLowerCase());
    if (month >= 0) return iso(Number(m[3]), month + 1, Number(m[2]));
  }

  m = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/.exec(text);
  if (m) {
    const month = MONTHS.indexOf((m[2] ?? '').slice(0, 3).toLowerCase());
    if (month >= 0) return iso(Number(m[3]), month + 1, Number(m[1]));
  }

  return undefined;
}

function iso(year: number, month: number, day: number): string | undefined {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso + 'T00:00:00Z');
  const to = Date.parse(toIso + 'T00:00:00Z');
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function containsAny(haystack: string, needles: readonly string[]): string | undefined {
  for (const needle of needles) {
    if (haystack.includes(needle)) return needle;
  }
  return undefined;
}

export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MiB';
}
