/**
 * The versioned rule pack.
 *
 * Rules are data plus a small check function, and the pack carries its own
 * version so a report can always say which rules produced it. Deductions are
 * capped per dimension by the scorer, not here.
 */
import type { DimensionId, RuleContext, RuleDefinition, RuleDefinitionBase, RulePromptFields } from './types.js';
import { PROMPTS } from './prompts.js';
import {
  anchors,
  findSuperlatives,
  findUncitedNumbers,
  firstParagraph,
  fullText,
  hasFeatureList,
  hasInstallCommand,
  hasUsageSection,
  headingJumps,
  relativePosition,
  topTerm,
  wordCountOf,
} from './rules-helpers.js';
import { bodyText, leadText } from './markdown.js';
import { AI_CRAWLERS, blockedAgents } from './site.js';
import { daysBetween, parseDate } from './util.js';

export const RULE_PACK_VERSION = '2026.02.1';
export const RULE_PACK_RELEASED = '2026-02-18';

export const RULE_PACK = {
  name: 'geo-seo-core',
  version: RULE_PACK_VERSION,
  released: RULE_PACK_RELEASED,
  /** Bumped whenever weights or gate conditions change. */
  scoringVersion: 1,
  notes:
    'Weights follow the product PRD (relevance 28 / structure 22 / facts 18 / freshness 10 / machine 12 / trust 7 / compliance 3). ' +
    'Evidence levels describe how well supported each rule is, not how much it deducts.',
} as const;

export const DIMENSIONS: { id: DimensionId; label: string; weight: number; purpose: string }[] = [
  { id: 'relevance', label: 'Topic relevance and intent match', weight: 28, purpose: 'Does the page answer "what does this plugin do" immediately and in the same words the user would use?' },
  { id: 'structure', label: 'Key-information structure and position', weight: 22, purpose: 'Are the conclusion and the key points early, discrete and scannable?' },
  { id: 'facts', label: 'Fact density and verifiability', weight: 18, purpose: 'Can a reader (human or engine) verify install, version, options and behaviour from the page itself?' },
  { id: 'freshness', label: 'Time freshness', weight: 10, purpose: 'Is the update date stated and consistent with the repository history?' },
  { id: 'machine', label: 'Machine-readable structure', weight: 12, purpose: 'Do headings, structured data and optional llms.txt agree with the visible body?' },
  { id: 'trust', label: 'Trust signals', weight: 7, purpose: 'Is there a maintainer, a license and a place to report problems?' },
  { id: 'compliance', label: 'Consistency and compliance', weight: 3, purpose: 'Are there claims that cannot be verified, or machine text presented as human text?' },
];

const MIN_WORDS = 600;
const STALE_DAYS = 365;
const DRIFT_DAYS = 90;

