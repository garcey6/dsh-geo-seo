# dsh-geo-seo — implementation detail

This page documents how the checker works inside: the data flow, the modules, the exact
scoring arithmetic, the generation contract, and the places where the implementation
deliberately refuses to do something. It is the "detail" document the plugin manifest
points at.

## 1. Design constraints

1. **Local and offline by default.** No network call exists in the kernel. The CLI and the
   panel never fetch anything; monitoring is manual sampling.
2. **Facts carry anchors.** Every statement the tool makes about a repository is either
   read from a file (with a path and usually a line) or computed from such values. A rule
   that cannot point at a line does not ship.
3. **The rule pack is versioned and separate from the engine.** `RULE_PACK_VERSION` is
   reported in every output, file header and report, so a score can be reproduced.
4. **Never invent facts.** The generator may only restate what the parsed text contains;
   JSON-LD verification enforces this mechanically.
5. **No promise of outcome.** No ranking, traffic or citation forecast appears anywhere in
   the output, including the panel and the generated files.

## 2. Layers

```
scanner (src/core/scan.ts)
  ├─ markdown.ts      Markdown → headings, paragraphs, lists, code, tables, links, sections
  ├─ package-json.ts  package.json → name, version, description, keywords, license, links
  ├─ source-ast.ts    TS/JS → exports, registered tools/commands, config keys, inject list
  └─ site.ts          robots.txt, sitemap.xml, llms.txt, ai.txt, HTML meta/JSON-LD/canonical
        ↓  FactGraph (facts + anchors + parse errors)
rules (src/core/rules.ts)     34 rules + 3 advisories, each with deduction and evidence level
        ↓  findings, advisories, rule errors
score (src/core/score.ts)     de-duplication, per-dimension caps, gate, band
        ↓  ScoreResult
generate (src/core/generate.ts)  llms.txt, llms-full.txt, ai.txt, JSON-LD + verification
audit (src/core/audit.ts)        crawlability findings + standing notes
monitor (src/core/monitor.ts)    question bank, runs, rates, trend
        ↓
render (src/core/render.ts)      text | json | markdown
store (src/core/store.ts)        history + monitor JSONL under ~/.dsh/geo-seo
```

Dependencies point one way: renderers and adapters depend on the kernel, never the other
way round. `src/core/index.ts` is the only public surface (`dsh-geo-seo/core`).

## 3. The fact graph

```ts
interface FactGraph {
  dir: string;                 // absolute target
  scannedAt: string;
  packageJson?: PackageFact;
  docs: MarkdownDoc[];         // README first, then docs/**, then root *.md
  sources: SourceFact[];
  site: SiteAuditFact;
  git: GitFact;                // available=false when git is absent or silent
  files: string[];             // every file considered, repo-relative, POSIX slashes
  errors: ParseError[];        // a broken file is recorded here, never fatal
  mtimes: Record<string, string>;
  declaredUpdatedAt?: string;  // parsed from front matter or "Last updated"
}
```

Scan limits: 60 Markdown documents, 200 source files, depth 8, 4000 entries, 4 MiB per
file. Ignored directories: `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`,
`.next`, `.cache`, `.turbo`, `vendor`, `.venv`, `__pycache__`, `.idea`, `.vscode`, `tmp`,
`.geo-seo`. Test and example directories are excluded from the source scan so fixtures do
not inflate the score.

Markdown parsing is a line scanner, not a CommonMark engine: ATX and setext headings,
fenced and 4-space-indented code, tables with a divider row, lists with continuation
lines, inline links and bare URLs, and YAML front matter. It is deliberately tolerant —
an unterminated fence, a malformed table or CRLF endings all parse without throwing.

Source inspection is lexical (regular expressions over the file), not a TypeScript
program. That keeps the kernel dependency-free and fast; the cost is that highly
generated registration code is not understood, which is why a missed tool registration
lowers the machine-readable score by at most 4 points instead of being an error.

## 4. Rule pack

`RULE_PACK = { name: 'geo-seo-core', version: '2026.02.1', released: '2026-02-18',
scoringVersion: 1 }`. Each rule declares a dimension, severity, deduction, an evidence
level (`strong` | `moderate` | `weak` | `heuristic`) and a one-line rationale.

