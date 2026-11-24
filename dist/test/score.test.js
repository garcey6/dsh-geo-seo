import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from '../src/core/engine.js';
import { DIMENSIONS, RULE_PACK_VERSION } from '../src/core/rules.js';
import { makeWorkspace, healthyReadme } from './helpers.js';
const PACKAGE = JSON.stringify({
    name: 'sample-plugin',
    version: '1.2.3',
    description: 'Sample Plugin checks a repository for machine-readable documentation.',
    license: 'MIT',
    keywords: ['geo', 'seo', 'documentation'],
    author: { name: 'Example Maintainers' },
    repository: { type: 'git', url: 'https://github.com/example/sample-plugin' },
    homepage: 'https://example.com/sample-plugin',
});
function healthy() {
    return makeWorkspace({
        'README.md': healthyReadme(),
        'package.json': PACKAGE,
        'LICENSE': 'MIT License\n\nCopyright (c) 2026 Example Maintainers',
        'CHANGELOG.md': '# Changelog\n\n## 1.2.3 - 2026-02-01\n\n- First release.',
    });
}
test('the seven dimensions use the PRD weights and add up to 100', () => {
    assert.equal(DIMENSIONS.reduce((sum, dimension) => sum + dimension.weight, 0), 100);
    assert.deepEqual(DIMENSIONS.map((dimension) => dimension.id), ['relevance', 'structure', 'facts', 'freshness', 'machine', 'trust', 'compliance']);
});
test('a healthy workspace produces a report with bounded per-dimension scores', () => {
    const { report, ruleErrors } = runCheck(healthy());
    assert.deepEqual(ruleErrors, []);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.rulePackVersion, RULE_PACK_VERSION);
    assert.equal(report.dimensions.length, 7);
    for (const dimension of report.dimensions) {
        assert.ok(dimension.score >= 0, dimension.id + ' >= 0');
        assert.ok(dimension.score <= dimension.weight, dimension.id + ' <= weight');
        const deducted = dimension.findings.reduce((sum, finding) => sum + finding.deduction, 0);
        assert.ok(deducted >= 0);
    }
    assert.ok(report.summary.total >= 60, 'healthy workspace scored ' + report.summary.total);
    assert.equal(report.summary.capped, false);
});
test('the same suggestion is only deducted once, across files', () => {
    const dir = makeWorkspace({
        'README.md': healthyReadme(),
        'docs/extra.md': healthyReadme(),
    });
    const { report } = runCheck(dir);
    const keys = report.findings.map((finding) => finding.ruleId + '|' + finding.suggestion);
    assert.equal(new Set(keys).size, keys.length);
});
test('an unverifiable promotional claim caps the total at 60', () => {
    const dir = makeWorkspace({ 'README.md': healthyReadme('Guaranteed ranking wins for every repository.') });
    const { report } = runCheck(dir);
    assert.ok(report.findings.some((finding) => finding.ruleId === 'COM-001'), 'COM-001 should fire');
    assert.equal(report.summary.capped, true);
    assert.ok(report.summary.total <= 60, 'capped total was ' + report.summary.total);
    assert.ok(report.capReason && report.capReason.length > 0);
});
test('a short document loses relevance points and says why', () => {
    const short = runCheck(makeWorkspace({ 'README.md': '# Tiny\n\nToo short to answer anything.' })).report;
    const long = runCheck(healthy()).report;
    const relevance = (report) => report.dimensions.find((dimension) => dimension.id === 'relevance')?.score ?? 0;
    assert.ok(relevance(short) < relevance(long));
    assert.ok(short.findings.some((finding) => finding.ruleId === 'REL-100'));
});
test('broken input is recorded, not fatal', () => {
    const dir = makeWorkspace({
        'README.md': healthyReadme(),
        'package.json': '{ not json',
    });
    const { report } = runCheck(dir);
    assert.ok(report.parseErrors.length >= 1);
    assert.ok(report.summary.total > 0);
});
test('anchors are repository-relative and carry a line when known', () => {
    const dir = makeWorkspace({ 'README.md': '# Only a title\n' });
    const { report } = runCheck(dir);
    const anchored = report.findings.filter((finding) => finding.anchors.length > 0);
    assert.ok(anchored.length >= 1);
    for (const finding of anchored) {
        for (const anchor of finding.anchors) {
            assert.ok(!/^[A-Za-z]:/.test(anchor.file), 'anchor must not be absolute: ' + anchor.file);
            assert.ok(!anchor.file.includes('\\'), 'anchor must use forward slashes: ' + anchor.file);
        }
    }
});