/** Rule data before the panel copy is attached; see RULES below. */
const BASE_RULES: RuleDefinitionBase[] = [
  // ---------------------------------------------------------------- relevance
  {
    id: 'REL-001',
    dimension: 'relevance',
    severity: 'error',
    deduction: 18,
    title: 'No README to answer the question',
    detail: 'The repository has no README.md, so there is no page that states what the plugin does.',
    suggestion: 'Add a README.md whose first paragraph says what the plugin does, for whom, and what changes after installing it.',
    evidence: 'strong',
    rationale: 'Strong: a page that never states its subject cannot be matched to an intent, regardless of engine.',
    check: (ctx) => {
      if (ctx.primary) return [];
      return [{
        title: 'No README found',
        detail: 'The scan found no README.md and no other Markdown document to stand in for it.',
        suggestion: 'Add README.md with a title, a one-paragraph summary and an install command.',
        deduction: 18,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },
  {
    id: 'REL-002',
    dimension: 'relevance',
    severity: 'warning',
    deduction: 8,
    title: 'Primary document has no H1 title',
    detail: 'The first heading is not a level-1 heading, or there is no heading at all.',
    suggestion: 'Open with a single \`# <product name>\` heading that names the thing the page is about.',
    evidence: 'moderate',
    rationale: 'Moderate: an H1 is the strongest on-page subject signal and is also what most extractors use as the page title.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const h1 = doc.headings.find((heading) => heading.level === 1);
      if (h1) return [];
      return [{
        title: 'No level-1 heading',
        detail: 'Headings start at level ' + (doc.headings[0]?.level ?? 0) + ' or are absent.',
        suggestion: 'Add a single H1 such as \`# dsh-geo-seo\` before any section.',
        deduction: 8,
        anchors: anchors(doc, doc.headings[0]?.line ?? 1),
      }];
    },
  },
  {
    id: 'REL-003',
    dimension: 'relevance',
    severity: 'warning',
    deduction: 6,
    title: 'Lead paragraph does not say what the product is',
    detail: 'The first 300 characters do not contain a definition sentence ("X is a ...", "X 是一个 ...", "X provides ...").',
    suggestion: 'Rewrite the opening sentence as "X is a <category> that <does what>, for <whom>". Keep it under 40 words.',
    evidence: 'strong',
    rationale: 'Strong: answer engines extract the first self-contained definition sentence; without one they paraphrase the title instead.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const first = firstParagraph(doc);
      const candidate = (leadText(doc) || first?.text || '').slice(0, 300);
      if (!candidate) {
        return [{
          title: 'No opening paragraph',
          detail: 'The document opens directly with headings.',
          suggestion: 'Add a two-sentence summary directly under the H1.',
          deduction: 6,
          anchors: anchors(doc, doc.headings[0]?.line ?? 1),
        }];
      }
      // CJK alternatives must not sit inside \b: Chinese characters are non-word
      // characters to JavaScript, so a word boundary can never appear beside them.
      const definesLatin = /\b(?:is|are)\s+(?:a|an|the)\b|\bprovides?\b|\bhelps?\b|\benables?\b/i.test(candidate);
      const definesCjk = /(?:是一个|是一款|是一套|用于|提供|帮助|支持)/.test(candidate);
      const defines = definesLatin || definesCjk;
      if (defines) return [];
      return [{
        title: 'Opening does not define the product',
        detail: 'Opening text: "' + candidate.slice(0, 160) + '"',
        suggestion: 'Start with "<name> is a <category> that <outcome>" before any feature or marketing sentence.',
        deduction: 6,
        anchors: anchors(doc, first?.line ?? 1),
      }];
    },
  },
  {
    id: 'REL-004',
    dimension: 'relevance',
    severity: 'info',
    deduction: 4,
    title: 'Title and body name different entities',
    detail: 'The package name (or its main token) does not appear in the title or the lead paragraph.',
    suggestion: 'Use the published package name in the H1 and in the first sentence so the page and the package are the same entity.',
    evidence: 'moderate',
    rationale: 'Moderate: entity mismatch makes the page and the package look like two products to an extractor.',
    check: (ctx) => {
      const doc = ctx.primary;
      const name = ctx.graph.packageJson?.name;
      if (!doc || !name) return [];
      const token = name.replace(/^@[^/]+\//, '');
      const heading = doc.headings.find((item) => item.level === 1)?.text ?? '';
      const lead = leadText(doc) || firstParagraph(doc)?.text || '';
      if ((heading + ' ' + lead).toLowerCase().includes(token.toLowerCase())) return [];
      return [{
        title: 'Package name absent from the opening',
        detail: 'package.json name is "' + name + '" but the title and first paragraph never mention "' + token + '".',
        suggestion: 'Put "' + token + '" in the H1 and in the first sentence.',
        deduction: 4,
        anchors: anchors(doc, doc.headings[0]?.line ?? 1),
      }];
    },
  },
  {
    id: 'REL-005',
    dimension: 'relevance',
    severity: 'warning',
    deduction: 5,
    title: 'Keyword repeated to the point of stuffing',
    detail: 'One term dominates the body text, which reads as keyword stuffing rather than explanation.',
    suggestion: 'Cut repetitions of the dominant term; use pronouns and synonyms, and move the term into headings instead of body text.',
    evidence: 'moderate',
    rationale: 'Moderate: overt repetition is the classic anti-pattern penalised in the GEO study cited by the PRD, but the threshold is heuristic.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const top = topTerm(doc);
      const words = wordCountOf(doc);
      if (!top || words < 150) return [];
      const density = top.count / words;
      if (density <= 0.035 || top.count < 15) return [];
      return [{
        title: 'Term "' + top.term + '" used ' + top.count + ' times',
        detail: 'Density ' + (density * 100).toFixed(1) + '% of ' + words + ' words.',
        suggestion: 'Keep the term in headings and the first paragraph; replace at least half the body repetitions with pronouns or synonyms.',
        deduction: 5,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'REL-100',
    dimension: 'relevance',
    severity: 'warning',
    deduction: 28,
    title: 'Documentation is too short to answer real questions',
    detail: 'The score is reduced in proportion to the gap between the documented length and the ' + MIN_WORDS + '-word floor.',
    suggestion: 'Document install, configuration, a worked example and the failure modes; the page needs enough text to answer follow-up questions.',
    evidence: 'weak',
    rationale: 'Weak: the floor is a product decision from the PRD (length gap reduces relevance proportionally), not a published ranking factor.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      // The PRD asks for a repository-wide length floor: one deep page plus a
      // thin primary page still answers questions.
      const words = ctx.graph.docs.reduce((sum, entry) => sum + wordCountOf(entry), 0);
      if (words >= MIN_WORDS) return [];
      const gap = (MIN_WORDS - words) / MIN_WORDS;
      const deduction = Math.max(1, Math.round(28 * gap * 10) / 10);
      return [{
        title: 'Only ' + words + ' words of body text',
        detail: 'Relevance is reduced by ' + Math.round(gap * 100) + '% of its weight because the documentation is ' + Math.round(gap * 100) + '% short of the ' + MIN_WORDS + '-word floor.',
        suggestion: 'Add the missing sections rather than padding: configuration reference, two or three real examples, and troubleshooting.',
        deduction,
        anchors: anchors(doc),
      }];
    },
  },

  // ---------------------------------------------------------------- structure
  {
    id: 'STR-001',
    dimension: 'structure',
    severity: 'warning',
    deduction: 5,
    title: 'Heading levels skip a step',
    detail: 'A heading jumps more than one level (for example H2 to H4), which breaks the document outline.',
    suggestion: 'Nest headings one level at a time so the outline is continuous.',
    evidence: 'moderate',
    rationale: 'Moderate: a broken outline degrades section extraction, but the effect size is not published.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      return headingJumps(doc).slice(0, 3).map((jump) => ({
        title: 'H' + jump.from + ' to H' + jump.to,
        detail: 'Heading hierarchy jumps from level ' + jump.from + ' to level ' + jump.to + '.',
        suggestion: 'Insert the missing H' + (jump.from + 1) + ' level or demote the following headings.',
        deduction: 5,
        anchors: anchors(doc, jump.line),
      }));
    },
  },
  {
    id: 'STR-002',
    dimension: 'structure',
    severity: 'warning',
    deduction: 6,
    title: 'No section structure',
    detail: 'The document has fewer than two H2 sections, so key points are not separable.',
    suggestion: 'Split the body into H2 sections: what it does, install, configure, usage, and limits.',
    evidence: 'moderate',
    rationale: 'Moderate: sections are what extractors quote; a single blob is harder to attribute to a sub-question.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const h2 = doc.headings.filter((heading) => heading.level === 2).length;
      if (h2 >= 2) return [];
      return [{
        title: h2 === 0 ? 'No H2 sections' : 'Only one H2 section',
        detail: 'Found ' + h2 + ' level-2 headings.',
        suggestion: 'Add at least "What it does", "Install", "Usage" and "Configuration" as H2 sections.',
        deduction: 6,
        anchors: anchors(doc, doc.headings[0]?.line ?? 1),
      }];
    },
  },
  {
    id: 'STR-003',
    dimension: 'structure',
    severity: 'warning',
    deduction: 5,
    title: 'Core answer is buried',
    detail: 'The install command or the usage example only appears in the second half of the page.',
    suggestion: 'Move the install command and one usage example into the first screen of the document.',
    evidence: 'moderate',
    rationale: 'Moderate: quotation favours early, self-contained passages; a command after the midpoint is often truncated by extractors.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const install = hasInstallCommand(doc);
      if (!install.found || install.line === undefined) return [];
      const position = relativePosition(doc, install.line);
      if (position <= 0.5) return [];
      return [{
        title: 'Install command at ' + Math.round(position * 100) + '% of the page',
        detail: 'The first install command is on line ' + install.line + ' of ' + doc.lineCount + '.',
        suggestion: 'Add an "Install" section directly after the summary with a copy-ready command.',
        deduction: 5,
        anchors: anchors(doc, install.line),
      }];
    },
  },
  {
    id: 'STR-004',
    dimension: 'structure',
    severity: 'info',
    deduction: 3,
    title: 'Feature points are prose, not a list',
    detail: 'The document has no list with at least three items, so points cannot be quoted individually.',
    suggestion: 'Turn the feature paragraph into a bulleted list of short, self-contained points.',
    evidence: 'weak',
    rationale: 'Weak: list formatting helps extraction in practice but has no published weighting.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc || hasFeatureList(doc)) return [];
      return [{
        title: 'No list of three or more items',
        detail: 'The body uses paragraphs only.',
        suggestion: 'Add bullets for capabilities, supported platforms or limits.',
        deduction: 3,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'STR-005',
    dimension: 'structure',
    severity: 'info',
    deduction: 3,
    title: 'Multiple H1 headings',
    detail: 'More than one level-1 heading makes the page look like several documents stitched together.',
    suggestion: 'Keep one H1 and demote the others to H2.',
    evidence: 'moderate',
    rationale: 'Moderate: multiple H1s confuse title extraction in most parsers.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const h1s = doc.headings.filter((heading) => heading.level === 1);
      if (h1s.length <= 1) return [];
      return [{
        title: h1s.length + ' H1 headings',
        detail: 'H1 headings at lines ' + h1s.map((heading) => heading.line).join(', ') + '.',
        suggestion: 'Keep the first H1 and demote the rest to H2.',
        deduction: 3,
        anchors: anchors(doc, h1s[1]?.line),
      }];
    },
  },
  {
    id: 'STR-006',
    dimension: 'structure',
    severity: 'info',
    deduction: 3,
    title: 'No table of contents for a long page',
    detail: 'The document is long but offers no internal navigation.',
    suggestion: 'Add a short table of contents linking to each H2.',
    evidence: 'heuristic',
    rationale: 'Heuristic: navigation helps readers and crawlers, but no engine documents it as a signal.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc || wordCountOf(doc) < 1200) return [];
      const hasToc = doc.links.some((link) => link.href.startsWith('#'));
      if (hasToc) return [];
      return [{
        title: 'Long page without internal anchors',
        detail: doc.lineCount + ' lines and ' + wordCountOf(doc) + ' words with no in-page links.',
        suggestion: 'Add a table of contents with links to each H2.',
        deduction: 3,
        anchors: anchors(doc),
      }];
    },
  },

  // -------------------------------------------------------------------- facts
  {
    id: 'FAC-001',
    dimension: 'facts',
    severity: 'error',
    deduction: 6,
    title: 'No install command',
    detail: 'The page never shows how to install or run the package.',
    suggestion: 'Add a fenced block with a copy-ready install command, including the package name.',
    evidence: 'strong',
    rationale: 'Strong: without an install path the reader cannot act on the page at all.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const install = hasInstallCommand(doc);
      if (install.found) return [];
      return [{
        title: 'Install command missing',
        detail: 'No npm/pnpm/yarn/npx invocation found in text or code blocks.',
        suggestion: 'Add \`npm install ' + (ctx.graph.packageJson?.name ?? '<package>') + '\` under an "Install" heading.',
        deduction: 6,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'FAC-002',
    dimension: 'facts',
    severity: 'warning',
    deduction: 4,
    title: 'Version is not stated',
    detail: 'The published version from package.json never appears in the documentation.',
    suggestion: 'State the documented version (and the supported range) near the install command.',
    evidence: 'moderate',
    rationale: 'Moderate: a version lets a reader verify the page matches the code they are running.',
    check: (ctx) => {
      const doc = ctx.primary;
      const version = ctx.graph.packageJson?.version;
      if (!doc || !version) return [];
      if (fullText(doc).includes(version)) return [];
      return [{
        title: 'Version ' + version + ' missing from docs',
        detail: 'package.json declares ' + version + ' but the documentation never mentions it.',
        suggestion: 'Add "Current version: ' + version + '" and a compatibility note.',
        deduction: 4,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'FAC-003',
    dimension: 'facts',
    severity: 'warning',
    deduction: 4,
    title: 'Config options are not documented',
    detail: 'The source declares configuration keys that the documentation never mentions.',
    suggestion: 'Document every configuration key with its type, default and effect.',
    evidence: 'strong',
    rationale: 'Strong: an undocumented option is unverifiable, and the reader cannot tell whether it exists.',
    check: (ctx) => {
      const keys = [...new Set(ctx.graph.sources.flatMap((source) => source.configKeys))];
      if (keys.length === 0) return [];
      const text = ctx.allText;
      const missing = keys.filter((key) => !text.includes(key.toLowerCase()));
      if (missing.length === 0) return [];
      const source = ctx.graph.sources.find((item) => item.configKeys.length > 0);
      return [{
        title: missing.length + ' config key(s) undocumented: ' + missing.slice(0, 4).join(', '),
        detail: 'Declared in ' + (source?.file ?? 'source') + ' but absent from the Markdown documents.',
        suggestion: 'Add a configuration table with columns name, type, default and description.',
        deduction: 4,
        anchors: source ? [{ file: source.file }] : [],
        missing: missing.slice(0, 6),
      }];
    },
  },
  {
    id: 'FAC-004',
    dimension: 'facts',
    severity: 'info',
    deduction: 3,
    title: 'No runnable example',
    detail: 'There is no code block showing actual use, only prose or commands.',
    suggestion: 'Add one minimal example that a reader can paste and run, with the expected output.',
    evidence: 'moderate',
    rationale: 'Moderate: executable examples are the densest verifiable fact a README can carry.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const example = doc.codeBlocks.find((block) => block.lang && block.lang !== 'bash' && block.lang !== 'sh' && block.lang !== 'shell');
      if (example) return [];
      return [{
        title: 'No code example',
        detail: 'Only shell commands were found (' + doc.codeBlocks.length + ' blocks).',
        suggestion: 'Add a fenced example in the plugin language plus its expected output.',
        deduction: 3,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'FAC-005',
    dimension: 'facts',
    severity: 'info',
    deduction: 3,
    title: 'No repository or issue link',
    detail: 'The documentation does not link to source, issues or the package registry.',
    suggestion: 'Link the repository, the issue tracker and the package page in a "Links" section.',
    evidence: 'moderate',
    rationale: 'Moderate: third-party verifiability is the point of "fact density"; links are its cheapest form.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      if (ctx.graph.packageJson?.repository) return [];
      const link = doc.links.find((item) => /github\.com|gitlab\.com|npmjs\.com|issues/i.test(item.href));
      if (link) return [];
      return [{
        title: 'No outbound project links',
        detail: 'package.json has no repository field and the README links nowhere verifiable.',
        suggestion: 'Add a "Links" section with repository, issues and registry URLs.',
        deduction: 3,
        anchors: anchors(doc),
      }];
    },
  },
  {
    id: 'FAC-006',
    dimension: 'facts',
    severity: 'warning',
    deduction: 4,
    title: 'Numbers without a source',
    detail: 'A paragraph asserts a measurable result without a citation or link nearby.',
    suggestion: 'Either cite the source inline (with a link) or remove the number.',
    evidence: 'moderate',
    rationale: 'Moderate: uncited numbers are the most common unverifiable claim, and the PRD forbids implying measured outcomes without evidence.',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      return findUncitedNumbers(doc).slice(0, 2).map((hit) => ({
        title: 'Uncited claim in paragraph',
        detail: '"' + hit.text + '"',
        suggestion: 'Add the source link, or drop the figure.',
        deduction: 4,
        anchors: anchors(doc, hit.line),
      }));
    },
  },

  // ---------------------------------------------------------------- freshness
  {
    id: 'FRE-001',
    dimension: 'freshness',
    severity: 'error',
    deduction: 5,
    title: 'No stated update date',
    detail: 'Neither the documentation nor the repository states when the page was last updated.',
    suggestion: 'Add a visible "Last updated: YYYY-MM-DD" line and keep it in sync with releases.',
    evidence: 'strong',
    rationale: 'Strong: without a date the reader cannot judge whether the page still describes the current version.',
    check: (ctx) => {
      if (ctx.graph.declaredUpdatedAt) return [];
      const doc = ctx.primary;
      return [{
        title: 'Update date absent',
        detail: 'No "last updated", "更新于" or front-matter date was found.',
        suggestion: 'Add "Last updated: ' + ctx.now.toISOString().slice(0, 10) + '" near the top of the README.',
        deduction: 5,
        anchors: anchors(doc ?? { file: 'README.md' } as never, undefined),
      }];
    },
  },
  {
    id: 'FRE-002',
    dimension: 'freshness',
    severity: 'warning',
    deduction: 4,
    title: 'Stated update date is stale',
    detail: 'The declared update date is more than ' + STALE_DAYS + ' days old.',
    suggestion: 'Re-verify the page against the current release and update the date.',
    evidence: 'strong',
    rationale: 'Strong: a stale stated date is a verifiable contradiction between the page and its own claim to currency.',
    check: (ctx) => {
      const declared = ctx.graph.declaredUpdatedAt;
      if (!declared) return [];
      const age = daysBetween(declared, ctx.now.toISOString().slice(0, 10));
      if (age <= STALE_DAYS) return [];
      const doc = ctx.primary;
      return [{
        title: 'Declared date is ' + age + ' days old',
        detail: 'Declared ' + declared + '; threshold is ' + STALE_DAYS + ' days.',
        suggestion: 'Review the page and update the date once it matches the current release.',
        deduction: 4,
        anchors: anchors(doc ?? { file: 'README.md' } as never),
      }];
    },
  },
  {
    id: 'FRE-003',
    dimension: 'freshness',
    severity: 'warning',
    deduction: 3,
    title: 'Stated date disagrees with the commit history',
    detail: 'The declared update date differs from the last commit date by more than ' + DRIFT_DAYS + ' days.',
    suggestion: 'Regenerate the date from the release process instead of editing it by hand.',
    evidence: 'strong',
    rationale: 'Strong: both dates are verifiable, so a disagreement is a factual inconsistency, not a heuristic.',
    check: (ctx) => {
      const declared = ctx.graph.declaredUpdatedAt;
      const commit = ctx.graph.git.lastCommitDate;
      if (!declared || !ctx.graph.git.available || !commit) return [];
      const drift = Math.abs(daysBetween(declared, commit));
      if (drift <= DRIFT_DAYS) return [];
      return [{
        title: 'Dates differ by ' + drift + ' days',
        detail: 'Declared ' + declared + ' vs last commit ' + commit + '.',
        suggestion: 'Update the stated date when cutting a release, or generate it from git.',
        deduction: 3,
        anchors: [{ file: ctx.primary?.file ?? 'README.md' }],
      }];
    },
  },
  {
    id: 'FRE-004',
    dimension: 'freshness',
    severity: 'info',
    deduction: 2,
    title: 'No changelog',
    detail: 'There is no CHANGELOG, so change history cannot be checked.',
    suggestion: 'Keep a CHANGELOG.md with dated releases.',
    evidence: 'weak',
    rationale: 'Weak: a changelog supports verification but its absence says little about the page itself.',
    check: (ctx) => {
      if (ctx.graph.docs.some((doc) => doc.kind === 'changelog')) return [];
      return [{
        title: 'CHANGELOG.md missing',
        detail: 'No changelog document was found in the repository.',
        suggestion: 'Add CHANGELOG.md with one entry per release, each dated.',
        deduction: 2,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },

  // ------------------------------------------------------------------ machine
  {
    id: 'MAC-001',
    dimension: 'machine',
    severity: 'warning',
    deduction: 4,
    title: 'No JSON-LD structured data',
    detail: 'No JSON-LD block was found in the HTML entry points or the documentation.',
    suggestion: 'Add one SoftwareApplication (or TechArticle) block; run \`geo-seo generate\` and keep only fields the visible text supports.',
    evidence: 'moderate',
    rationale: 'Moderate: structured data is the most direct machine-readable signal, but engines also parse the DOM.',
    check: (ctx) => {
      if (ctx.graph.site.jsonLd.length > 0) return [];
      return [{
        title: 'No JSON-LD found',
        detail: 'Searched static HTML and fenced json blocks.',
        suggestion: 'Generate a SoftwareApplication block from package.json and the README summary.',
        deduction: 4,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },
  {
    id: 'MAC-002',
    dimension: 'machine',
    severity: 'error',
    deduction: 5,
    title: 'Structured data is invalid or untyped',
    detail: 'A JSON-LD block is not valid JSON, or it lacks @context/@type.',
    suggestion: 'Validate every block; keep type within SoftwareApplication, TechArticle or FAQPage.',
    evidence: 'strong',
    rationale: 'Strong: an unparsable block is discarded outright, so it contributes nothing and signals breakage.',
    check: (ctx) => {
      const blocks = ctx.graph.site.jsonLd;
      const bad = blocks.filter((block) => {
        if (block.error) return true;
        const value = block.value as Record<string, unknown> | null;
        if (!value || typeof value !== 'object') return true;
        return !('@context' in value) || !('@type' in value);
      });
      return bad.slice(0, 3).map((block) => ({
        title: block.error ? 'JSON-LD is not valid JSON' : 'JSON-LD missing @context or @type',
        detail: block.error ?? 'Block at ' + block.file + ':' + block.line,
        suggestion: 'Fix the block or delete it; invalid structured data is worse than none.',
        deduction: 5,
        anchors: [{ file: block.file, line: block.line }],
      }));
    },
  },
  {
    id: 'MAC-003',
    dimension: 'machine',
    severity: 'info',
    deduction: 3,
    title: 'No llms.txt',
    detail: 'The repository does not publish llms.txt or ai.txt.',
    suggestion: 'Run \`geo-seo generate\` to render llms.txt from the same fact graph used for scoring.',
    evidence: 'weak',
    rationale: 'Weak: llms.txt is a young convention with no confirmed adoption across engines.',
    check: (ctx) => {
      if (ctx.graph.site.llmsTxt || ctx.graph.site.aiTxt) return [];
      return [{
        title: 'llms.txt not found',
        detail: 'Searched the repository root and common static-asset directories.',
        suggestion: 'Generate llms.txt plus ai.txt from the parsed facts.',
        deduction: 3,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },
  {
    id: 'MAC-004',
    dimension: 'machine',
    severity: 'warning',
    deduction: 3,
    title: 'llms.txt is too thin to be useful',
    detail: 'The index lists fewer than five entries, or has no title/summary.',
    suggestion: 'List 10-20 core pages, each with a one-line description of what it answers.',
    evidence: 'weak',
    rationale: 'Weak: the PRD sets the 10-20 entry target; it is a product requirement rather than a measured effect.',
    check: (ctx) => {
      const llms = ctx.graph.site.llmsTxt;
      if (!llms) return [];
      const problems: string[] = [];
      if (!llms.title) problems.push('no title');
      if (!llms.summary) problems.push('no summary');
      if (llms.entries.length < 5) problems.push(llms.entries.length + ' entry/entries');
      if (problems.length === 0) return [];
      return [{
        title: 'llms.txt is incomplete',
        detail: problems.join('; '),
        suggestion: 'Add a title, a one-paragraph summary and 10-20 described entries.',
        deduction: 3,
        anchors: [{ file: llms.file, line: 1 }],
      }];
    },
  },
  {
    id: 'MAC-005',
    dimension: 'machine',
    severity: 'warning',
    deduction: 4,
    title: 'AI crawlers are blocked by robots.txt',
    detail: 'robots.txt disallows well-known AI crawlers from the whole site.',
    suggestion: 'Allow the crawlers you want citations from; allow-listing is not the same as being citable, so check meta robots too.',
    evidence: 'moderate',
    rationale: 'Moderate: blocking a crawler provably prevents indexing, though indexing does not guarantee citation.',
    check: (ctx) => {
      const blocked = blockedAgents(ctx.graph.site.robots, AI_CRAWLERS);
      if (blocked.length === 0) return [];
      return [{
        title: blocked.length + ' AI crawler(s) blocked: ' + blocked.slice(0, 4).join(', '),
        detail: 'robots.txt disallows these agents at "/".',
        suggestion: 'Remove the blanket disallow for the agents you want to cite the page.',
        deduction: 4,
        anchors: ctx.graph.site.robots ? [{ file: ctx.graph.site.robots.file, line: 1 }] : [],
      }];
    },
  },

  // -------------------------------------------------------------------- trust
  {
    id: 'TRU-001',
    dimension: 'trust',
    severity: 'warning',
    deduction: 3,
    title: 'No license',
    detail: 'Neither package.json nor the repository states a license.',
    suggestion: 'Add a license field and a LICENSE file; state the terms in the README.',
    evidence: 'strong',
    rationale: 'Strong: usage rights are a factual, verifiable trust signal.',
    check: (ctx) => {
      const hasLicenseField = Boolean(ctx.graph.packageJson?.license);
      const hasLicenseFile = ctx.graph.docs.some((doc) => doc.kind === 'license');
      if (hasLicenseField || hasLicenseFile) return [];
      return [{
        title: 'License missing',
        detail: 'No license field in package.json and no LICENSE document.',
        suggestion: 'Add "license" to package.json and ship a LICENSE file.',
        deduction: 3,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },
  {
    id: 'TRU-002',
    dimension: 'trust',
    severity: 'info',
    deduction: 2,
    title: 'No maintainer identified',
    detail: 'package.json declares no author and the README names no maintainer.',
    suggestion: 'Name the maintainer or team, and link a contact channel.',
    evidence: 'moderate',
    rationale: 'Moderate: attribution is a standard E-E-A-T style trust cue.',
    check: (ctx) => {
      if (ctx.graph.packageJson?.author) return [];
      const text = ctx.allText;
      if (/maintainer|maintained by|作者|维护者|维护人/i.test(text)) return [];
      return [{
        title: 'Maintainer unknown',
        detail: 'No author field and no maintainer statement.',
        suggestion: 'Add "Maintained by <name>" with a link.',
        deduction: 2,
        anchors: [{ file: ctx.graph.packageJson?.file ?? 'package.json' }],
      }];
    },
  },
  {
    id: 'TRU-003',
    dimension: 'trust',
    severity: 'info',
    deduction: 2,
    title: 'No feedback channel',
    detail: 'The page offers no issue tracker, discussion link or contact address.',
    suggestion: 'Add a "Feedback" section linking the issue tracker.',
    evidence: 'moderate',
    rationale: 'Moderate: a reachable channel is part of the trust signals the PRD lists.',
    check: (ctx) => {
      const links = ctx.graph.docs.flatMap((doc) => doc.links);
      const hasChannel = links.some((link) => /issues|discussions|mailto:|forum/i.test(link.href));
      if (hasChannel) return [];
      return [{
        title: 'No issue or contact link',
        detail: 'No issues/discussions/mailto link found in any document.',
        suggestion: 'Link the issue tracker under a "Feedback" heading.',
        deduction: 2,
        anchors: [{ file: ctx.primary?.file ?? 'README.md' }],
      }];
    },
  },
  {
    id: 'TRU-004',
    dimension: 'trust',
    severity: 'info',
    deduction: 1,
    title: 'No documented release history',
    detail: 'There is no dated release history that a reader could check.',
    suggestion: 'Publish a changelog with dated entries.',
    evidence: 'weak',
    rationale: 'Weak: overlaps FRE-004; kept as a small trust nudge.',
    check: (ctx) => {
      const changelog = ctx.graph.docs.find((doc) => doc.kind === 'changelog');
      if (changelog && parseDate(changelog.raw)) return [];
      if (!changelog) return [];
      return [{
        title: 'Changelog has no dates',
        detail: 'A changelog exists but contains no parseable date.',
        suggestion: 'Add a date to every release entry.',
        deduction: 1,
        anchors: [{ file: changelog.file, line: 1 }],
      }];
    },
  },

  // --------------------------------------------------------------- compliance
  {
    id: 'COM-001',
    dimension: 'compliance',
    severity: 'error',
    deduction: 3,
    title: 'Unverifiable promotional claim',
    detail: 'The documentation promises rankings, traffic or guaranteed results, which the product cannot verify.',
    suggestion: 'Replace the promise with a factual statement of what the tool checks and what it cannot promise.',
    evidence: 'strong',
    rationale: 'Strong: the PRD forbids claims of this kind outright; hitting one caps the total score.',
    gate: true,
    check: (ctx) => {
      const hits: { doc: string; line: number; phrase: string; text: string }[] = [];
      for (const doc of ctx.graph.docs) {
        for (const hit of findSuperlatives(doc)) {
          hits.push({ doc: doc.file, line: hit.line, phrase: hit.phrase, text: hit.text });
        }
      }
      return hits.slice(0, 3).map((hit) => ({
        title: 'Claim: "' + hit.text.slice(0, 60) + '"',
        detail: 'Pattern: ' + hit.phrase + ' in ' + hit.doc + ':' + hit.line + '.',
        suggestion: 'Rewrite as a verifiable statement, e.g. "reports which AI crawlers are blocked" rather than "guarantees citations".',
        deduction: 3,
        anchors: [{ file: hit.doc, line: hit.line }],
      }));
    },
  },
  {
    id: 'COM-002',
    dimension: 'compliance',
    severity: 'warning',
    deduction: 2,
    title: 'Structured data claims more than the body shows',
    detail: 'JSON-LD carries a rating, price or offer that does not appear in the visible text.',
    suggestion: 'Delete unsupported fields or add the same facts to the visible body.',
    evidence: 'strong',
    rationale: 'Strong: a structured claim with no visible counterpart is a measurable inconsistency.',
    check: (ctx) => {
      const text = ctx.allText;
      const out: { title: string; detail: string; suggestion: string; deduction: number; anchors: { file: string; line: number }[] }[] = [];
      for (const block of ctx.graph.site.jsonLd) {
        const value = block.value as Record<string, unknown> | null;
        if (!value) continue;
        const rating = value['aggregateRating'] as Record<string, unknown> | undefined;
        if (rating) {
          const valueText = String(rating['ratingValue'] ?? '');
          if (valueText && !text.includes(valueText.toLowerCase())) {
            out.push({
              title: 'aggregateRating not in body',
              detail: 'ratingValue ' + valueText + ' at ' + block.file + ':' + block.line,
              suggestion: 'Remove aggregateRating unless the page shows the same rating.',
              deduction: 2,
              anchors: [{ file: block.file, line: block.line }],
            });
          }
        }
        const offers = value['offers'] as Record<string, unknown> | undefined;
        if (offers) {
          const price = String(offers['price'] ?? '');
          if (price && !text.includes(price)) {
            out.push({
              title: 'offers.price not in body',
              detail: 'price ' + price + ' at ' + block.file + ':' + block.line,
              suggestion: 'Remove the offer or state the price on the page.',
              deduction: 2,
              anchors: [{ file: block.file, line: block.line }],
            });
          }
        }
      }
      return out.slice(0, 3);
    },
  },
  {
    id: 'COM-003',
    dimension: 'compliance',
    severity: 'info',
    deduction: 1,
    title: 'Machine-written text is not labelled',
    detail: 'The page contains boilerplate typical of generated text but no disclosure.',
    suggestion: 'If any part was generated, say so in a short note; otherwise remove the boilerplate.',
    evidence: 'heuristic',
    rationale: 'Heuristic: detection is a guess from phrasing, so this is an information item, never a gate.',
    check: (ctx) => {
      const text = ctx.allText;
      const boilerplate = /as an ai language model|in conclusion, it is important to note|certainly! here|希望以上内容对您有帮助|作为(?:一个)?ai(?:语言)?模型/i.test(text);
      if (!boilerplate) return [];
      const disclosed = /ai[- ]generated|generated with ai|由\s*ai\s*生成|机器生成|ai辅助/i.test(text);
      if (disclosed) return [];
      return [{
        title: 'Generated-text boilerplate without disclosure',
        detail: 'Phrases typical of model output were found and no disclosure is present.',
        suggestion: 'Add a one-line disclosure, or rewrite the affected paragraphs.',
        deduction: 1,
        anchors: [{ file: ctx.primary?.file ?? 'README.md' }],
      }];
    },
  },
];

/** Rules that never score: typography is reported for the reader only. */
export interface AdvisoryRule {
  id: string;
  severity: 'info' | 'warning';
  title: string;
  check: (ctx: RuleContext) => { detail: string; suggestion: string; anchors: { file: string; line?: number }[] }[];
}

/** Advisory data before the panel copy is attached; see ADVISORY_RULES below. */
const ADVISORY_BASE: AdvisoryRule[] = [
  {
    id: 'TYP-001',
    severity: 'info',
    title: 'Paragraph is too long to scan',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      return doc.paragraphs
        .filter((paragraph) => paragraph.text.length > 700)
        .slice(0, 2)
        .map((paragraph) => ({
          detail: 'Paragraph starting at line ' + paragraph.line + ' is ' + paragraph.text.length + ' characters.',
          suggestion: 'Split it into two or three short paragraphs, or a list.',
          anchors: [{ file: doc.file, line: paragraph.line }],
        }));
    },
  },
  {
    id: 'TYP-002',
    severity: 'info',
    title: 'All-caps shouting',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      // Code spans, fenced blocks and link targets carry filenames, constants and acronyms;
      // shouting means prose in capitals, so strip those before looking for it.
      let inFence = false;
      const lines = doc.raw.split('\n').map((line) => {
        if (/^\s*(?:\u0060\u0060\u0060|~~~)/.test(line)) {
          inFence = !inFence;
          return '';
        }
        if (inFence) return '';
        return line.replace(/\u0060[^\u0060]*\u0060/g, ' ').replace(/\]\([^)]*\)/g, ']');
      });
      const hits: { detail: string; suggestion: string; anchors: { file: string; line: number }[] }[] = [];
      lines.forEach((line, index) => {
        const words = Array.from(new Set(line.match(/\b[A-Z]{4,}\b/g) ?? []));
        if (words.length >= 2) {
          hits.push({
            detail: 'Line ' + (index + 1) + ' uses all caps: ' + words.slice(0, 4).join(', '),
            suggestion: 'Use bold or a heading for emphasis instead of capitals.',
            anchors: [{ file: doc.file, line: index + 1 }],
          });
        }
      });
      return hits.slice(0, 2);
    },
  },
  {
    id: 'TYP-003',
    severity: 'info',
    title: 'Trailing whitespace or hard tabs',
    check: (ctx) => {
      const doc = ctx.primary;
      if (!doc) return [];
      const hits: { detail: string; suggestion: string; anchors: { file: string; line: number }[] }[] = [];
      doc.raw.split('\n').forEach((line, index) => {
        if (/\t/.test(line) || /\s+$/.test(line)) {
          hits.push({
            detail: 'Line ' + (index + 1) + ' has a tab or trailing spaces.',
            suggestion: 'Trim the line and use spaces for indentation.',
            anchors: [{ file: doc.file, line: index + 1 }],
          });
        }
      });
      return hits.slice(0, 2);
    },
  },
];

/** Looks up the panel copy a rule must ship; a missing entry is a bug, not a gap. */
function promptFor(ruleId: string): RulePromptFields {
  const copy = PROMPTS[ruleId];
  if (copy === undefined) {
    throw new Error('rule ' + ruleId + ' has no entry in prompts.ts (priority, impact and prompt are required)');
  }
  return copy;
}

/**
 * The published pack: rule data plus the panel half of each rule (urgency, the
 * cost to the reader, and a copy-ready repair prompt).
 */
export const RULES: RuleDefinition[] = BASE_RULES.map((rule) => ({ ...rule, ...promptFor(rule.id) }));

/** Advisories carry the same panel copy, but never score. */
export const ADVISORY_RULES: (AdvisoryRule & RulePromptFields)[] = ADVISORY_BASE.map((rule) => ({
  ...rule,
  ...promptFor(rule.id),
}));

export { MIN_WORDS, STALE_DAYS, DRIFT_DAYS };
export { bodyText };