| Dimension | Rules |
| --- | --- |
| Relevance (28) | REL-001 no README · REL-002 no H1 · REL-003 lead paragraph says nothing · REL-004 title and body disagree · REL-005 keyword stuffing · REL-100 too short (proportional) |
| Structure (22) | STR-001 heading level skip · STR-002 no section structure · STR-003 answer buried · STR-004 features are prose · STR-005 multiple H1 · STR-006 no table of contents on a long page |
| Facts (18) | FAC-001 no install command · FAC-002 version not stated · FAC-003 config undocumented · FAC-004 no runnable example · FAC-005 no repository/issue link · FAC-006 unsourced numbers |
| Freshness (10) | FRE-001 no update date · FRE-002 date stale (>365 d) · FRE-003 date disagrees with git (>90 d drift) · FRE-004 no changelog |
| Machine (12) | MAC-001 no JSON-LD · MAC-002 invalid/untyped JSON-LD · MAC-003 no llms.txt · MAC-004 llms.txt too thin · MAC-005 AI crawlers blocked |
| Trust (7) | TRU-001 no license · TRU-002 no maintainer · TRU-003 no feedback channel · TRU-004 no release history |
| Compliance (3) | COM-001 unverifiable promise (**gate**) · COM-002 structured data exceeds body · COM-003 unlabelled machine text |

Evidence levels describe how well supported a rule is, not how much it deducts — a
`heuristic` rule is a hint, a `strong` rule is a measurable contradiction.

## 5. Scoring arithmetic

```
dimension.score   = max(0, weight − Σ deductions of that dimension)
dimension.deducted = weight − score
total             = Σ dimension.score            // 0…100
if any gate rule fired: total = min(total, 60)   // capReason records the rule
```

- REL-100 deducts `28 × (1 − words / 600)` across all documents, rounded to one decimal,
  so a 300-word repository loses about half of the relevance weight and a 600-word-body
  repository loses nothing.
- De-duplication key is `ruleId + normalized suggestion`. A rule that fires in three files
  with the same advice is deducted once and the anchors are merged (up to six), so copying
  a bad paragraph into five pages cannot multiply the penalty.
- Findings are ordered error → warning → info, then by dimension, then by deduction.
- Bands: ≥ 85 excellent, ≥ 70 good, ≥ 50 fair, < 50 poor. A capped report keeps its band
  from the capped total.

## 6. Generation contract

All four files come from **one** `FactGraph`, so they cannot disagree with each other.

- **Page selection**: root README first, then nested READMEs, then `docs/`, then other
  Markdown, capped by `--max-entries` (default 20, PRD asks for 10–20). The generator warns
  when fewer than 10 pages are available rather than fabricating entries.
- **Provenance**: `llms.txt` and `llms-full.txt` start with an HTML comment naming the
  engine version, rule-pack version, timestamp and the files used.
- **Summary**: the package description when it is verifiable, otherwise the first
  meaningful paragraph. Facts lines (version, license, repository, homepage, last updated)
  are emitted only when the value exists.
- **JSON-LD**: `@type` is restricted to `SoftwareApplication`, `TechArticle` or `FAQPage`.
  Every field is checked against the concatenated visible text:
  - `name` missing or absent from the text → **blocking**, the file is refused;
  - `description`, `softwareVersion`, `author` absent → **dropped**, reported per field;
  - `aggregateRating` and `offers` are never emitted, whatever the input contains.
- **Write policy**: default output directory is the system temp directory keyed by the
  repository hash. An existing file with different content is **skipped and reported**
  unless `--force`. `--dry-run` reports sizes and warnings without touching disk.
- `ai.txt` is byte-identical to `llms.txt` (alternate filename convention).

## 7. Crawlability audit

International checks (AUD-INT-001…008): missing robots.txt, root-blocked AI crawlers
(GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended,
Applebot-Extended, Meta-ExternalAgent, CCBot, …), missing sitemap, empty sitemap,
`noindex`, JS-only content (visible text below 5% of the HTML), missing canonical,
duplicated canonical.

Domestic checks (AUD-CN-001…005): blocked Chinese crawlers (Baiduspider, Bytespider,
Sogou, 360Spider, YisouSpider), no Chinese page, thin Chinese page, missing viewport,
blocked Baiduspider.

