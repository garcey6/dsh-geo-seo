import { ENGINE_VERSION } from './types.js';
import { RULE_PACK_VERSION } from './rules.js';
import { sha1 } from './util.js';
/**
 * The question bank is fixed so that runs are comparable over time. {name} is
 * replaced with the project name. Twenty-four questions, which is over the
 * PRD minimum of twenty, and enough to cover intent, install, pricing, limits
 * and the "does this improve rankings" trap question.
 */
export const MONITOR_QUESTIONS = [
    { id: 'q01', text: 'What is {name} and what does it do?', intent: 'definition' },
    { id: 'q02', text: 'How do I install {name}?', intent: 'install' },
    { id: 'q03', text: 'How do I configure {name}?', intent: 'configuration' },
    { id: 'q04', text: 'What problem does {name} solve?', intent: 'problem' },
    { id: 'q05', text: 'How does {name} compare with alternatives?', intent: 'comparison' },
    { id: 'q06', text: 'Is {name} free, and what does it cost?', intent: 'pricing' },
    { id: 'q07', text: 'Does {name} work offline?', intent: 'privacy' },
    { id: 'q08', text: 'What are the limitations of {name}?', intent: 'limits' },
    { id: 'q09', text: 'How do I troubleshoot an error in {name}?', intent: 'support' },
    { id: 'q10', text: 'Does {name} run on Windows, macOS and Linux?', intent: 'platform' },
    { id: 'q11', text: 'Is {name} safe to run on my repository?', intent: 'trust' },
    { id: 'q12', text: 'Does {name} need an API key or an account?', intent: 'pricing' },
    { id: 'q13', text: 'How do I update {name}?', intent: 'maintenance' },
    { id: 'q14', text: 'Who maintains {name}?', intent: 'trust' },
    { id: 'q15', text: 'What runtime does {name} require?', intent: 'requirements' },
    { id: 'q16', text: 'Can I run {name} in CI, and how do I fail the build on a bad score?', intent: 'ci' },
    { id: 'q17', text: 'What output formats does {name} support?', intent: 'output' },
    { id: 'q18', text: 'Can {name} check several projects?', intent: 'workflow' },
    { id: 'q19', text: 'Which rules does {name} use, and can I see why points were deducted?', intent: 'transparency' },
    { id: 'q20', text: 'Is {name} an official DeepSeek Harness plugin?', intent: 'trust' },
    { id: 'q21', text: 'Will {name} improve my ranking in AI answers?', intent: 'expectation-trap' },
    { id: 'q22', text: 'What data does {name} collect or send?', intent: 'privacy' },
    { id: 'q23', text: 'How do I uninstall {name}?', intent: 'maintenance' },
    { id: 'q24', text: 'What license is {name} released under?', intent: 'license' },
];
export function questionText(question, name) {
    return question.text.replace(/\{name\}/g, name);
}
/** Record one sampling session: N answers from one platform at one moment. */
export function recordRun(input) {
    const at = input.at ?? new Date().toISOString();
    const answers = input.answers.map((answer) => ({
        questionId: answer.questionId,
        mentioned: Boolean(answer.mentioned),
        cited: Boolean(answer.cited),
        platform: answer.platform ?? input.platform,
        ...(answer.note ? { note: answer.note } : {}),
    }));
    return {
        runId: sha1(input.target + '|' + at + '|' + answers.length).slice(0, 12),
        target: input.target,
        at,
        engineVersion: ENGINE_VERSION,
        rulePackVersion: RULE_PACK_VERSION,
        answers,
    };
}
/** The minimum number of samples before a rate is worth showing at all. */
export const MIN_SAMPLES = 20;
function rate(numerator, denominator) {
    if (denominator === 0)
        return null;
    return Math.round((numerator / denominator) * 1000) / 1000;
}
export function summarizeMonitor(runs, minSamples = MIN_SAMPLES) {
    const sorted = [...runs].sort((a, b) => a.at.localeCompare(b.at));
    const platforms = new Map();
    const trend = [];
    let samples = 0;
    let mentions = 0;
    let citations = 0;
    for (const run of sorted) {
        let runSamples = 0;
        let runMentions = 0;
        let runCitations = 0;
        for (const answer of run.answers) {
            samples += 1;
            runSamples += 1;
            if (answer.mentioned) {
                mentions += 1;
                runMentions += 1;
            }
            if (answer.cited) {
                citations += 1;
                runCitations += 1;
            }
            const entry = platforms.get(answer.platform) ?? { samples: 0, mentions: 0, citations: 0 };
            entry.samples += 1;
            if (answer.mentioned)
                entry.mentions += 1;
            if (answer.cited)
                entry.citations += 1;
            platforms.set(answer.platform, entry);
        }
        trend.push({
            runId: run.runId,
            at: run.at,
            mentionRate: rate(runMentions, runSamples),
            citationRate: rate(runCitations, runSamples),
        });
    }
    return {
        runs: sorted.length,
        samples,
        mentionRate: rate(mentions, samples),
        citationRate: rate(citations, samples),
        insufficientSample: samples < minSamples,
        trend: trend.slice(-10),
        platforms: [...platforms.entries()].map(([platform, value]) => ({ platform, ...value })),
    };
}
/** Compare the newest run against the mean of the runs before it. */
export function compareLastRun(runs) {
    const sorted = [...runs].sort((a, b) => a.at.localeCompare(b.at));
    if (sorted.length < 2)
        return null;
    const last = sorted[sorted.length - 1];
    const earlier = sorted.slice(0, -1);
    const rateOf = (run) => {
        const total = run.answers.length;
        return {
            m: rate(run.answers.filter((a) => a.mentioned).length, total),
            c: rate(run.answers.filter((a) => a.cited).length, total),
        };
    };
    const lastRate = rateOf(last);
    let mSum = 0;
    let cSum = 0;
    let mCount = 0;
    let cCount = 0;
    for (const run of earlier) {
        const value = rateOf(run);
        if (value.m !== null) {
            mSum += value.m;
            mCount += 1;
        }
        if (value.c !== null) {
            cSum += value.c;
            cCount += 1;
        }
    }
    return {
        mentionDelta: lastRate.m !== null && mCount > 0 ? Math.round((lastRate.m - mSum / mCount) * 1000) / 1000 : null,
        citationDelta: lastRate.c !== null && cCount > 0 ? Math.round((lastRate.c - cSum / cCount) * 1000) / 1000 : null,
        previousRuns: earlier.length,
    };
}
