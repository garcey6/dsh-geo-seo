/**
 * Site-level artifacts: robots.txt, sitemap, llms.txt / ai.txt, static HTML and
 * JSON-LD blocks. These feed F4 (crawlability) and the machine-readable part of
 * F3, and they are read - never generated - here.
 */
import type { JsonLdBlock, LlmsFact, RobotsFact } from './types.js';
import { normalizeWhitespace } from './util.js';

/** Crawlers that materially affect whether a page can be quoted by an AI answer. */
export const AI_CRAWLERS = [
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'perplexitybot',
  'google-extended',
  'applebot-extended',
  'meta-externalagent',
  'ccbot',
  'cohere-ai',
  'youbot',
  'duckassistbot',
] as const;

/** Index crawlers used by Chinese answer engines (and classic search). */
export const CN_CRAWLERS = [
  'baiduspider',
  'bytespider',
  'sogou web spider',
  'sogouspider',
  '360spider',
  'yisouspider',
  'bingbot',
] as const;

export function parseRobots(file: string, raw: string): RobotsFact {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const groups: RobotsFact['groups'] = [];
  const agents: string[] = [];
  const sitemaps: string[] = [];
  let current: RobotsFact['groups'][number] | undefined;

  lines.forEach((line, index) => {
    const text = line.replace(/#.*$/, '').trim();
    if (!text) {
      current = undefined;
      return;
    }
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(text);
    if (!match) return;
    const field = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();
    if (field === 'user-agent') {
      agents.push(value.toLowerCase());
      if (!current) {
        current = { agents: [], allow: [], disallow: [], line: index + 1 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      return;
    }
    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      return;
    }
    if (field === 'allow' || field === 'disallow') {
      if (!current) {
        current = { agents: ['*'], allow: [], disallow: [], line: index + 1 };
        groups.push(current);
      }
      if (field === 'allow') current.allow.push(value);
      else current.disallow.push(value);
    }
  });

  return { file, present: true, agents: [...new Set(agents)], groups, sitemaps };
}

export function parseLlms(file: string, raw: string): LlmsFact {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const fact: LlmsFact = { file, present: true, entries: [], lineCount: lines.length, bytes: Buffer.byteLength(raw, 'utf8') };

  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) return;
    if (text.startsWith('# ') && !fact.title) {
      fact.title = text.slice(2).trim();
      return;
    }
    if (text.startsWith('> ') && !fact.summary) {
      fact.summary = text.slice(2).trim();
      return;
    }
    const entry = /^[-*]\s*\[([^\]]+)\]\(([^)\s]+)\)\s*(?::\s*(.*))?$/.exec(text);
    if (entry?.[1] && entry[2]) {
      fact.entries.push({
        title: entry[1].trim(),
        url: entry[2].trim(),
        description: entry[3]?.trim(),
        line: index + 1,
      });
    }
  });

  return fact;
}

export interface HtmlFact {
  metaRobots: { line: number; content: string }[];
  canonicals: { line: number; href: string }[];
  textChars: number;
  htmlChars: number;
  viewport: boolean;
  jsonLd: JsonLdBlock[];
}

/** Extracts the handful of HTML facts that matter for crawlability. */
export function parseHtml(file: string, raw: string): HtmlFact {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const metaRobots: HtmlFact['metaRobots'] = [];
  const canonicals: HtmlFact['canonicals'] = [];

  lines.forEach((line, index) => {
    const meta = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*>/i.exec(line);
    if (meta) {
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(meta[0]);
      if (content?.[1]) metaRobots.push({ line: index + 1, content: content[1].trim() });
    }
    const canonical = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(line);
    if (canonical) {
      const href = /href\s*=\s*["']([^"']*)["']/i.exec(canonical[0]);
      if (href?.[1]) canonicals.push({ line: index + 1, href: href[1].trim() });
    }
  });

  const textChars = visibleText(raw).length;
  const viewport = /<meta(?=[\s/>])[^>]*name\s*=\s*["']viewport["']/i.test(raw);
  return { metaRobots, canonicals, textChars, htmlChars: raw.length, viewport, jsonLd: extractJsonLd(file, raw) };
}

export function visibleText(raw: string): string {
  return normalizeWhitespace(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&'),
  );
}

/** Finds \`<script type="application/ld+json">\` blocks and parses them. */
export function extractJsonLd(file: string, raw: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const body = match[1] ?? '';
    const line = countLinesBefore(raw, match.index);
    blocks.push(parseJsonLdBlock(file, line, body));
  }
  return blocks;
}

/** Parses fenced json blocks from Markdown that look like JSON-LD payloads. */
export function jsonLdFromCodeBlocks(file: string, blocks: { text: string; line: number }[]): JsonLdBlock[] {
  const out: JsonLdBlock[] = [];
  for (const block of blocks) {
    if (!block.text.includes('@context')) continue;
    out.push(parseJsonLdBlock(file, block.line, block.text));
  }
  return out;
}

function parseJsonLdBlock(file: string, line: number, raw: string): JsonLdBlock {
  const trimmed = raw.trim();
  try {
    return { file, line, raw: trimmed, value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      file,
      line,
      raw: trimmed,
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function countLinesBefore(raw: string, index: number): number {
  let count = 1;
  for (let i = 0; i < index && i < raw.length; i += 1) {
    if (raw[i] === '\n') count += 1;
  }
  return count;
}

export interface SitemapFact {
  file: string;
  urls: string[];
}

export function parseSitemap(file: string, raw: string): SitemapFact {
  const urls: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[1]) urls.push(match[1]);
  }
  return { file, urls };
}

/** True when the robots file explicitly allows the given agent (or \`*\`). */
export function robotsAllows(robots: RobotsFact | undefined, agent: string): boolean {
  if (!robots) return true;
  const name = agent.toLowerCase();
  const specific = robots.groups.filter((group) => group.agents.includes(name));
  // Per the robots exclusion standard the most specific group wins: the `*`
  // group only applies when no named group mentions the agent. Merging both
  // would let a permissive wildcard cancel a crawler-specific Disallow.
  const matching = specific.length > 0 ? specific : robots.groups.filter((group) => group.agents.includes('*'));
  if (matching.length === 0) return true;
  const blockedRoot = matching.some((group) => group.disallow.some((rule) => rule.trim() === '/'));
  if (!blockedRoot) return true;
  return matching.some((group) => group.allow.some((rule) => rule.trim() === '/'));
}

/** Returns the agents that are blocked from the whole site. */
export function blockedAgents(robots: RobotsFact | undefined, agents: readonly string[]): string[] {
  if (!robots) return [];
  return agents.filter((agent) => !robotsAllows(robots, agent));
}
