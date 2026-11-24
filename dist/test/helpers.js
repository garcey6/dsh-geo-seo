/**
 * Shared test fixtures. Every test works in its own temporary directory so the
 * real repository and the user's state directory are never touched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
/** Creates a temporary workspace from a { relativePath: content } map. */
export function makeWorkspace(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-seo-ws-'));
    for (const [relative, content] of Object.entries(files)) {
        const target = path.join(dir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
    }
    return dir;
}
/** Points the history store at a throw-away directory for the current test. */
export function isolatedState() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-seo-state-'));
    process.env['DSH_GEO_SEO_HOME'] = dir;
    return dir;
}
const FILLER = 'The plugin parses the repository, records every finding together with a source anchor, and renders a report a maintainer can act on. ';
/** A body long enough to clear the minimum-length rule. */
export function longBody(paragraphs = 9) {
    const out = [];
    for (let index = 0; index < paragraphs; index += 1) {
        out.push(FILLER.repeat(3).trim());
    }
    return out.join('\n\n');
}
/** A README that passes most rules: title, summary, install, features, usage. */
export function healthyReadme(extra = '') {
    return [
        '# Sample Plugin',
        '',
        'Sample Plugin checks a repository for machine-readable documentation and reports what is missing.',
        '',
        '## Install',
        '',
        '```bash',
        'npm install sample-plugin',
        '```',
        '',
        '## Features',
        '',
        '- Parses every Markdown document into headings, lists, tables and links.',
        '- Scores the documentation against a versioned rule pack.',
        '- Generates llms.txt and JSON-LD from the same fact graph.',
        '',
        '## Usage',
        '',
        'Run `npx sample-plugin check --dir .` to print the report.',
        '',
        'Version 1.2.3 is the current release. Last updated 2026-02-01.',
        '',
        longBody(),
        '',
        extra,
        '',
    ].join('\n');
}
/** Runs async work with stdout/stderr muted so CLI tests stay readable. */
export async function quietly(fn) {
    const out = process.stdout.write;
    const err = process.stderr.write;
    process.stdout.write = (() => true);
    process.stderr.write = (() => true);
    try {
        return await fn();
    }
    finally {
        process.stdout.write = out;
        process.stderr.write = err;
    }
}
