/**
 * The scan layer: turns a directory into a FactGraph. No scoring, no
 * generation - just facts with anchors. Nothing here writes to the target.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type {
  FactGraph,
  GitFact,
  LlmsFact,
  MarkdownDoc,
  PackageFact,
  ParseError,
  RobotsFact,
  SiteAuditFact,
  SourceFact,
} from './types.js';
import { inspectSource } from './source-ast.js';
import { parseMarkdown, bodyText, leadText } from './markdown.js';
import { readPackageJson } from './package-json.js';
import {
  extractJsonLd,
  jsonLdFromCodeBlocks,
  parseHtml,
  parseLlms,
  parseRobots,
  parseSitemap,
} from './site.js';
import { exists, isDirectory, listFiles, mtimeIso, parseDate, readTextSafe } from './util.js';

export interface ScanOptions {
  maxDocs?: number;
  maxSources?: number;
  /** Set false to skip \`git\` (used by tests for determinism). */
  git?: boolean;
}

const DOC_CANDIDATES = [
  'README.md',
  'readme.md',
  'Readme.md',
  'README.mdx',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
];

const SITE_ROOTS = ['', 'public/', 'static/', 'docs/public/', 'site/', 'docs/'];

export function scanDirectory(dir: string, options: ScanOptions = {}): FactGraph {
  const root = path.resolve(dir);
  if (!isDirectory(root)) {
    throw new Error('Target directory does not exist: ' + root);
  }

  const files = listFiles(root);
  const fileSet = new Set(files);
  const errors: ParseError[] = [];
  const mtimes: Record<string, string> = {};
  const docs: MarkdownDoc[] = [];
  const sources: SourceFact[] = [];
  const site: SiteAuditFact = { jsonLd: [], metaRobots: [], htmlFiles: [], canonicals: [] };

  let packageJson: PackageFact | undefined;

  // package.json is read from the target root only: we score one package.
  if (fileSet.has('package.json')) {
    const result = readPackageJson(path.join(root, 'package.json'));
    if (result.fact) packageJson = result.fact;
    if (result.error) errors.push(result.error);
  }

  // Markdown documents: README first, then docs, then any other root Markdown.
  const maxDocs = options.maxDocs ?? 60;
  const chosen: string[] = [];
  for (const candidate of DOC_CANDIDATES) {
    if (fileSet.has(candidate)) chosen.push(candidate);
  }
  for (const file of files) {
    if (chosen.length >= maxDocs) break;
    if (!/\.mdx?$/i.test(file)) continue;
    if (chosen.includes(file)) continue;
    const isReadmeElsewhere = /(^|\/)readme\.mdx?$/i.test(file);
    const inDocs = /^docs\//.test(file);
    if (!isReadmeElsewhere && !inDocs) continue;
    chosen.push(file);
  }
  // De-duplicate case variants of README (Windows is case-insensitive).
  const seenReadme = new Set<string>();
  const documentFiles = chosen.filter((file) => {
    if (!/readme\.mdx?$/i.test(file)) return true;
    const key = file.toLowerCase();
    if (seenReadme.has(key)) return false;
    seenReadme.add(key);
    return true;
  });

  for (const file of documentFiles) {
    const absolute = path.join(root, file);
    const raw = readTextSafe(absolute, 2 * 1024 * 1024);
    if (raw === undefined) {
      errors.push({ file, message: 'Markdown document could not be read (too large or unreadable)' });
      continue;
    }
    try {
      docs.push(parseMarkdown(file, raw));
      const mtime = mtimeIso(absolute);
      if (mtime) mtimes[file] = mtime;
    } catch (error) {
      errors.push({ file, message: 'Markdown parse failed: ' + describe(error) });
    }
  }

  // Source files: only code that can declare tools, commands or exports.
  const maxSources = options.maxSources ?? 200;
  const sourceFiles = files.filter((file) => {
    if (!/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(file)) return false;
    if (/(^|\/)(dist|build|out|coverage|test|tests|__tests__|examples?)\//.test(file)) return false;
    if (/\.(test|spec)\./.test(file)) return false;
    return true;
  });
  for (const file of sourceFiles.slice(0, maxSources)) {
    const raw = readTextSafe(path.join(root, file), 512 * 1024);
    if (raw === undefined) continue;
    if (!/\bexport\b|register\s*\(|defineTool/.test(raw)) continue;
    try {
      sources.push(inspectSource(file, raw));
      const mtime = mtimeIso(path.join(root, file));
      if (mtime) mtimes[file] = mtime;
    } catch (error) {
      errors.push({ file, message: 'Source inspection failed: ' + describe(error) });
    }
  }

  // Site artifacts, looked up in the usual static-asset locations.
  const findSite = (name: string): string | undefined => {
    for (const prefix of SITE_ROOTS) {
      const candidate = prefix + name;
      if (fileSet.has(candidate)) return candidate;
    }
    return undefined;
  };

  const robotsPath = findSite('robots.txt');
  if (robotsPath) {
    const raw = readTextSafe(path.join(root, robotsPath), 512 * 1024);
    if (raw !== undefined) {
      site.robots = parseRobots(robotsPath, raw);
      recordMtime(root, robotsPath, mtimes);
    } else {
      errors.push({ file: robotsPath, message: 'robots.txt could not be read' });
    }
  }

  const sitemapPath = findSite('sitemap.xml');
  if (sitemapPath) {
    const raw = readTextSafe(path.join(root, sitemapPath), 4 * 1024 * 1024);
    if (raw !== undefined) {
      site.sitemap = parseSitemap(sitemapPath, raw);
      recordMtime(root, sitemapPath, mtimes);
    }
  }

  const llmsPath = findSite('llms.txt');
  if (llmsPath) {
    const raw = readTextSafe(path.join(root, llmsPath), 1024 * 1024);
    if (raw !== undefined) {
      site.llmsTxt = parseLlms(llmsPath, raw);
      recordMtime(root, llmsPath, mtimes);
    }
  }

  const aiPath = findSite('ai.txt');
  if (aiPath) {
    const raw = readTextSafe(path.join(root, aiPath), 1024 * 1024);
    if (raw !== undefined) {
      site.aiTxt = parseLlms(aiPath, raw);
      recordMtime(root, aiPath, mtimes);
    }
  }

  // Static HTML entry points: at most five, smallest paths first.
  const htmlFiles = files.filter((file) => /\.html?$/i.test(file) && !/(^|\/)(dist|build|out)\//.test(file)).slice(0, 5);
  for (const file of htmlFiles) {
    const raw = readTextSafe(path.join(root, file), 2 * 1024 * 1024);
    if (raw === undefined) continue;
    const fact = parseHtml(file, raw);
    site.metaRobots.push(...fact.metaRobots.map((item) => ({ file, line: item.line, content: item.content })));
    site.canonicals.push(...fact.canonicals.map((item) => ({ file, line: item.line, href: item.href })));
    site.htmlFiles.push({ file, chars: fact.htmlChars, textChars: fact.textChars, viewport: fact.viewport });
    site.jsonLd.push(...fact.jsonLd);
    recordMtime(root, file, mtimes);
  }

  // JSON-LD can also live inside Markdown fences (common for docs sites).
  for (const doc of docs) {
    site.jsonLd.push(...jsonLdFromCodeBlocks(doc.file, doc.codeBlocks));
  }

  const git = options.git === false ? { available: false, reason: 'git disabled' } : readGit(root);

  const graph: FactGraph = {
    dir: root,
    scannedAt: new Date().toISOString(),
    docs,
    sources,
    site,
    git,
    mtimes,
    files,
    errors,
  };
  if (packageJson) graph.packageJson = packageJson;

  const declared = declaredUpdate(docs);
  if (declared) graph.declaredUpdatedAt = declared;

  return graph;
}

function recordMtime(root: string, file: string, mtimes: Record<string, string>): void {
  const mtime = mtimeIso(path.join(root, file));
  if (mtime) mtimes[file] = mtime;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Finds the date the project claims for itself. Only explicit statements count:
 * "last updated", "更新于", "最近更新" and changelog headings.
 */
export function declaredUpdate(docs: readonly MarkdownDoc[]): string | undefined {
  const patterns = [
    /(?:last\s+(?:updated|update)|updated\s+on|最近更新|最后更新|更新于|更新日期)\s*[:：]?\s*([0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}日?|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
    /(?:version|发布)\s*(?:date)?\s*[:：]\s*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2})/i,
  ];
  // Root-level documents win over nested ones: a fixture under examples/ must not supply
  // the repository's declared update date.
  const depth = (file: string) => file.split('/').length;
  const ordered = [...docs].sort(
    (a, b) => kindRank(a.kind) - kindRank(b.kind) || depth(a.file) - depth(b.file),
  );
  for (const doc of ordered) {
    for (const pattern of patterns) {
      const match = pattern.exec(doc.raw);
      if (match?.[1]) {
        const iso = parseDate(match[1]);
        if (iso) return iso;
      }
    }
    const fm = doc.frontmatter['updated'] ?? doc.frontmatter['lastUpdated'] ?? doc.frontmatter['date'];
    if (fm) {
      const iso = parseDate(fm);
      if (iso) return iso;
    }
  }
  return undefined;
}

function kindRank(kind: MarkdownDoc['kind']): number {
  const order: Record<string, number> = { readme: 0, doc: 1, changelog: 2, license: 3, other: 4 };
  return order[kind] ?? 9;
}

function readGit(root: string): GitFact {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%cI'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!date) return { available: false, reason: 'no commits' };
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return {
      available: true,
      lastCommitDate: date.slice(0, 10),
      commitCount: Number.parseInt(count, 10) || undefined,
    };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Convenience: the README document, else the first Markdown document. */
export function primaryDocument(docs: readonly MarkdownDoc[]): MarkdownDoc | undefined {
  return docs.find((doc) => doc.kind === 'readme') ?? docs.find((doc) => doc.kind === 'doc') ?? docs[0];
}

/** Every Markdown document joined for whole-repository text searches. */
export function combinedText(graph: FactGraph): string {
  return graph.docs.map((doc) => leadText(doc) + '\n' + bodyText(doc)).join('\n');
}

export function hasFile(graph: FactGraph, name: string): boolean {
  return graph.files.some((file) => file.toLowerCase() === name.toLowerCase());
}

export function findLlms(graph: FactGraph): LlmsFact | undefined {
  return graph.site.llmsTxt;
}

export function findRobots(graph: FactGraph): RobotsFact | undefined {
  return graph.site.robots;
}

export function configKeysOf(graph: FactGraph): string[] {
  const keys = new Set<string>();
  for (const source of graph.sources) {
    for (const key of source.configKeys) keys.add(key);
  }
  return [...keys];
}

export function toolNames(graph: FactGraph): string[] {
  return [...new Set(graph.sources.flatMap((source) => source.tools.map((tool) => tool.name)))];
}

export function commandNames(graph: FactGraph): string[] {
  return [...new Set(graph.sources.flatMap((source) => source.commands.map((command) => command.name)))];
}

export { exists };
