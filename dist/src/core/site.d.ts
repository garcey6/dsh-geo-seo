/**
 * Site-level artifacts: robots.txt, sitemap, llms.txt / ai.txt, static HTML and
 * JSON-LD blocks. These feed F4 (crawlability) and the machine-readable part of
 * F3, and they are read - never generated - here.
 */
import type { JsonLdBlock, LlmsFact, RobotsFact } from './types.js';
/** Crawlers that materially affect whether a page can be quoted by an AI answer. */
export declare const AI_CRAWLERS: readonly ["gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "claude-web", "anthropic-ai", "perplexitybot", "google-extended", "applebot-extended", "meta-externalagent", "ccbot", "cohere-ai", "youbot", "duckassistbot"];
/** Index crawlers used by Chinese answer engines (and classic search). */
export declare const CN_CRAWLERS: readonly ["baiduspider", "bytespider", "sogou web spider", "sogouspider", "360spider", "yisouspider", "bingbot"];
export declare function parseRobots(file: string, raw: string): RobotsFact;
export declare function parseLlms(file: string, raw: string): LlmsFact;
export interface HtmlFact {
    metaRobots: {
        line: number;
        content: string;
    }[];
    canonicals: {
        line: number;
        href: string;
    }[];
    textChars: number;
    htmlChars: number;
    viewport: boolean;
    jsonLd: JsonLdBlock[];
}
/** Extracts the handful of HTML facts that matter for crawlability. */
export declare function parseHtml(file: string, raw: string): HtmlFact;
export declare function visibleText(raw: string): string;
/** Finds \`<script type="application/ld+json">\` blocks and parses them. */
export declare function extractJsonLd(file: string, raw: string): JsonLdBlock[];
/** Parses fenced json blocks from Markdown that look like JSON-LD payloads. */
export declare function jsonLdFromCodeBlocks(file: string, blocks: {
    text: string;
    line: number;
}[]): JsonLdBlock[];
export interface SitemapFact {
    file: string;
    urls: string[];
}
export declare function parseSitemap(file: string, raw: string): SitemapFact;
/** True when the robots file explicitly allows the given agent (or \`*\`). */
export declare function robotsAllows(robots: RobotsFact | undefined, agent: string): boolean;
/** Returns the agents that are blocked from the whole site. */
export declare function blockedAgents(robots: RobotsFact | undefined, agents: readonly string[]): string[];
