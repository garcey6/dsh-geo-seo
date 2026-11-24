import type { MonitorRun, Report } from './types.js';
export interface HistoryEntry {
    at: string;
    total: number;
    band: string;
    errors: number;
    warnings: number;
    rulePackVersion: string;
    engineVersion: string;
}
export declare function stateRoot(): string;
/** One directory per scanned workspace, keyed by the normalised absolute path. */
export declare function workspaceDir(target: string): string;
export declare function appendHistory(target: string, report: Report): HistoryEntry;
export declare function readHistory(target: string, limit?: number): HistoryEntry[];
export declare function appendMonitorRun(target: string, run: MonitorRun): void;
export declare function readMonitorRuns(target: string, limit?: number): MonitorRun[];
/** Full state snapshot for the panel: last report plus its history. */
export declare function readWorkspaceState(target: string): {
    history: HistoryEntry[];
    monitor: MonitorRun[];
};
export declare function lastTargetFile(): string;
export declare function rememberTarget(target: string): void;
export declare function recallTarget(): string | undefined;
