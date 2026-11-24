# Changelog

All notable changes to dsh-geo-seo are recorded here, one dated section per release.
The rule pack has its own version (see `src/core/rules.ts`, `RULE_PACK_VERSION`) because a
rule change alters scores without altering behaviour.

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
