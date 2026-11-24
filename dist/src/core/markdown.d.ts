/**
 * A small, line-oriented Markdown parser.
 *
 * It only extracts what the rule engine needs - headings with their exact line
 * numbers, paragraphs, lists, fenced code, tables, links and sections - and it
 * never rewrites the source. Every node keeps the 1-based line where it starts
 * so a finding can be traced back to the file.
 */
import type { DocumentKind, MarkdownDoc } from './types.js';
export declare function detectKind(file: string): DocumentKind;
export declare function parseMarkdown(file: string, raw: string, kind?: DocumentKind): MarkdownDoc;
/** Returns the text before the first heading - the lead of the document. */
export declare function leadText(doc: MarkdownDoc): string;
/** All body text, in document order, ignoring code blocks. */
export declare function bodyText(doc: MarkdownDoc): string;
