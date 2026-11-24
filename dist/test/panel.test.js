import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Tests run from dist/test, so assets/ is two levels up.
const PANEL_PATH = new URL('../../assets/panel.html', import.meta.url);
const HTML = fs.readFileSync(PANEL_PATH, 'utf8');
function stringKeys(block, language) {
    const start = block.indexOf('  ' + language + ': {');
    assert.ok(start >= 0, 'missing ' + language + ' dictionary');
    const rest = block.slice(start);
    const end = rest.indexOf('\n    },');
    const body = end === -1 ? rest : rest.slice(0, end);
    // Keys sit several to a line, e.g. `copy: 'Copy', copied: 'Copied',`.
    return [...body.matchAll(/([a-zA-Z][a-zA-Z0-9]*):\s*'/g)].map((match) => match[1]);
}
test('the panel is one vertical page, not a tab set', () => {
    // V3 replaces the five equal tabs with a single scroll: conclusion, issues,
    // assets, crawlability, monitoring.
    assert.ok(!/data-tab=/.test(HTML));
    assert.ok(!/class="tabs"/.test(HTML));
    assert.match(HTML, /id="hero"/);
    assert.match(HTML, /id="issues"/);
    assert.ok((HTML.match(/<details/g) ?? []).length >= 4, 'assets, reach and monitor are collapsible sections');
    assert.match(HTML, /id="assetsSec"/);
    assert.match(HTML, /id="reachSec"/);
    assert.match(HTML, /id="monitorSec"/);
});
test('the directory is chosen, not typed: the text field hides behind "advanced"', () => {
    assert.match(HTML, /id="chooseBtn"/);
    assert.match(HTML, /id="advanced"/);
    const advanced = HTML.slice(HTML.indexOf('id="advanced"'));
    const input = advanced.indexOf('id="dirInput"');
    assert.ok(input > 0);
    assert.ok(input < advanced.indexOf('</details>'), 'the text field lives inside the advanced fold');
});
test('issue cards carry the five required elements, including a copyable prompt', () => {
    assert.match(HTML, /data-act="copy"/);
    assert.match(HTML, /data-act="open"/);
    assert.match(HTML, /priorityHigh/);
    assert.match(HTML, /prompt:\s*'/);
    assert.match(HTML, /navigator\.clipboard/);
    assert.match(HTML, /已复制|Copied/);
});
test('the host bridge is optional: the panel still works when it is absent', () => {
    assert.match(HTML, /__GEO_HOST__/);
    assert.match(HTML, /waitForHost/);
});
test('the panel never prints a host absolute path of its own', () => {
    // V3 F-R1: an error names the folder, not C:\Users\... .
    assert.ok(!/C:\\\\/.test(HTML), 'no Windows absolute path literal');
    assert.match(HTML, /basename/);
});
test('both dictionaries define exactly the same keys', () => {
    const block = HTML.slice(HTML.indexOf('var STRINGS'), HTML.indexOf('var state = {'));
    const en = stringKeys(block, 'en');
    const zh = stringKeys(block, 'zh');
    assert.ok(en.length > 50, 'en dictionary has ' + en.length + ' keys');
    assert.deepEqual(zh.sort(), en.sort());
});
test('the panel script compiles as-is, because there is no build step', () => {
    const start = HTML.indexOf('<script>');
    const end = HTML.lastIndexOf('</script>');
    assert.ok(start > 0 && end > start);
    const source = HTML.slice(start + '<script>'.length, end);
    // new Function throws on a syntax error without executing the body.
    assert.doesNotThrow(() => new Function('window', 'document', 'location', 'localStorage', 'navigator', source));
});
test('the panel stays self-contained: no external scripts, styles or fonts', () => {
    assert.ok(!/<script[^>]+src=/.test(HTML));
    assert.ok(!/<link[^>]+href="http/.test(HTML));
    assert.ok(!/@import/.test(HTML));
    assert.ok(!/url\(["']?http/.test(HTML));
});
