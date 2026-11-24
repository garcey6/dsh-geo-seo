/**
 * Shared domain types for the GEO/SEO kernel.
 *
 * The whole pipeline is built around one idea: nothing is scored that is not
 * anchored to a fact. Every fact below carries a source anchor (file, line,
 * node path) so a deduction can always be traced back to the exact text that
 * caused it.
 */
export const ENGINE_VERSION = '0.1.0';
export const REPORT_SCHEMA_VERSION = 1;
