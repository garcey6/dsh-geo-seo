/**
 * Prompt and urgency copy for every rule in the pack.
 *
 * Kept apart from rules.ts so rule logic stays readable: each entry here is the
 * panel-facing half of a rule (how urgent it is, what it costs the reader, and a
 * prompt the user can paste into a coding agent). tests/prompt.test.ts fails the
 * build when a rule has no entry, so the pack cannot drift.
 */
import type { RulePromptFields } from './types.js';
export declare const PROMPTS: Record<string, RulePromptFields>;
/** Rule ids that must have prompts: the 34 scored rules plus 3 advisories. */
export declare const PROMPT_RULE_IDS: string[];
