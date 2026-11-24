#!/usr/bin/env node
// Builds market/index.json, the format-1 plugin market index that lists this package.
// Run after publishing a version: node ./scripts/build-market-index.mjs [--timestamp <unixSeconds>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

const argv = process.argv.slice(2);
const stampIndex = argv.indexOf('--timestamp');
const publishTimestamp = stampIndex >= 0
  ? Number.parseInt(argv[stampIndex + 1] ?? '', 10)
  : Math.floor(Date.now() / 1000);
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
      icon: 'https://raw.githubusercontent.com/garcey6/dsh-geo-seo/main/icon.svg',
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
          source: { type: 'npm' },
          engines: { dsh: enginesDsh },
        },
      ],
    },
  ],
};

mkdirSync(path.join(packageRoot, 'market'), { recursive: true });
const target = path.join(packageRoot, 'market', 'index.json');
writeFileSync(target, JSON.stringify(index, null, 2) + '\n');
console.log('wrote ' + path.relative(packageRoot, target) + ' for ' + pkg.name + '@' + pkg.version + ' (publishTimestamp ' + publishTimestamp + ')');
