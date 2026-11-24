/**
 * F1 source inspection: what the plugin actually exports, which tools and
 * commands it registers, and which config keys its schema declares.
 *
 * This is deliberately a lexical pass, not a full compiler-API type check:
 * GEO scoring only needs names and line anchors, and a regex pass cannot be
 * broken by syntax the current TypeScript version does not understand yet.
 */
import type { SourceFact } from './types.js';
export declare function inspectSource(file: string, raw: string): SourceFact;
