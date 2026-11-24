import { bodyText, leadText } from './markdown.js';
import { normalizeWhitespace, countWords } from './util.js';
export const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'our', 'are', 'was', 'were',
    'have', 'has', 'had', 'not', 'but', 'can', 'will', 'use', 'using', 'used', 'into', 'when', 'what',
    'how', 'all', 'any', 'more', 'most', 'than', 'then', 'them', 'they', 'there', 'here', 'also',
    'which', 'while', 'about', 'after', 'before', 'each', 'does', 'did', 'been', 'being', 'such',
    'only', 'over', 'under', 'very', 'just', 'like', 'make', 'made', 'may', 'might', 'must', 'need',
    'one', 'two', 'its', 'it\'s', 'is', 'of', 'to', 'in', 'on', 'by', 'as', 'at', 'be', 'or', 'an',
    'a', 'if', 'so', 'no', 'up', 'out', 'off', 'do', 'we', 'it', 'he', 'she', 'his', 'her', 'their',
    '的', '了', '和', '与', '及', '在', '是', '为', '对', '从', '到', '把', '被', '让', '给', '等',
]);
export function anchors(doc, line) {
    return line === undefined ? [{ file: doc.file }] : [{ file: doc.file, line }];
}
/** The first meaningful paragraph of a document (after the title). */
export function firstParagraph(doc) {
    const first = doc.paragraphs.find((paragraph) => normalizeWhitespace(paragraph.text).length > 40);
    return first ? { text: first.text, line: first.line } : undefined;
}
export function fullText(doc) {
    return leadText(doc) + '\n' + bodyText(doc);
}
const INSTALL = /(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b|\bnpx\s+[\w@/.-]+|\bdsh\s+plugin\b|pip\s+install\b|go\s+install\b|cargo\s+install\b/i;
export function hasInstallCommand(doc) {
    for (const block of doc.codeBlocks) {
        if (INSTALL.test(block.text))
            return { found: true, line: block.line };
    }
    for (const paragraph of doc.paragraphs) {
        if (INSTALL.test(paragraph.text))
            return { found: true, line: paragraph.line };
    }
    for (const list of doc.lists) {
        if (INSTALL.test(list.items.join(' ')))
            return { found: true, line: list.line };
    }
    return { found: false };
}
const USAGE = /\b(?:usage|quick\s*start|getting\s+started|example|how\s+to)\b|使用方法|快速开始|用法|示例/i;
export function hasUsageSection(doc) {
    return doc.headings.some((heading) => USAGE.test(heading.text)) || doc.codeBlocks.length > 0;
}
export function hasFeatureList(doc) {
    return doc.lists.some((list) => list.items.length >= 3);
}
export function textBefore(doc, line) {
    return doc.raw.split('\n').slice(0, Math.max(0, line - 1)).join('\n');
}
const SUPERLATIVE_PATTERNS = [
    { pattern: /guarantee[ds]?(?:\s+(?:ranking|traffic|results?))?/gi, label: 'guarantee' },
    { pattern: /best[- ]in[- ]class|world['’]s\s+(?:best|leading)|#1\s+(?:choice|plugin)/gi, label: 'best-in-class' },
    { pattern: /(?:排名|流量|收录|曝光|转化)[^。.\n]{0,8}(?:提升|增长|翻倍)\s*\d+\s*%/g, label: 'percentage uplift claim' },
    { pattern: /(?:guaranteed|ensure|boost)[^.\n]{0,20}\d+\s*%/gi, label: 'percentage uplift claim' },
    { pattern: /第[一1]名|排名第一|行业第一|稳居第一|全网第一|官方推荐|唯一官方|100%\s*(?:有效|提升|收录|排名)/g, label: 'unverifiable ranking claim' },
    { pattern: /(?:保证|确保)[^。\n]{0,10}(?:排名|流量|收录|第一)/g, label: 'guarantee' },
];
/** Finds promotional claims that cannot be verified from the repository itself. */
export function findSuperlatives(doc) {
    const hits = [];
    const lines = doc.raw.split('\n');
    lines.forEach((text, index) => {
        for (const { pattern, label } of SUPERLATIVE_PATTERNS) {
            pattern.lastIndex = 0;
            const match = pattern.exec(text);
            if (match) {
                hits.push({ line: index + 1, phrase: label, text: normalizeWhitespace(match[0]) });
                break;
            }
        }
    });
    return hits;
}
const NUMERIC_CLAIM = /(\d+(?:\.\d+)?\s*%|\b\d+x\b|\b\d{3,}\+)/i;
/** Numbers that assert a result but carry no citation on the same paragraph. */
export function findUncitedNumbers(doc) {
    const out = [];
    for (const paragraph of doc.paragraphs) {
        const match = NUMERIC_CLAIM.exec(paragraph.text);
        if (!match)
            continue;
        const value = match[0];
        // Versions, years and ports are not performance claims.
        if (/^\d{4}$/.test(value) && Number(value) >= 1990 && Number(value) <= 2100)
            continue;
        if (new RegExp('(?:v|version|版本|node|端口|port)\\s*' + value.replace('.', '\\.'), 'i').test(paragraph.text))
            continue;
        const hasLink = doc.links.some((link) => Math.abs(link.line - paragraph.line) <= 2);
        const hasCitation = /\[\d+\]|（来源|\(source|according to|据.{0,6}统计/i.test(paragraph.text);
        if (!hasLink && !hasCitation)
            out.push({ line: paragraph.line, text: paragraph.text.slice(0, 160) });
    }
    return out;
}
/** Most frequent meaningful term; used to detect keyword stuffing. */
export function topTerm(doc) {
    const text = fullText(doc).toLowerCase();
    const words = text.match(/[a-z][a-z0-9'-]{2,}/g) ?? [];
    if (words.length < 120)
        return undefined;
    const counts = new Map();
    for (const word of words) {
        if (STOPWORDS.has(word))
            continue;
        counts.set(word, (counts.get(word) ?? 0) + 1);
    }
    let best;
    for (const [term, count] of counts) {
        if (!best || count > best.count)
            best = { term, count };
    }
    return best;
}
export function wordCountOf(doc) {
    return doc.wordCount || countWords(fullText(doc));
}
export function hasTableOfContents(doc) {
    const tocHeading = doc.headings.find((heading) => /^(table of contents|contents|目录)$/i.test(heading.text.trim()));
    if (!tocHeading)
        return false;
    return doc.links.some((link) => link.href.startsWith('#') && link.line > tocHeading.line);
}
/** Headings ordered by line, used for hierarchy checks. */
export function headingJumps(doc) {
    const jumps = [];
    const sorted = [...doc.headings].sort((a, b) => a.line - b.line);
    for (let i = 1; i < sorted.length; i += 1) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        if (!previous || !current)
            continue;
        if (current.level > previous.level + 1) {
            jumps.push({ line: current.line, from: previous.level, to: current.level });
        }
    }
    return jumps;
}
/** Percentage (0-1) of the document below \`line\`. */
export function relativePosition(doc, line) {
    return doc.lineCount <= 1 ? 0 : line / doc.lineCount;
}
export function joinedLists(doc) {
    return doc.lists.map((list) => list.items.join(' ')).join('\n');
}
