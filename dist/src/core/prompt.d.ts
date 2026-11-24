/**
 * Prompt rendering for the panel's "recommended prompt" cards.
 *
 * A prompt is only useful if it names the file it is about, so every rule ships
 * a template with placeholders and the renderer fills them from the finding's
 * anchor. Unknown placeholders are dropped rather than shown: the user must be
 * able to paste the result without editing braces out of it.
 */
/** Values a prompt template may reference. */
export interface PromptValues {
    /** Package name, or the directory basename when package.json has none. */
    plugin?: string;
    /** Repository-relative file the finding points at. */
    file?: string;
    /** 1-based line in that file, when the finding knows one. */
    line?: number;
    /** Names the rule wanted and did not find, e.g. an install command. */
    missing?: readonly string[];
    /** Finding title, for templates that quote the problem. */
    title?: string;
    /** The rule's own suggestion, for templates that end with it. */
    suggestion?: string;
}
/** True when the template is written in Chinese; used for fallback wording. */
export declare function isChinese(text: string): boolean;
/**
 * Fills a template and tidies the result: runs of spaces collapse, spaces before
 * punctuation disappear, and the prompt is trimmed to a single paragraph.
 */
export declare function renderPrompt(template: string, values?: PromptValues): string;
/** Every placeholder a template uses, in order, for coverage tests. */
export declare function promptPlaceholders(template: string): string[];
/** Placeholders the renderer understands. */
export declare const PROMPT_PLACEHOLDERS: readonly ["plugin", "file", "line", "missing", "title", "suggestion"];
