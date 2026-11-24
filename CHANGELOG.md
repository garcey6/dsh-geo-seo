# Changelog

All notable changes to dsh-geo-seo are recorded here, one dated section per release.
The rule pack has its own version (see `src/core/rules.ts`, `RULE_PACK_VERSION`) because a
rule change alters scores without altering behaviour.

## 0.2.0 - 2026-11-24

The sidebar panel is rebuilt from the interaction spec: one vertical page instead of five
equal tabs, no path to type, and every deduction now carries a prompt you can paste.

- Panel: six zones in reading order — project picker, score hero, issue cards, then
  assets, crawlability and monitoring as collapsed sections with status badges. The
  dimension breakdown and the folder text field fold away. Statistics pills are gone.
- Panel: the workspace root is scanned on open (falling back to the remembered folder,
  then to the server's last target). `POST /pick-dir` opens the native folder dialog and
  answers `{ path: null }` when no Electron dialog is available, which reveals the manual
  field under *Advanced* instead of showing it by default.
- Panel: each issue card carries a priority tag (high/medium/low), a clickable
  `file:line` location, the impact, the suggestion and a copyable prompt with two-second
  feedback. A clean project renders the rule count rather than an empty list.
- Panel: errors name the folder only (`directory not found: <basename>`); the absolute
  path moves to a `detail` field behind *View details*.
- Rules: every one of the 34 scored rules and 3 advisories declares `priority`, `impact`,
  `impactZh`, `promptTemplate` and `promptTemplateEn`. `RULES` is assembled from the rule
  data plus `src/core/prompts.ts`, and a missing entry throws at import time.
- Report: findings and advisories carry `priority`, `impact`, `impactZh`, `prompt` and
  `promptZh`; `promptZh` is the Chinese rendering, `prompt` the English one. The CLI's
  `--format json` and the panel both read the same strings.
- Audit: the 13 checks are declared once in `AUDIT_CHECKS` (8 international, 5 domestic)
  and returned as `checks[]` with `ok`, so the panel can show a pass count; each audit
  finding gains the same priority and prompt fields.
- Endpoints: `GET /assets` (per-file status, bytes, timestamp and verification),
  `GET /preview` (asset content, capped at 200 KB), `POST /pick-dir`, `POST /open-file`
  and `POST /monitor/import`. `POST /generate` from the panel now writes into the project
  directory so the asset table can compare disk against expected bytes; the agent tool
  keeps its temp default.
- Generate: `names` option so the panel can regenerate a selection.
- Tests: 74 total (up from 53). New `test/prompt.test.ts` (placeholder rendering, missing
  values, length bounds, every rule has both templates) and `test/panel.test.ts` (one
  vertical page, hidden text field, prompt copy button, dictionary parity, no absolute
  path, script parses as-is). Host and audit tests cover the new endpoints and checks.
## 0.1.1 - 2026-11-24

Published to npm on 2026-11-24 as `latest`; `npm view dsh-geo-seo version` answers 0.1.1.

Republished to the npm registry so `npm install dsh-geo-seo` resolves a package whose
`engines.dsh` a DSH release actually satisfies (0.1.0 shipped `>=0.30.0` and is immutable).

- Host entry: routes and tools register through their service objects (`webServer`, `tools`),
  and tools register inside `ctx.inject(['tools'], …)`; tool parameters are raw JSON Schema.
  Before this the plugin never activated: `apply()` threw on `this.prefixes`.
- Sidebar seat registers only once `sidebarRightTabs` and `slots` are available.
- `engines.dsh` is `>=0.2.2-rc.5` and read from `package.json` by the market index generator.

## Unreleased

- Declared `engines.dsh` (`>=0.2.2-rc.5`) so the plugin market can check compatibility instead of
  assuming one, and made `scripts/build-market-index.mjs` read that range from `package.json`
  rather than hardcoding it. The index previously advertised `>=0.30.0`, which no DSH release
  satisfies, so every install was refused as incompatible.
- Market entry installs from a commit-pinned git source instead of the npm registry: the
  published `0.1.0` tarball keeps the wrong `engines.dsh` and cannot be replaced, so an npm
  source can never install. The index generator now derives the commit with `git rev-parse`,
  the timestamp with `git log -1 --format=%ct`, and inlines the icon as a `data:` URL so the
  market does not fetch `raw.githubusercontent.com`.
- The sidebar panel now waits for the tab-type registry instead of reading `ctx.sidebarRightTabs`
  at apply time. The native seat declares `sidebar.right.pane.tab` before it provides that service,
  so the old read saw `undefined`, returned quietly and registered nothing — permanently, because
  the declaration never collapses. Registration now runs inside
  `ctx.inject(['sidebarRightTabs', 'slots'], …)`, the guide row carries the shape the registry
  validates (`order` plus thunk title/description), and the body seat is keyed to the type id.
- The host entry no longer detaches `register` from its service. `webServer.register` reads
  `this.prefixes` and `tools.register` reads `this.layers`, so calling either through a bare
  function reference threw `Cannot read properties of undefined (reading 'prefixes')` and aborted
  `apply()` — no route, no tools, no panel. Both now call through the service object.
- Tool definitions ship raw JSON Schema instead of the `defineTool` shorthand: the registry
  validates `{ type: 'object', properties: … }`, so the shorthand map was rejected. Tools also
  register inside `ctx.inject(['tools'], …)` so a registry provided after activation is picked up,
  and the host test fakes are class-based so a detached `register()` fails the suite.
- `dist/` is committed and the `prepare` script is gone. A git install needs no build step,
  which is the only way it works under pnpm, whose `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`
  blocks an un-allowlisted `prepare` script for a git dependency.

## 0.1.0 - 2026-11-24

First release, rule pack 2026.02.1.

- Parser: Markdown structure, `package.json`, and TS/JS source exports, tools, commands and
  config keys, each fact carrying a `file:line` anchor. A file that fails to parse is
  recorded in `parseErrors` and does not abort the scan.
- Scoring: 100 points across seven fixed dimensions, a compliance gate that caps the total
  at 60, proportional relevance loss for short documents, and cross-file deduplication of
  repeated suggestions.
- Generation: `llms.txt`, `llms-full.txt`, `ai.txt` and `structured-data.jsonld` from a
  single parse, with field-by-field JSON-LD verification against the visible text and a
  refusal to overwrite a differing file without `--force`.
- Audit: international and domestic reachability checks with three standing notes,
  including that an open `robots.txt` does not imply citation.
- Monitor: a 24-question bank, recorded samples, mention and citation rates, and trend
  reporting that flags samples under 20 as not statistically meaningful.
- Interfaces: CLI with stable exit codes for CI, a DSH plugin exposing five agent tools, a
  `/geo-seo/api` route, and a sidebar panel.
