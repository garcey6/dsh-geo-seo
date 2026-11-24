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

/** Severity used by both the score engine and the compliance checker. */
export type Severity = 'error' | 'warning' | 'info';

/**
 * How strong the published evidence behind a rule is. This is deliberately
 * coarse: the report must never present a heuristic as settled science.
 */
export type EvidenceLevel = 'strong' | 'moderate' | 'weak' | 'heuristic';

/** Scored dimensions. `typography` is advisory-only and never scores. */
export type DimensionId =
  | 'relevance'
  | 'structure'
  | 'facts'
  | 'freshness'
  | 'machine'
  | 'trust'
  | 'compliance';

/** A location in the repository. `line` is 1-based. */
export interface Anchor {
  file: string;
  line?: number;
  column?: number;
  /** Node path inside a structured file, e.g. `exports["."]` or `dependencies.left-pad`. */
  path?: string;
}

export interface ParseError {
  file: string;
  message: string;
  line?: number;
}

export interface HeadingNode {
  level: number;
  text: string;
  line: number;
}

export interface ParagraphNode {
  text: string;
  line: number;
}

export interface ListNode {
  ordered: boolean;
  items: string[];
  line: number;
}

export interface CodeBlockNode {
  lang: string;
  text: string;
  line: number;
}

export interface TableNode {
  header: string[];
  rows: string[][];
  line: number;
}

export interface LinkNode {
  text: string;
  href: string;
  line: number;
}

export type DocumentKind = 'readme' | 'doc' | 'changelog' | 'license' | 'other';

/** A parsed Markdown document. Raw lines are kept so anchors stay exact. */
export interface MarkdownDoc {
  file: string;
  kind: DocumentKind;
  raw: string;
  lineCount: number;
  headings: HeadingNode[];
  paragraphs: ParagraphNode[];
  lists: ListNode[];
  codeBlocks: CodeBlockNode[];
  tables: TableNode[];
  links: LinkNode[];
  wordCount: number;
  /** YAML front matter key/value pairs, when the document starts with one. */
  frontmatter: Record<string, string>;
  /** Heading sections, in document order, with the text that belongs to them. */
  sections: MarkdownSection[];
}

export interface MarkdownSection {
  level: number;
  title: string;
  line: number;
  /** Last line of the section body (inclusive). */
  endLine: number;
  text: string;
  headings: HeadingNode[];
}

export interface PackageFact {
  file: string;
  name?: string;
  version?: string;
  description?: string;
  keywords: string[];
  license?: string;
  author?: string;
  repository?: string;
  homepage?: string;
  main?: string;
  types?: string;
  type?: string;
  bin: string[];
  dependencies: string[];
  devDependencies: string[];
  peerDependencies: string[];
}

export interface SourceFact {
  file: string;
  exports: { name: string; line: number }[];
  /** Registered tool names found in source, with the line of the registration. */
  tools: { name: string; line: number }[];
  /** DSH command ids found in source (ctx.command / registerCommand). */
  commands: { name: string; line: number }[];
  hasConfigSchema: boolean;
  configKeys: string[];
  injects: string[];
}

export interface JsonLdBlock {
  file: string;
  line: number;
  /** Parsed JSON-LD payload; `null` when the block is not valid JSON. */
  value: unknown;
  raw: string;
  error?: string;
}

export interface RobotsFact {
  file: string;
  present: boolean;
  /** Agents named in `User-agent` lines. */
  agents: string[];
  /** Raw group records for audit purposes. */
  groups: { agents: string[]; allow: string[]; disallow: string[]; line: number }[];
  sitemaps: string[];
}

export interface LlmsFact {
  file: string;
  present: boolean;
  title?: string;
  summary?: string;
  /** Entries of the link list, in order. */
  entries: { title: string; url: string; description?: string; line: number }[];
  lineCount: number;
  bytes: number;
}

export interface SiteAuditFact {
  robots?: RobotsFact;
  sitemap?: { file: string; urls: string[] };
  llmsTxt?: LlmsFact;
  aiTxt?: LlmsFact;
  jsonLd: JsonLdBlock[];
  /** `<meta name="robots">` directives found in static HTML entry points. */
  metaRobots: { file: string; line: number; content: string }[];
  /** Static HTML entry points, used for the "content available without JS" check. */
  htmlFiles: { file: string; chars: number; textChars: number; viewport: boolean }[];
  canonicals: { file: string; line: number; href: string }[];
}

export interface GitFact {
  available: boolean;
  lastCommitDate?: string;
  commitCount?: number;
  reason?: string;
}

/** Everything the engine knows about the target repository. */
export interface FactGraph {
  dir: string;
  scannedAt: string;
  packageJson?: PackageFact;
  docs: MarkdownDoc[];
  sources: SourceFact[];
  site: SiteAuditFact;
  git: GitFact;
  /** ISO mtime for each scanned file, by relative path. */
  mtimes: Record<string, string>;
  /** Date the project itself claims as its last update, when it states one. */
  declaredUpdatedAt?: string;
  /** Relative paths of the files that were considered, sorted. */
  files: string[];
  errors: ParseError[];
}

