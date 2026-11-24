#!/usr/bin/env node
/**
 * Release helper: publish to npm, then refresh market/index.json with the real
 * publish timestamp and push it, so the raw index URL serves the new version.
 *
 * Usage:
 *   npm run release            # publish + refresh index + commit + push
 *   npm run release -- --dry-run
 *
 * Auth: either run "npm login" once, or export NPM_TOKEN=<granular token>.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const dryRun = process.argv.includes('--dry-run');
const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));

function run(command, args, extraEnv = {}) {
  const res = spawnSync(command, args, {
    cwd: pkgRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    console.error('\nfailed: ' + command + ' ' + args.join(' ') + ' (exit ' + res.status + ')');
    process.exit(res.status ?? 1);
  }
}

async function publishedAt(name, version) {
  const res = await fetch('https://registry.npmjs.org/' + name + '/' + version, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error('registry responded ' + res.status + ' for ' + name + '@' + version);
  const doc = await res.json();
  const iso = doc._npmUser ? doc._npmUser.date || doc.time || null : doc.time || null;
  const raw = (doc.time && doc.time[version]) || iso || doc.modified;
  if (!raw) throw new Error('cannot determine publish time for ' + version);
  return Math.floor(new Date(raw).getTime() / 1000);
}

const env = process.env.NPM_TOKEN ? { NPM_TOKEN: process.env.NPM_TOKEN } : {};

console.log('> publishing ' + pkg.name + '@' + pkg.version + (dryRun ? ' (dry run)' : ''));
run('npm', ['publish', '--access', 'public', ...(dryRun ? ['--dry-run'] : [])], env);
if (dryRun) {
  console.log('dry run finished; index timestamp left untouched');
  process.exit(0);
}

let stamp;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    stamp = await publishedAt(pkg.name, pkg.version);
    break;
  } catch (err) {
    console.log('registry not ready (attempt ' + attempt + '/10): ' + err.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (!stamp) {
  console.error('published, but could not read the publish time from the registry.');
  console.error('run: node ./scripts/build-market-index.mjs --timestamp <unixSeconds>');
  process.exit(1);
}

console.log('> refreshing market/index.json (publishTimestamp ' + stamp + ')');
run('node', ['./scripts/build-market-index.mjs', '--timestamp', String(stamp)]);
run('git', ['add', 'market/index.json']);
run('git', ['commit', '-m', 'chore(market): index ' + pkg.name + '@' + pkg.version]);
run('git', ['push', 'origin', 'HEAD']);

const indexUrl = 'https://raw.githubusercontent.com/garcey6/dsh-geo-seo/main/market/index.json';
const unpkgUrl = 'https://unpkg.com/' + pkg.name + '@' + pkg.version + '/market/index.json';
console.log('\ndone.');
console.log('  npm:    https://www.npmjs.com/package/' + pkg.name);
console.log('  index:  ' + indexUrl);
console.log('  mirror: ' + unpkgUrl);
console.log('  cli:    npm install -g ' + pkg.name);
