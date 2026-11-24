/**
 * Local, offline state: check history and monitoring records per workspace.
 * Paths live under ~/.dsh/geo-seo (override with DSH_GEO_SEO_HOME for tests).
 * Nothing leaves the machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sha1 } from './util.js';
export function stateRoot() {
    const override = process.env['DSH_GEO_SEO_HOME'];
    if (override && override.trim())
        return path.resolve(override.trim());
    return path.join(os.homedir(), '.dsh', 'geo-seo');
}
/** One directory per scanned workspace, keyed by the normalised absolute path. */
export function workspaceDir(target) {
    const key = sha1(path.resolve(target).toLowerCase()).slice(0, 16);
    return path.join(stateRoot(), 'workspaces', key);
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
function readJsonLines(file) {
    try {
        const raw = fs.readFileSync(file, 'utf8');
        const out = [];
        for (const line of raw.split('\n')) {
            const text = line.trim();
            if (!text)
                continue;
            try {
                out.push(JSON.parse(text));
            }
            catch {
                // A truncated line is not fatal: the rest of the history is still usable.
            }
        }
        return out;
    }
    catch {
        return [];
    }
}
function appendJsonLine(file, value) {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
}
function historyFile(target) {
    return path.join(workspaceDir(target), 'history.jsonl');
}
function monitorFile(target) {
    return path.join(workspaceDir(target), 'monitor.jsonl');
}
export function appendHistory(target, report) {
    const entry = {
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
export function readHistory(target, limit = 50) {
    return readJsonLines(historyFile(target)).slice(-limit);
}
export function appendMonitorRun(target, run) {
    appendJsonLine(monitorFile(target), run);
}
export function readMonitorRuns(target, limit = 500) {
    return readJsonLines(monitorFile(target)).slice(-limit);
}
/** Full state snapshot for the panel: last report plus its history. */
export function readWorkspaceState(target) {
    return { history: readHistory(target), monitor: readMonitorRuns(target) };
}
export function lastTargetFile() {
    return path.join(stateRoot(), 'last-target.txt');
}
export function rememberTarget(target) {
    ensureDir(stateRoot());
    fs.writeFileSync(lastTargetFile(), path.resolve(target), 'utf8');
}
export function recallTarget() {
    try {
        const raw = fs.readFileSync(lastTargetFile(), 'utf8').trim();
        return raw || undefined;
    }
    catch {
        return undefined;
    }
}
