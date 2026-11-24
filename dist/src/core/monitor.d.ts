/**
 * F5: visibility monitoring. A fixed question bank is asked to whichever AI
 * engines the user samples, and the answers are recorded as facts: was the
 * project mentioned, and did the answer cite this site? Nothing is inferred
 * beyond those two booleans, and small samples are labelled as such.
 */
import type { MonitorQuestion, MonitorRun, MonitorSummary } from './types.js';
/**
 * The question bank is fixed so that runs are comparable over time. {name} is
 * replaced with the project name. Twenty-four questions, which is over the
 * PRD minimum of twenty, and enough to cover intent, install, pricing, limits
 * and the "does this improve rankings" trap question.
 */
export declare const MONITOR_QUESTIONS: MonitorQuestion[];
export declare function questionText(question: MonitorQuestion, name: string): string;
/** Record one sampling session: N answers from one platform at one moment. */
export declare function recordRun(input: {
    target: string;
    name: string;
    platform: string;
    at?: string;
    answers: {
        questionId: string;
        mentioned: boolean;
        cited: boolean;
        platform?: string;
        note?: string;
    }[];
}): MonitorRun;
/** The minimum number of samples before a rate is worth showing at all. */
export declare const MIN_SAMPLES = 20;
export declare function summarizeMonitor(runs: MonitorRun[], minSamples?: number): MonitorSummary;
/** Compare the newest run against the mean of the runs before it. */
export declare function compareLastRun(runs: MonitorRun[]): {
    mentionDelta: number | null;
    citationDelta: number | null;
    previousRuns: number;
} | null;
