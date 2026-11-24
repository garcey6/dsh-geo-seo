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
