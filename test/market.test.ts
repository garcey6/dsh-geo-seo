import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Compiled tests live in dist/test, so the package root is two levels up.
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const readJson = (relative: string): any => JSON.parse(readFileSync(packageRoot + relative, 'utf8'));

const pkg = readJson('package.json');
const index = readJson('market/index.json');

test('market index is a format-1 document with a localized title', () => {
  assert.equal(index.format, 1);
  assert.equal(typeof index.title?.en, 'string');
  assert.ok(index.title.en.trim().length > 0);
});

test('market index lists this package once, under its own name', () => {
  assert.equal(index.plugins.length, 1);
  assert.equal(index.plugins[0].name, pkg.name);
  assert.equal(typeof index.plugins[0].title?.en, 'string');
});

test('the indexed version matches package.json', () => {
  const [version] = index.plugins[0].versions;
  assert.equal(version.version, pkg.version);
  assert.ok(Number.isInteger(version.publishTimestamp) && version.publishTimestamp > 0);
});

test('the indexed version installs the published npm package', () => {
  const [version] = index.plugins[0].versions;
  // The market resolves an npm entry to name@version, so the tree it installs is the
  // immutable tarball whose engines.dsh this index advertises.
  assert.equal(version.source.type, 'npm');
  assert.match(version.version, /^\d+\.\d+\.\d+/, 'an npm source must name a concrete version');
  assert.equal(version.source.registry, undefined, 'the default registry needs no override');
});

test('the market icon travels inside the index', () => {
  // raw.githubusercontent.com fails Node's TLS verification behind this machine's
  // interception, so the icon is inlined instead of fetched from an absolute URL.
  assert.match(index.plugins[0].icon, /^data:image/);
});

test('the indexed engines.dsh comes from package.json', () => {
  const [version] = index.plugins[0].versions;
  assert.equal(typeof pkg.engines?.dsh, 'string');
  assert.equal(version.engines.dsh, pkg.engines.dsh);
});

test('the indexed engines.dsh admits the running DSH line', () => {
  const { dsh } = index.plugins[0].versions[0].engines;
  // The market checks semver.satisfies(runtime, range, { includePrerelease: true }).
  // A prerelease of 0.2.2 is the floor this pack is validated against.
  assert.match(dsh, /^>=/);
  assert.ok(dsh.includes('0.2.2'), 'the floor must name the DSH release this pack was validated on');
});