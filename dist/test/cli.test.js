import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, EXIT_OK, EXIT_THRESHOLD, EXIT_USAGE } from '../src/cli/main.js';
import { makeWorkspace, healthyReadme, isolatedState, quietly } from './helpers.js';
const PACKAGE = JSON.stringify({ name: 'sample-plugin', version: '1.2.3', license: 'MIT' });
function healthy() {
    isolatedState();
    return makeWorkspace({
        'README.md': healthyReadme(),
        'package.json': PACKAGE,
        'public/robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n',
        'public/sitemap.xml': '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>',
    });
}
test('check exits 0 on a healthy workspace and honours --fail-under', async () => {
    const dir = healthy();
    assert.equal(await quietly(() => main(['check', '--dir', dir])), EXIT_OK);
    assert.equal(await quietly(() => main(['check', '--dir', dir, '--format', 'json', '--no-history'])), EXIT_OK);
    assert.equal(await quietly(() => main(['check', '--dir', dir, '--fail-under', '101', '--no-history'])), EXIT_THRESHOLD);
});
test('check --strict fails when an error-level finding exists', async () => {
    const dir = makeWorkspace({ 'README.md': healthyReadme('Guaranteed ranking wins.') });
    isolatedState();
    assert.equal(await quietly(() => main(['check', '--dir', dir, '--strict'])), EXIT_THRESHOLD);
});
test('a missing directory is a usage error, not a crash', async () => {
    assert.equal(await quietly(() => main(['check', '--dir', path.join(os.tmpdir(), 'geo-seo-does-not-exist')])), EXIT_USAGE);
});
test('generate honours --dry-run and writes with --out', async () => {
    const dir = healthy();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-cli-out-'));
    assert.equal(await quietly(() => main(['generate', '--dir', dir, '--out', out, '--dry-run'])), EXIT_OK);
    assert.deepEqual(fs.readdirSync(out), []);
    assert.equal(await quietly(() => main(['generate', '--dir', dir, '--out', out])), EXIT_OK);
    assert.ok(fs.existsSync(path.join(out, 'llms.txt')));
});
test('audit --strict fails when a crawlability error is present', async () => {
    isolatedState();
    const dir = makeWorkspace({
        'README.md': healthyReadme(),
        'public/robots.txt': 'User-agent: GPTBot\nDisallow: /\n',
    });
    const code = await quietly(() => main(['audit', '--dir', dir, '--strict']));
    assert.equal(code, EXIT_THRESHOLD);
});
test('monitor records a sample and reports the trend', async () => {
    const dir = healthy();
    const answers = path.join(os.tmpdir(), 'geo-answers-' + Date.now() + '.json');
    fs.writeFileSync(answers, JSON.stringify([
        { questionId: 'q01', mentioned: true, cited: true },
        { questionId: 'q02', mentioned: false, cited: false },
    ]), 'utf8');
    assert.equal(await quietly(() => main(['monitor', '--dir', dir, '--answers', answers, '--platform', 'perplexity'])), EXIT_OK);
    assert.equal(await quietly(() => main(['monitor', '--dir', dir])), EXIT_OK);
    assert.equal(await quietly(() => main(['monitor', '--questions'])), EXIT_OK);
});
test('help, version and rules are safe to run', async () => {
    for (const argv of [['help'], ['version'], ['rules']]) {
        assert.equal(await quietly(() => main(argv)), EXIT_OK, argv.join(' '));
    }
});