Every audit prints three standing notes: robots permission is not citation, domestic index
status cannot be verified from a repository, and the audit is offline.

## 8. Monitoring

`MONITOR_QUESTIONS` holds 24 fixed questions covering definition, install, configuration,
troubleshooting, comparison, pricing, privacy, limits, support, platform, trust,
maintenance, requirements, CI, output, workflow, transparency and an expectation trap
("will you promise me a position?"). Questions use a `{name}` placeholder so the same bank
applies to any plugin.

A run records, per answer: question id, platform, mentioned, cited, optional note. Rates
are mentions/samples and citations/samples, rounded to three decimals. `MIN_SAMPLES = 20`;
below that the summary sets `insufficientSample` and every surface says the number is not
statistically meaningful. The trend keeps the last ten runs. `compareLastRun` returns the
delta against the previous run plus how many runs exist. Only facts are recorded — the
tool never explains why a mention appeared.

## 9. Reports and storage

The report (schema version 1) contains: engine and rule-pack versions, timestamp, target,
summary (total, band, capped, counts, documents, files, duration), dimensions with their
findings, all findings, advisories, the fact summary, and parse errors. Paths are
repository-relative with forward slashes, so a report is portable and diffable.

State lives under `DSH_GEO_SEO_HOME` (default `~/.dsh/geo-seo`):
`workspaces/<sha1(path).slice(0,16)>/history.jsonl` and `monitor.jsonl`, plus
`last-target` for the "use the previous directory" default. Append-only JSONL; a
truncated line is skipped rather than breaking the history.

## 10. Host integration

`src/index.ts` exports `apply(ctx, config)`, `inject = ['webServer']` and a `Config`
type. It registers five tools and one prefixed route (`/geo-seo/api`) with endpoints
`state`, `assets`, `preview`, `questions`, `monitor` (GET) and `check`, `generate`,
`audit`, `monitor`, `monitor/import`, `pick-dir`, `open-file` (POST). Every registration
goes through `ctx.effect` so a hot reload disposes the old route instead of leaking it.
Unknown paths answer 404, wrong methods 405. A bad target answers 400 with a message that
names the folder only; the absolute path travels in the separate `detail` field so the
panel can hide it behind *View details*.

The panel is `assets/panel.html`, served by the host and rendered in an iframe inside the
sidebar tab (`client/index.js`). It is a plain document: no bundler, no Harness client
packages, no external assets. One vertical page, six zones: project picker, score hero,
issue cards, then assets, crawlability and monitoring as collapsed sections. Every issue
card prints the priority, the impact, the suggestion and a prompt rendered from the rule's
`promptTemplate`/`promptTemplateEn`; the panel copies the prompt in the current language,
and `--format json` carries the same string. `POST /generate` from the panel writes into
the project directory (the agent tool keeps the temp default), so the asset table can
compare the bytes on disk with the bytes the generator would produce.
`POST /pick-dir` opens the native folder dialog through Electron when the host exposes it
and answers `{ path: null }` otherwise, which sends the panel back to the text field under
*Advanced*. Language follows the browser, can be switched in the panel, and is remembered
in localStorage.

## 11. Extending

- **New rule**: add an entry to `RULES` in `src/core/rules.ts` with dimension, severity,
  deduction, evidence level, rationale and a `check(ctx)` returning findings; bump
  `RULE_PACK_VERSION`; add a fixture and an assertion in `test/`.
- **New output format**: implement it in `src/core/render.ts` and add the value to
  `OutputFormat`; the CLI and the panel both pick it up.
- **New audit check**: append to `src/core/audit.ts` with a `AUD-INT-` or `AUD-CN-` id and a
  scope; the notes array is shared.

## 12. Known limits

- Lexical source inspection misses registration helpers that hide tool names behind
  variables.
- Freshness compares the declared date with git when git is available; a repository with
  no git history can only be checked for a stated date.
- The international/domestic split is a heuristic: it inspects static files in the
  repository, so content rendered by a server at request time is invisible to it.
- Scoring is rule-based and deterministic. Two repositories with the same visible facts
  score the same, which is the point — but it also means the score cannot judge whether
  the product is useful.
