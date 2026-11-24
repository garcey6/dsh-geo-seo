/**
 * Local, offline state: check history and monitoring records per workspace.
 * Paths live under ~/.dsh/geo-seo (override with DSH_GEO_SEO_HOME for tests).
 * Nothing leaves the machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MonitorRun, Report } from './types.js';
import { sha1 } from './util.js';

export interface HistoryEntry {
  at: string;
  total: number;
  band: string;
  errors: number;
  warnings: number;
  rulePackVersion: string;
  engineVersion: string;
}

export function stateRoot(): string {
  const override = process.env['DSH_GEO_SEO_HOME'];
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), '.dsh', 'geo-seo');
}

/** One directory per scanned workspace, keyed by the normalised absolute path. */
export function workspaceDir(target: string): string {
  const key = sha1(path.resolve(target).toLowerCase()).slice(0, 16);
  return path.join(stateRoot(), 'workspaces', key);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonLines<T>(file: string): T[] {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const out: T[] = [];
    for (const line of raw.split('\n')) {
      const text = line.trim();
      if (!text) continue;
      try {
        out.push(JSON.parse(text) as T);
      } catch {
        // A truncated line is not fatal: the rest of the history is still usable.
      }
    }
    return out;
  } catch {
    return [];
  }
}

function appendJsonLine(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
}

function historyFile(target: string): string {
  return path.join(workspaceDir(target), 'history.jsonl');
}

function monitorFile(target: string): string {
  return path.join(workspaceDir(target), 'monitor.jsonl');
}

export function appendHistory(target: string, report: Report): HistoryEntry {
  const entry: HistoryEntry = {
    at: report.generatedAt,
    total: report.summary.total,
    band: report.summary.band,
    errors: report.summary.errors,
    warnings: report.summary.warnings,
    rulePackVersion: report.rulePackVersion,
    engineVersion: report.engineVersion,
  };
  appendJsonLine(historyFile(target), entry);
  return entry;
}

export function readHistory(target: string, limit = 50): HistoryEntry[] {
  return readJsonLines<HistoryEntry>(historyFile(target)).slice(-limit);
}

export function appendMonitorRun(target: string, run: MonitorRun): void {
  appendJsonLine(monitorFile(target), run);
}

export function readMonitorRuns(target: string, limit = 500): MonitorRun[] {
  return readJsonLines<MonitorRun>(monitorFile(target)).slice(-limit);
}

/** Full state snapshot for the panel: last report plus its history. */
export function readWorkspaceState(target: string): { history: HistoryEntry[]; monitor: MonitorRun[] } {
  return { history: readHistory(target), monitor: readMonitorRuns(target) };
}

export function lastTargetFile(): string {
  return path.join(stateRoot(), 'last-target.txt');
}

export function rememberTarget(target: string): void {
  ensureDir(stateRoot());
  fs.writeFileSync(lastTargetFile(), path.resolve(target), 'utf8');
}

export function recallTarget(): string | undefined {
  try {
    const raw = fs.readFileSync(lastTargetFile(), 'utf8').trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}
