# Changelog

All notable changes to dsh-geo-seo are recorded here, one dated section per release.
The rule pack has its own version (see `src/core/rules.ts`, `RULE_PACK_VERSION`) because a
rule change alters scores without altering behaviour.

## 0.1.0 - 2026-02-18

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
