/**
 * Text probes shared by the rule pack. Each helper answers one factual question
 * about a document; none of them decides a score.
 */
import type { Anchor, MarkdownDoc } from './types.js';
export declare const STOPWORDS: Set<string>;
export declare function anchors(doc: MarkdownDoc, line?: number): Anchor[];
/** The first meaningful paragraph of a document (after the title). */
export declare function firstParagraph(doc: MarkdownDoc): {
    text: string;
    line: number;
} | undefined;
export declare function fullText(doc: MarkdownDoc): string;
export declare function hasInstallCommand(doc: MarkdownDoc): {
    found: boolean;
    line?: number;
};
export declare function hasUsageSection(doc: MarkdownDoc): boolean;
export declare function hasFeatureList(doc: MarkdownDoc): boolean;
export declare function textBefore(doc: MarkdownDoc, line: number): string;
export interface SuperlativeHit {
    line: number;
    phrase: string;
    text: string;
}
/** Finds promotional claims that cannot be verified from the repository itself. */
export declare function findSuperlatives(doc: MarkdownDoc): SuperlativeHit[];
/** Numbers that assert a result but carry no citation on the same paragraph. */
export declare function findUncitedNumbers(doc: MarkdownDoc): {
    line: number;
    text: string;
}[];
/** Most frequent meaningful term; used to detect keyword stuffing. */
export declare function topTerm(doc: MarkdownDoc): {
    term: string;
    count: number;
} | undefined;
export declare function wordCountOf(doc: MarkdownDoc): number;
export declare function hasTableOfContents(doc: MarkdownDoc): boolean;
/** Headings ordered by line, used for hierarchy checks. */
export declare function headingJumps(doc: MarkdownDoc): {
    line: number;
    from: number;
    to: number;
}[];
/** Percentage (0-1) of the document below \`line\`. */
export declare function relativePosition(doc: MarkdownDoc, line: number): number;
export declare function joinedLists(doc: MarkdownDoc): string;
