#!/usr/bin/env node
// Builds market/index.json, the format-1 plugin market index that lists this package.
//
// The listed version installs from git at a pinned commit, not from the npm registry:
// the published 0.1.0 tarball carries a wrong engines.dsh and cannot be replaced, and
// a commit-pinned git source installs exactly this tree, whose engines.dsh and built
// dist/ are already correct. Switch a version back to npm only after publishing it.
//
// Usage: node ./scripts/build-market-index.mjs [--commit <sha>] [--timestamp <unixSeconds>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};
const git = (args) => execFileSync('git', args, { cwd: packageRoot, encoding: 'utf8' }).trim();

const commit = flag('--commit') ?? git(['rev-parse', 'HEAD']);
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error('commit must be a lowercase 40-hex commit SHA, got: ' + commit);
  process.exit(2);
}

const stamp = flag('--timestamp');
const publishTimestamp = stamp === undefined
  ? Number.parseInt(git(['log', '-1', '--format=%ct', commit]), 10)
  : Number.parseInt(stamp, 10);
if (!Number.isInteger(publishTimestamp) || publishTimestamp <= 0) {
  console.error('publishTimestamp must be a positive integer number of Unix seconds');
  process.exit(2);
}

const enginesDsh = pkg.engines?.dsh;
if (typeof enginesDsh !== 'string' || enginesDsh.trim() === '') {
  console.error('package.json must declare engines.dsh: the market evaluates it against the running DSH version');
  process.exit(2);
}

const repository = 'https://github.com/garcey6/dsh-geo-seo';
// Inline the icon so the market can draw it without touching a host this machine's
// TLS interception may break (raw.githubusercontent.com is not trusted by Node here).
const icon = 'data:image/svg+xml;base64,' + readFileSync(path.join(packageRoot, 'icon.svg')).toString('base64');
const index = {
  format: 1,
  title: { en: 'DSH GEO / SEO tools', zh: 'DSH GEO / SEO 工具' },
  description: {
    en: 'Documentation readability for AI engines: score a repository against a versioned rule pack and generate the files engines read.',
    zh: '面向 AI 引擎的文档可读性：按带版本的规则包给仓库打分，并生成引擎真正会读的文件。',
  },
  metadata: {
    categories: { documentation: { title: { en: 'Documentation', zh: '文档' } } },
    labels: {
      offline: { title: { en: 'Offline', zh: '离线' } },
      cli: { title: { en: 'CLI included', zh: '含 CLI' } },
    },
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'GEO / SEO', zh: 'GEO / SEO' },
      description: {
        en: pkg.description,
        zh: '读取仓库真实事实，按七维 100 分制给文档的 GEO 就绪度打分，扣分定位到 file:line，并能一次生成 llms.txt、llms-full.txt、ai.txt 与 JSON-LD；离线运行，不承诺排名。',
      },
      icon,
      author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name ?? 'garcey',
      homepage: pkg.homepage,
      repository: { url: repository },
      metadata: {
        category: 'documentation',
        keywords: pkg.keywords,
        labels: ['offline', 'cli'],
        sortKeys: {},
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source: { type: 'git', url: repository + '.git', commit },
          engines: { dsh: enginesDsh },
        },
      ],
    },
  ],
};

mkdirSync(path.join(packageRoot, 'market'), { recursive: true });
const target = path.join(packageRoot, 'market', 'index.json');
writeFileSync(target, JSON.stringify(index, null, 2) + '\n');
console.log('wrote ' + path.relative(packageRoot, target) + ' for ' + pkg.name + '@' + pkg.version
  + ' (git ' + commit.slice(0, 7) + ', publishTimestamp ' + publishTimestamp + ')');
