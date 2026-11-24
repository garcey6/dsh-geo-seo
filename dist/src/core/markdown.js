import { countWords, normalizeWhitespace, stripInlineMarkdown } from './util.js';
const ATX = /^( {0,3})(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/;
const LIST_ITEM = /^( *)([-*+]|(\d{1,9})[.)])[ \t]+(.*)$/;
const TABLE_DIVIDER = /^ *\|? *:?-{2,}:? *(\| *:?-{2,}:? *)*\|? *$/;
const LINK = /\[([^\]]*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s<>()\]]+/g;
export function detectKind(file) {
    const base = file.split('/').pop()?.toLowerCase() ?? file.toLowerCase();
    if (base.startsWith('readme'))
        return 'readme';
    if (base.startsWith('changelog') || base.startsWith('changes') || base.startsWith('history'))
        return 'changelog';
    if (base.startsWith('license') || base.startsWith('licence') || base.startsWith('copying'))
        return 'license';
    if (base.endsWith('.md') || base.endsWith('.mdx'))
        return 'doc';
    return 'other';
}
export function parseMarkdown(file, raw, kind = detectKind(file)) {
    const normalized = raw.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n').map((text, index) => ({ number: index + 1, text }));
    const headings = [];
    const paragraphs = [];
    const lists = [];
    const codeBlocks = [];
    const tables = [];
    const links = [];
    const frontmatter = {};
    let cursor = 0;
    let bodyWords = 0;
    // YAML front matter: only when the file starts with '---' and closes with one.
    if (lines[0]?.text.trim() === '---') {
        for (let i = 1; i < Math.min(lines.length, 80); i += 1) {
            const line = lines[i];
            if (!line)
                break;
            if (line.text.trim() === '---') {
                cursor = i + 1;
                break;
            }
            const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line.text);
            if (match?.[1])
                frontmatter[match[1]] = (match[2] ?? '').replace(/^["']|["']$/g, '').trim();
        }
    }
    while (cursor < lines.length) {
        const line = lines[cursor];
        if (!line)
            break;
        const text = line.text;
        if (!text.trim()) {
            cursor += 1;
            continue;
        }
        // Fenced code block.
        const fenceMatch = FENCE.exec(text);
        if (fenceMatch) {
            const marker = fenceMatch[1] ?? '`';
            const lang = (fenceMatch[2] ?? '').trim().split(/\s+/)[0] ?? '';
            const startLine = line.number;
            const buffer = [];
            cursor += 1;
            while (cursor < lines.length) {
                const inner = lines[cursor];
                if (!inner)
                    break;
                if (new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}').test(inner.text.trim())) {
                    cursor += 1;
                    break;
                }
                buffer.push(inner.text);
                cursor += 1;
            }
            codeBlocks.push({ lang, text: buffer.join('\n'), line: startLine });
            continue;
        }
        // Indented (4 space) code block, only when it clearly is one.
        if (/^ {4}\S/.test(text) && !LIST_ITEM.test(text) && headings.length > 0) {
            const startLine = line.number;
            const buffer = [];
            while (cursor < lines.length) {
                const inner = lines[cursor];
                if (!inner)
                    break;
                if (inner.text.trim() && !/^ {4}/.test(inner.text))
                    break;
                buffer.push(inner.text.replace(/^ {4}/, ''));
                cursor += 1;
            }
            codeBlocks.push({ lang: '', text: buffer.join('\n').trimEnd(), line: startLine });
            continue;
        }
        // ATX heading.
        const atx = ATX.exec(text);
        if (atx) {
            const level = (atx[2] ?? '#').length;
            const title = stripInlineMarkdown(atx[3] ?? '').trim();
            headings.push({ level, text: title, line: line.number });
            collectLinks(title, line.number, links);
            cursor += 1;
            continue;
        }
        // Setext heading (=== or --- under a non-empty line).
        const next = lines[cursor + 1];
        if (next && text.trim() && !LIST_ITEM.test(text) && !text.includes('|')) {
            if (/^ {0,3}=+[ \t]*$/.test(next.text)) {
                headings.push({ level: 1, text: stripInlineMarkdown(text).trim(), line: line.number });
                cursor += 2;
                continue;
            }
            if (/^ {0,3}-+[ \t]*$/.test(next.text) && headings.length > 0) {
                headings.push({ level: 2, text: stripInlineMarkdown(text).trim(), line: line.number });
                cursor += 2;
                continue;
            }
        }
        // Table: header row followed by a divider row.
        if (text.includes('|') && next && TABLE_DIVIDER.test(next.text) && next.text.includes('-')) {
            const header = splitRow(text);
            const rows = [];
            const startLine = line.number;
            cursor += 2;
            while (cursor < lines.length) {
                const inner = lines[cursor];
                if (!inner || !inner.text.includes('|') || !inner.text.trim())
                    break;
                rows.push(splitRow(inner.text));
                cursor += 1;
            }
            tables.push({ header, rows, line: startLine });
            for (const cell of header)
                collectLinks(cell, startLine, links);
            for (const row of rows) {
                for (const cell of row)
                    collectLinks(cell, startLine, links);
            }
            continue;
        }
        // List.
        const listMatch = LIST_ITEM.exec(text);
        if (listMatch) {
            const items = [];
            const startLine = line.number;
            while (cursor < lines.length) {
                const inner = lines[cursor];
                if (!inner)
                    break;
                const item = LIST_ITEM.exec(inner.text);
                if (item) {
                    items.push(stripInlineMarkdown(item[4] ?? '').trim());
                    collectLinks(item[4] ?? '', inner.number, links);
                    cursor += 1;
                    continue;
                }
                // Continuation line of the previous item.
                if (inner.text.trim() && /^ {2,}\S/.test(inner.text) && items.length > 0) {
                    const last = items.length - 1;
                    items[last] = (items[last] ?? '') + ' ' + stripInlineMarkdown(inner.text).trim();
                    cursor += 1;
                    continue;
                }
                break;
            }
            lists.push({ ordered: listMatch[3] !== undefined, items, line: startLine });
            bodyWords += countWords(items.join(' '));
            continue;
        }
        // Paragraph: consecutive plain lines.
        const startLine = line.number;
        const buffer = [];
        while (cursor < lines.length) {
            const inner = lines[cursor];
            if (!inner)
                break;
            const value = inner.text;
            if (!value.trim())
                break;
            if (FENCE.test(value) || ATX.test(value))
                break;
            if (LIST_ITEM.test(value))
                break;
            if (/^ {0,3}(=+|-+)[ \t]*$/.test(value) && buffer.length > 0)
                break;
            buffer.push(value.trim());
            collectLinks(value, inner.number, links);
            cursor += 1;
        }
        const plain = stripInlineMarkdown(buffer.join('\n'));
        paragraphs.push({ text: normalizeWhitespace(plain), line: startLine });
        bodyWords += countWords(plain);
    }
    // De-duplicate links (same href + line) but keep document order.
    const seenLinks = new Set();
    const uniqueLinks = links.filter((link) => {
        const key = link.line + '|' + link.href;
        if (seenLinks.has(key))
            return false;
        seenLinks.add(key);
        return true;
    });
    const sections = buildSections(headings, paragraphs, lists, lineCount(normalized));
    return {
        file,
        kind,
        raw: normalized,
        lineCount: lineCount(normalized),
        headings,
        paragraphs,
        lists,
        codeBlocks,
        tables,
        links: uniqueLinks,
        wordCount: bodyWords,
        frontmatter,
        sections,
    };
}
function lineCount(text) {
    return text.split('\n').length;
}
function splitRow(text) {
    return text
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((cell) => stripInlineMarkdown(cell).trim());
}
function collectLinks(text, line, out) {
    let match;
    LINK.lastIndex = 0;
    while ((match = LINK.exec(text)) !== null) {
        out.push({ text: (match[1] ?? '').trim(), href: match[2] ?? '', line });
    }
    BARE_URL.lastIndex = 0;
    while ((match = BARE_URL.exec(text)) !== null) {
        const href = match[0].replace(/[.,;:]+$/, '');
        out.push({ text: href, href, line });
    }
}
/** Builds heading sections: each heading plus everything up to the next peer. */
function buildSections(headings, paragraphs, lists, totalLines) {
    const sections = [];
    const sorted = [...headings].sort((a, b) => a.line - b.line);
    for (let i = 0; i < sorted.length; i += 1) {
        const heading = sorted[i];
        if (!heading)
            continue;
        let endLine = totalLines;
        for (let j = i + 1; j < sorted.length; j += 1) {
            const other = sorted[j];
            if (other && other.level <= heading.level) {
                endLine = other.line - 1;
                break;
            }
        }
        const parts = [];
        for (const paragraph of paragraphs) {
            if (paragraph.line > heading.line && paragraph.line <= endLine)
                parts.push(paragraph.text);
        }
        for (const list of lists) {
            if (list.line > heading.line && list.line <= endLine)
                parts.push(list.items.join(' '));
        }
        sections.push({
            level: heading.level,
            title: heading.text,
            line: heading.line,
            endLine,
            text: normalizeWhitespace(parts.join(' ')),
            headings: sorted.filter((item) => item.line > heading.line && item.line <= endLine),
        });
    }
    return sections;
}
/** Returns the text before the first heading - the lead of the document. */
export function leadText(doc) {
    const firstHeadingLine = doc.headings[0]?.line ?? Number.MAX_SAFE_INTEGER;
    const parts = [];
    for (const paragraph of doc.paragraphs) {
        if (paragraph.line < firstHeadingLine)
            parts.push(paragraph.text);
    }
    return parts.join(' ');
}
/** All body text, in document order, ignoring code blocks. */
export function bodyText(doc) {
    const blocks = [
        ...doc.paragraphs.map((p) => ({ line: p.line, text: p.text })),
        ...doc.lists.map((l) => ({ line: l.line, text: l.items.join(' ') })),
        ...doc.tables.map((t) => ({ line: t.line, text: t.header.join(' ') + ' ' + t.rows.map((r) => r.join(' ')).join(' ') })),
    ];
    return blocks
        .sort((a, b) => a.line - b.line)
        .map((block) => block.text)
        .join('\n');
}