export interface RuleDefinition {
  id: string;
  dimension: DimensionId;
  severity: Severity;
  /** Maximum points this rule can remove from its dimension. */
  deduction: number;
  title: string;
  /** What the rule looks for, in plain language. */
  detail: string;
  /** Concrete rewrite advice shown to the user. */
  suggestion: string;
  evidence: EvidenceLevel;
  /** Why the rule carries the evidence level it does. */
  rationale: string;
  /** When true, hitting this rule caps the total score at 60. */
  gate?: boolean;
  check: RuleCheck;
}

export interface RuleContext {
  graph: FactGraph;
  /** Primary document (README.md) when present, else the first Markdown doc. */
  primary?: MarkdownDoc;
  /** All Markdown documents concatenated lowercased, for cheap lookups. */
  allText: string;
  now: Date;
}

/** Returns findings for one rule; anchors must point at real lines. */
export type RuleCheck = (ctx: RuleContext) => Omit<Finding, 'ruleId' | 'dimension' | 'severity' | 'evidence' | 'rationale'>[];

export interface Finding {
  ruleId: string;
  dimension: DimensionId;
  severity: Severity;
  deduction: number;
  title: string;
  detail: string;
  suggestion: string;
  anchors: Anchor[];
  evidence: EvidenceLevel;
  rationale: string;
  gate?: boolean;
}

export interface DimensionScore {
  id: DimensionId;
  label: string;
  /** Maximum points for the dimension (fixed by the PRD). */
  weight: number;
  score: number;
  /** Points removed, after the per-dimension cap. */
  deducted: number;
  findings: Finding[];
}

export interface Advisory {
  ruleId: string;
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string;
  anchors: Anchor[];
  evidence: EvidenceLevel;
}

export interface ScoreResult {
  total: number;
  /** True when a gate rule forced the total down. */
  capped: boolean;
  capReason?: string;
  dimensions: DimensionScore[];
  advisories: Advisory[];
  findings: Finding[];
}

export interface AuditFinding {
  ruleId: string;
  scope: 'international' | 'domestic';
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string;
  anchors: Anchor[];
  evidence: EvidenceLevel;
}

export interface AuditResult {
  findings: AuditFinding[];
  /** Statements the audit must always show, e.g. robots != citable. */
  notes: string[];
}

export interface MonitorQuestion {
  id: string;
  text: string;
  intent: string;
}

export interface MonitorAnswer {
  questionId: string;
  mentioned: boolean;
  cited: boolean;
  /** Platform label, free-form: the user decides which engines to sample. */
  platform: string;
  note?: string;
}

export interface MonitorRun {
  runId: string;
  target: string;
  at: string;
  engineVersion: string;
  rulePackVersion: string;
  answers: MonitorAnswer[];
}

export interface MonitorSummary {
  runs: number;
  samples: number;
  mentionRate: number | null;
  citationRate: number | null;
  /** True when the sample is too small for a trend claim. */
  insufficientSample: boolean;
  trend: { runId: string; at: string; mentionRate: number | null; citationRate: number | null }[];
  platforms: { platform: string; samples: number; mentions: number; citations: number }[];
}

export interface Report {
  schemaVersion: number;
  engineVersion: string;
  rulePackVersion: string;
  generatedAt: string;
  target: {
    dir: string;
    name?: string;
    version?: string;
  };
  summary: {
    total: number;
    band: 'excellent' | 'good' | 'fair' | 'poor';
    capped: boolean;
    errors: number;
    warnings: number;
    infos: number;
    documents: number;
    filesScanned: number;
    durationMs: number;
  };
  /** Present when a gate rule forced the total down. */
  capReason?: string;
  dimensions: DimensionScore[];
  findings: Finding[];
  advisories: Advisory[];
  facts: {
    name?: string;
    version?: string;
    license?: string;
    description?: string;
    documents: { file: string; kind: DocumentKind; words: number; headings: number; lastModified: string }[];
    declaredUpdatedAt?: string;
    gitLastCommit?: string;
    tools: string[];
    commands: string[];
    configKeys: string[];
    hasLlmsTxt: boolean;
    hasAiTxt: boolean;
    jsonLdTypes: string[];
    robotsAgents: string[];
    hasSitemap: boolean;
  };
  parseErrors: ParseError[];
}

export interface GenerateFileResult {
  path: string;
  bytes: number;
  written: boolean;
  reason?: string;
  warnings: string[];
}

export interface GenerateResult {
  dir: string;
  dryRun: boolean;
  files: GenerateFileResult[];
  verification: {
    ok: boolean;
    checkedFacts: number;
    mismatches: { kind: string; claim: string; evidence: string }[];
  };
}
