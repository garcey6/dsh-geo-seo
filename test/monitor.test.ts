import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MONITOR_QUESTIONS,
  MIN_SAMPLES,
  recordRun,
  summarizeMonitor,
  compareLastRun,
  questionText,
} from '../src/core/monitor.js';

function answers(count: number, mentionedEvery: number, platform = 'perplexity') {
  return MONITOR_QUESTIONS.slice(0, count).map((question, index) => ({
    questionId: question.id,
    mentioned: index % mentionedEvery === 0,
    cited: index % (mentionedEvery * 2) === 0,
    platform,
  }));
}

test('the question bank holds at least 20 stable, unique questions', () => {
  assert.ok(MONITOR_QUESTIONS.length >= 20);
  const ids = MONITOR_QUESTIONS.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(MONITOR_QUESTIONS.every((question) => question.text.length > 10));
  assert.ok(questionText(MONITOR_QUESTIONS[0]!, 'sample-plugin').includes('sample-plugin'));
});

test('a sample below the threshold is flagged as not statistically meaningful', () => {
  const run = recordRun({ target: '/tmp/x', name: 'sample-plugin', platform: 'perplexity', answers: answers(5, 2) });
  const summary = summarizeMonitor([run]);
  assert.equal(summary.samples, 5);
  assert.equal(summary.insufficientSample, true);
  assert.equal(summary.mentionRate, 0.6);
});

test('a full sample produces rates, platforms and a capped trend', () => {
  const run = recordRun({
    target: '/tmp/x',
    name: 'sample-plugin',
    platform: 'perplexity',
    answers: answers(MONITOR_QUESTIONS.length, 4),
  });
  const summary = summarizeMonitor([run]);
  assert.equal(summary.samples, MONITOR_QUESTIONS.length);
  assert.ok(summary.samples >= MIN_SAMPLES);
  assert.equal(summary.insufficientSample, false);
  assert.equal(summary.runs, 1);
  assert.ok(summary.mentionRate !== null && summary.mentionRate > 0 && summary.mentionRate < 1);
  assert.equal(summary.platforms.length, 1);
  assert.ok(summary.trend.length <= 10);
});

test('two runs yield a delta against the previous sample', () => {
  const first = recordRun({
    target: '/tmp/x',
    name: 'sample-plugin',
    platform: 'perplexity',
    at: '2026-01-01T00:00:00.000Z',
    answers: MONITOR_QUESTIONS.slice(0, 20).map((question) => ({
      questionId: question.id, mentioned: true, cited: true, platform: 'perplexity',
    })),
  });
  const second = recordRun({
    target: '/tmp/x',
    name: 'sample-plugin',
    platform: 'perplexity',
    at: '2026-02-01T00:00:00.000Z',
    answers: MONITOR_QUESTIONS.slice(0, 20).map((question) => ({
      questionId: question.id, mentioned: false, cited: false, platform: 'perplexity',
    })),
  });
  const comparison = compareLastRun([first, second]);
  assert.ok(comparison);
  assert.equal(comparison?.previousRuns, 1);
  assert.ok((comparison?.mentionDelta ?? 0) < 0);
});

test('no runs at all is handled without a claim', () => {
  const summary = summarizeMonitor([]);
  assert.equal(summary.mentionRate, null);
  assert.equal(summary.insufficientSample, true);
  assert.equal(compareLastRun([]), null);
});
