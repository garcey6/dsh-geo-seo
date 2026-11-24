import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCheck } from '../src/core/engine.js';
import { buildJsonLd, buildLlmsTxt, generateAssets, verifyJsonLd, defaultOutDir, } from '../src/core/generate.js';
import { makeWorkspace, healthyReadme } from './helpers.js';
const PACKAGE = JSON.stringify({
    name: 'sample-plugin',
    version: '1.2.3',
    description: 'Sample Plugin checks a repository for machine-readable documentation.',
    license: 'MIT',
    author: 'Example Maintainers',
});
function workspace(extraFiles = {}) {
    return makeWorkspace({
        'README.md': healthyReadme(),
        'docs/usage.md': '# Usage\n\nRun the checker, then read the report.\n',
        'package.json': PACKAGE,
        ...extraFiles,
    });
}
test('llms.txt carries a source header, a summary and core pages', () => {
    const graph = runCheck(workspace()).graph;
    const llms = buildLlmsTxt(graph);
    assert.ok(llms.content.startsWith('<!--'), 'must start with a provenance comment');
    assert.match(llms.content, /rule pack/i);
    assert.match(llms.content, /^# sample-plugin/m);
    assert.match(llms.content, /^> /m);
    assert.match(llms.content, /## Core pages/);
    assert.ok(llms.entries.length >= 1 && llms.entries.length <= 20, 'entries=' + llms.entries.length);
});
test('default output directory lives outside the repository', () => {
    const dir = workspace();
    const out = defaultOutDir(runCheck(dir).graph);
    assert.notEqual(path.resolve(out), path.resolve(dir));
    assert.ok(!path.resolve(out).startsWith(path.resolve(dir)));
});
test('JSON-LD only states facts the visible text can back', () => {
    const graph = runCheck(workspace()).graph;
    const jsonLd = buildJsonLd(graph);
    const value = jsonLd.value;
    assert.equal(value['@context'], 'https://schema.org');
    assert.equal(value['@type'], 'SoftwareApplication');
    assert.equal(value['name'], 'sample-plugin');
    assert.equal(value['softwareVersion'], '1.2.3');
    // A generated rating or price would be exactly the fabrication the PRD bans.
    assert.equal(value['aggregateRating'], undefined);
    assert.equal(value['offers'], undefined);
    const verification = verifyJsonLd(jsonLd, graph);
    assert.equal(verification.ok, true);
    assert.ok(verification.checkedFacts >= 2);
});
test('a package name that never appears in the text blocks the JSON-LD write', () => {
    const dir = makeWorkspace({
        'README.md': '# Some other tool\n\nThis page is about something else entirely.\n',
        'package.json': PACKAGE,
    });
    const graph = runCheck(dir).graph;
    const jsonLd = buildJsonLd(graph);
    assert.ok(jsonLd.blocking.length >= 1);
    const result = generateAssets(graph, { outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'geo-out-')) });
    const structured = result.files.find((file) => file.path.endsWith('structured-data.jsonld'));
    assert.ok(structured);
    assert.equal(structured?.written, false);
    assert.match(String(structured?.reason), /refused/);
    assert.equal(result.verification.ok, false);
});
test('dry run writes nothing and refuses to clobber without force', () => {
    const dir = workspace();
    const graph = runCheck(dir).graph;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-out-'));
    const dry = generateAssets(graph, { outDir, dryRun: true });
    assert.ok(dry.files.length >= 4);
    assert.ok(dry.files.every((file) => !file.written));
    assert.deepEqual(fs.readdirSync(outDir), []);
    const first = generateAssets(graph, { outDir, force: true });
    assert.ok(first.files.every((file) => file.written), JSON.stringify(first.files));
    assert.ok(fs.existsSync(path.join(outDir, 'llms.txt')));
    assert.ok(fs.existsSync(path.join(outDir, 'ai.txt')));
    // Manual edit: the generator must report a conflict instead of overwriting.
    const edited = '# hand written edit\n';
    fs.writeFileSync(path.join(outDir, 'llms.txt'), edited, 'utf8');
    const second = generateAssets(graph, { outDir });
    const llms = second.files.find((file) => file.path.endsWith('llms.txt'));
    assert.equal(llms?.written, false);
    assert.match(String(llms?.reason), /force/);
    assert.equal(fs.readFileSync(path.join(outDir, 'llms.txt'), 'utf8'), edited);
    const third = generateAssets(graph, { outDir, force: true });
    assert.ok(third.files.every((file) => file.written));
});
test('ai.txt mirrors llms.txt exactly', () => {
    const dir = workspace();
    const graph = runCheck(dir).graph;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-out-'));
    generateAssets(graph, { outDir, force: true });
    assert.equal(fs.readFileSync(path.join(outDir, 'ai.txt'), 'utf8'), fs.readFileSync(path.join(outDir, 'llms.txt'), 'utf8'));
});
