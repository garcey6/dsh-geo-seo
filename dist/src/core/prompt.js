/**
 * Prompt rendering for the panel's "recommended prompt" cards.
 *
 * A prompt is only useful if it names the file it is about, so every rule ships
 * a template with placeholders and the renderer fills them from the finding's
 * anchor. Unknown placeholders are dropped rather than shown: the user must be
 * able to paste the result without editing braces out of it.
 */
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_-]*)\}/g;
const CJK = /[\u4e00-\u9fff]/;
const FALLBACK_ZH = {
    plugin: '本项目',
    file: '相关文件',
    line: '对应位置',
    missing: '缺失的内容',
    title: '这个问题',
    suggestion: '按建议修改',
};
const FALLBACK_EN = {
    plugin: 'this project',
    file: 'the relevant file',
    line: 'the matching line',
    missing: 'the missing content',
    title: 'this issue',
    suggestion: 'apply the suggestion',
};
/** True when the template is written in Chinese; used for fallback wording. */
export function isChinese(text) {
    return CJK.test(text);
}
function fill(key, values, zh) {
    const fallback = zh ? FALLBACK_ZH : FALLBACK_EN;
    switch (key) {
        case 'plugin':
            return values.plugin?.trim() || fallback['plugin'];
        case 'file':
            return values.file?.trim() || fallback['file'];
        case 'line':
            return values.line === undefined ? fallback['line'] : String(values.line);
        case 'missing': {
            const items = (values.missing ?? []).map((item) => item.trim()).filter((item) => item !== '');
            if (items.length === 0)
                return fallback['missing'];
            if (items.length === 1)
                return items[0];
            return items.slice(0, -1).join(zh ? '、' : ', ') + (zh ? ' 和 ' : ' and ') + items[items.length - 1];
        }
        case 'title':
            return values.title?.trim() || fallback['title'];
        case 'suggestion':
            return values.suggestion?.trim() || fallback['suggestion'];
        default:
            // Unknown placeholder: drop it so the prompt stays paste-ready.
            return '';
    }
}
/**
 * Fills a template and tidies the result: runs of spaces collapse, spaces before
 * punctuation disappear, and the prompt is trimmed to a single paragraph.
 */
export function renderPrompt(template, values = {}) {
    const zh = isChinese(template);
    let text = template.replace(PLACEHOLDER, (_match, key) => fill(key, values, zh));
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/ +([,.;:!?，。；：！？、）】」』])/g, '$1');
    text = text.replace(/([（【「『]) +/g, '$1');
    return text.trim();
}
/** Every placeholder a template uses, in order, for coverage tests. */
export function promptPlaceholders(template) {
    const found = [];
    for (const match of template.matchAll(PLACEHOLDER)) {
        if (match[1] && !found.includes(match[1]))
            found.push(match[1]);
    }
    return found;
}
/** Placeholders the renderer understands. */
export const PROMPT_PLACEHOLDERS = ['plugin', 'file', 'line', 'missing', 'title', 'suggestion'];
