import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, detectKind } from '../src/core/markdown.js';
import { parseRobots, parseLlms } from '../src/core/site.js';
const DOC = [
    '---',
    'title: Sample',
    'updated: 2026-01-02',
    '---',
    '',
    '# Sample Plugin',
    '',
    'Lead paragraph with a [link](https://example.com) inside it.',
    '',
    '## Install',
    '',
    '```bash',
    'npm install sample-plugin',
    '```',
    '',
    '## Features',
    '',
    '- Parses Markdown into a fact graph.',
    '- Scores the facts with a versioned rule pack.',
    '- Generates llms.txt from the same graph.',
    '',
    '## Options',
    '',
    '| Flag | Meaning |',
    '| --- | --- |',
    '| `--dir` | target directory |',
    '',
    '### Nested heading',
    '',
    'Closing paragraph mentions http://example.org directly.',
].join('\n');
test('parseMarkdown records headings, lists, code, tables, links and anchors', () => {
    const doc = parseMarkdown('README.md', DOC);
    assert.equal(doc.kind, 'readme');
    assert.equal(doc.headings.length, 5, 'one h1, three h2 and one h3');
    assert.deepEqual(doc.headings.map((heading) => heading.level), [1, 2, 2, 2, 3]);
    assert.equal(doc.codeBlocks.length, 1);
    assert.equal(doc.codeBlocks[0]?.lang, 'bash');
    assert.equal(doc.tables.length, 1);
    assert.equal(doc.tables[0]?.header.length, 2);
    assert.ok(doc.lists.some((list) => list.items.length === 3), 'feature list should have three items');
    assert.ok(doc.links.some((link) => link.href === 'https://example.com'));
    assert.ok(doc.links.some((link) => link.href.startsWith('http://example.org')), 'bare URLs count as links');
    assert.equal(doc.frontmatter['title'], 'Sample');
    assert.ok(doc.wordCount > 20);
    // Every heading keeps the 1-based line it was found on.
    assert.equal(typeof doc.headings[0]?.line, 'number');
    assert.ok((doc.headings[0]?.line ?? 0) > 0);
    assert.ok(doc.sections.length >= 3);
});
test('parseMarkdown tolerates CRLF and unterminated fences without throwing', () => {
    const doc = parseMarkdown('docs/x.md', '# Title\r\n\r\ntext\r\n\r\n```\ncode without an end');
    assert.equal(doc.headings.length, 1);
    assert.ok(doc.wordCount > 0);
});
test('detectKind classifies common documentation files', () => {
    assert.equal(detectKind('README.md'), 'readme');
    assert.equal(detectKind('docs/README.zh.md'), 'readme');
    assert.equal(detectKind('CHANGELOG.md'), 'changelog');
    assert.equal(detectKind('docs/LICENSE'), 'license');
    assert.equal(detectKind('docs/guide.md'), 'doc');
    assert.equal(detectKind('notes.txt'), 'other');
});
test('parseRobots understands groups, allow/disallow and sitemaps', () => {
    const robots = parseRobots('robots.txt', [
        'User-agent: *',
        'Disallow: /private',
        '',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'Sitemap: https://example.com/sitemap.xml',
    ].join('\n'));
    assert.equal(robots.sitemaps.length, 1);
    assert.ok(robots.groups.length >= 2);
});
test('parseLlms reads title, summary and entries', () => {
    const llms = parseLlms('llms.txt', [
        '# Sample Plugin',
        '',
        '> A one line summary.',
        '',
        '## Core pages',
        '',
        '- [Getting started](https://example.com/start): Install and run in two commands.',
    ].join('\n'));
    assert.equal(llms.title, 'Sample Plugin');
    assert.equal(llms.summary, 'A one line summary.');
    assert.ok(llms.entries.length >= 1);
});
