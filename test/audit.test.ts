import test from 'node:test';
import assert from 'node:assert/strict';

import { runAudit, auditSummary, AUDIT_NOTES } from '../src/core/audit.js';
import { scanDirectory } from '../src/core/scan.js';
import { parseRobots, robotsAllows } from '../src/core/site.js';
import { makeWorkspace, healthyReadme } from './helpers.js';

function site(files: Record<string, string>): ReturnType<typeof scanDirectory> {
  return scanDirectory(makeWorkspace({ 'README.md': healthyReadme(), ...files }));
}

test('the audit always states what robots.txt can and cannot promise', () => {
  assert.ok(AUDIT_NOTES.length >= 2);
  const joined = AUDIT_NOTES.join(' ');
  assert.match(joined, /robots/i);
  // The PRD is explicit: allowing crawlers is not the same as being citable.
  assert.match(joined, /(crawl|citab|referenc|引用|收录)/i);
});

test('a repository with no robots.txt is reported', () => {
  const result = runAudit(site({}));
  assert.ok(result.findings.some((finding) => finding.ruleId === 'AUD-INT-001'));
  assert.deepEqual(result.notes, AUDIT_NOTES);
});

test('blocking a major AI crawler is an international finding', () => {
  const result = runAudit(site({
    'public/robots.txt': 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n',
  }));
  const blocked = result.findings.find((finding) => finding.ruleId === 'AUD-INT-002');
  assert.ok(blocked, 'expected a blocked-crawler finding');
  assert.equal(blocked?.scope, 'international');
  assert.ok(blocked?.detail.toLowerCase().includes('gptbot'));
});

test('a healthy site passes the crawlability checks it can control', () => {
  const result = runAudit(site({
    'public/robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
    'public/sitemap.xml': '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>',
    'public/index.html': '<!doctype html><html><head><meta name="viewport" content="width=device-width">'
      + '<link rel="canonical" href="https://example.com/"></head><body>'
      + 'Sample Plugin checks a repository for machine-readable documentation and reports what is missing. '
      + 'It parses Markdown, records findings with anchors, and renders a report with suggestions.'
      + '</body></html>',
  }));
  const blocking = result.findings.filter((finding) => finding.severity === 'error');
  assert.deepEqual(blocking.map((finding) => finding.ruleId), []);
});

test('the summary counts severities', () => {
  const summary = auditSummary(runAudit(site({})));
  assert.ok(summary.errors + summary.warnings + summary.infos > 0);
});
test('a crawler-specific group beats the permissive wildcard group', () => {
  const robots = parseRobots('robots.txt', 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n');
  assert.equal(robotsAllows(robots, 'GPTBot'), false);
  assert.equal(robotsAllows(robots, 'ClaudeBot'), true);
});
test('the fixed 13-check list is reported with pass/fail for each entry', () => {
  const result = runAudit(site({}));
  assert.equal(result.checks.length, 13);
  assert.equal(result.checks.filter((check) => check.scope === 'international').length, 8);
  assert.equal(result.checks.filter((check) => check.scope === 'domestic').length, 5);
  for (const check of result.checks) {
    assert.equal(typeof check.ok, 'boolean', check.id);
    assert.ok(check.title.length > 0 && check.titleZh.length > 0, check.id);
    const failed = result.findings.some((finding) => finding.ruleId === check.id);
    assert.equal(check.ok, !failed, check.id + ' must mirror the findings');
  }
  // A repository with no robots.txt fails the first check and passes the rest
  // that cannot fire without a site.
  assert.equal(result.checks.find((check) => check.id === 'AUD-INT-001')?.ok, false);
});

test('every audit finding ships a priority, an impact and two rendered prompts', () => {
  const result = runAudit(site({
    'public/robots.txt': 'User-agent: GPTBot\nDisallow: /\n',
  }));
  assert.ok(result.findings.length > 0);
  for (const finding of result.findings) {
    assert.ok(['high', 'medium', 'low'].includes(finding.priority), finding.ruleId);
    assert.ok(finding.impact.length > 10, finding.ruleId);
    assert.ok(finding.impactZh.length > 3, finding.ruleId);
    assert.ok(!/[{}]/.test(finding.prompt + finding.promptZh), finding.ruleId);
    assert.ok(finding.promptZh.length > 8, finding.ruleId);
  }
});
