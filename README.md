# dsh-geo-seo

dsh-geo-seo is a DSH plugin and CLI that measures whether AI engines can read and cite a
repository's documentation, then generates the machine-readable files those engines
actually read.

It is a measurement tool. It scores documentation against a fixed, versioned rule pack,
shows every deduction with a file and line anchor, and states the evidence behind each
rule. **It does not promise rankings, traffic or citations, and it never estimates
them.** A score is a description of your documentation, not a forecast.

Current version 0.1.0 · requires Node 22.6+ and DSH 0.2.2-rc.5+ · MIT · Last updated: 2026-11-24 ·
中文简介见 [docs/INTRO.md](docs/INTRO.md).

```
97 / 100  excellent

  Topic relevance and intent match        ████████████   28/28
  Key-information structure and position  ████████████   22/22
  Fact density and verifiability          ████████████   18/18
  Time freshness                          ████████████   10/10
  Machine-readable structure              █████████░░░    9/12
  Trust signals                           ████████████    7/7
  Consistency and compliance              ████████████    3/3

INFO  MAC-003 -3  llms.txt not found
        fix: Generate llms.txt plus ai.txt from the parsed facts.
        at package.json
        evidence: weak
```

## Install

### As a DSH plugin (from the plugin market)

The package ships a `dsh.bundle.patch` + `dsh.client` manifest, so the desktop app can
install it like any other bundle.

1. Open **Plugins → Discover**, add this index URL once:

   ```text
   https://raw.githubusercontent.com/garcey6/dsh-geo-seo/main/market/index.json
   ```

   The app rejects redirects, so the index URL must answer `200` directly. The
   repository copy is authoritative and is corrected without needing a release:

   | Host | URL |
   | --- | --- |
   | GitHub `main` (authoritative) | `https://raw.githubusercontent.com/garcey6/dsh-geo-seo/main/market/index.json` |
   | GitHub Pages (same file, no redirect) | `https://garcey6.github.io/dsh-geo-seo/market/index.json` |

   > Both unpkg forms are unusable for this release. `https://unpkg.com/dsh-geo-seo/market/index.json`
   > answers `302`, which Discover reports as "unexpected redirect". The pinned form
   > `https://unpkg.com/dsh-geo-seo@0.1.0/market/index.json` is frozen inside the 0.1.0 tarball,
   > whose `engines.dsh` was written before this package declared one, so installing it fails the
   > compatibility check. The npm mirror becomes usable again with the next published version.

2. Find **GEO / SEO** in the index and install it. The plugin registers five agent tools —
   `geo_seo_check`, `geo_seo_generate`, `geo_seo_audit`, `geo_seo_monitor`,
   `geo_seo_questions` — and serves its panel from the same local web server as the app
   (`/geo-seo/api/*`). Nothing is uploaded anywhere.
3. Open the right sidebar; the **GEO / SEO** tab appears in the guide and in the tab menu.

### From a checkout of this repository

1. Build it once:

   ```bash
   pnpm install
   pnpm build
   ```

2. In the desktop app open **Plugins → Add plugin** and pick this folder (the folder that
   contains `package.json`). The plugin is linked, not copied, so rebuilding picks up
   changes.

The plugin registers five agent tools — `geo_seo_check`, `geo_seo_generate`,
`geo_seo_audit`, `geo_seo_monitor`, `geo_seo_questions` — and serves its panel from the
same local web server as the app (`/geo-seo/api/*`). Nothing is uploaded anywhere.

### As a CLI

```bash
npm install -g dsh-geo-seo   # or: pnpm add -g dsh-geo-seo
geo-seo check --dir ./my-plugin
```

From a checkout, the same commands run without installing:

```bash
node dist/src/cli/main.js check    --dir ./my-plugin
node dist/src/cli/main.js generate --dir ./my-plugin --dry-run
node dist/src/cli/main.js audit    --dir ./my-plugin --format markdown
node dist/src/cli/main.js monitor  --dir ./my-plugin --questions
node dist/src/cli/main.js rules
```

After `npm link` (or `pnpm add -g .`) the same commands are available as `geo-seo`.

## What it does

| Capability | What you get |
| --- | --- |
| Parse | Markdown (headings, lists, code, tables, links), `package.json`, and TS/JS source exports, tools, commands and config keys — every fact keeps a file and line anchor |
| Score | 0–100 across seven weighted dimensions, per-dimension deductions, a rewrite suggestion per finding, and the evidence level behind each rule |
| Generate | `llms.txt`, `llms-full.txt`, `ai.txt` and JSON-LD from one parse, with a consistency check that refuses to write facts the visible text cannot back |
| Audit | Crawlability for international and domestic AI engines: robots rules, sitemaps, meta robots, canonical, JS-only content, Chinese indexing configuration |
| Monitor | A 24-question bank, per-run recordings, mention and citation rates, and a trend that says "not statistically meaningful" when the sample is too small |

### Commands and flags

| Command | Purpose |
| --- | --- |
| `check` | Parse, score and print the report. Writes a history entry unless `--no-history`. |
| `generate` | Render `llms.txt`, `llms-full.txt`, `ai.txt`, `structured-data.jsonld`. Dry run by default output location: the system temp directory. |
| `audit` | Crawlability findings for international and domestic engines, plus the standing notes. |
| `monitor` | `--questions` prints the bank; `--answers <file> --platform <name>` records a sample; bare prints the summary and trend. |
| `rules` | Prints the rule pack (name, version, release date) and every rule's rationale. |

Flags: `--dir <path>` (defaults to the last scanned directory, then the working
directory), `--format text|json|markdown`, `--strict`, `--fail-under <score>`,
`--out <dir>`, `--force`, `--dry-run`, `--max-entries <n>`, `--max-findings <n>`,
`--no-history`, `--no-color`, `--quiet`.

Exit codes are stable for CI: `0` ok, `1` threshold or strict failure, `2` usage error,
`3` internal error.

```yaml
# .github/workflows/geo.yml
- run: node dist/src/cli/main.js check --dir . --fail-under 70 --strict --format json > geo.json
```

## Scoring

The weights are fixed by the product requirements and are not configurable:

| Dimension | Points | What it measures |
| --- | --- | --- |
| Topic relevance and intent match | 28 | The page answers "what is this plugin" in the first screen, under one entity |
| Key-information structure and position | 22 | Conclusion first, scannable lists, important entries early |
| Fact density and verifiability | 18 | Install command, version, config keys, examples, cited numbers |
| Time freshness | 10 | A stated update date that agrees with the commit history |
| Machine-readable structure | 12 | Continuous headings, matching JSON-LD, `llms.txt` |
| Trust signals | 7 | Maintainer, license, feedback channel, release history |
| Consistency and compliance | 3 | No unverifiable promises, no contradiction, no unlabelled machine text |

Two rules go beyond simple subtraction:

- A severe compliance hit (a promise of rankings, traffic or citation outcomes) **caps
  the total at 60**, whatever the rest of the page scores.
- A document far below a useful length loses relevance **in proportion to the gap**, so a
  stub cannot collect points for being short.

The same suggestion hit in several files is deducted once, and every finding carries the
line it came from.

## Generated files

| File | Contents |
| --- | --- |
| `llms.txt` | Site summary plus 10–20 core pages, with a provenance comment (engine and rule-pack version, timestamp, source files) |
| `llms-full.txt` | The same selection with page bodies inlined, under a size budget |
| `ai.txt` | The `llms.txt` content under the alternate filename convention |
| `structured-data.jsonld` | JSON-LD restricted to `SoftwareApplication`, `TechArticle` or `FAQPage`, and only for facts the visible text states |

JSON-LD is verified field by field against the parsed page text before it is written. A
claim the body does not support (a rating, an offer, a version that appears nowhere) is
dropped or blocks the write, and the generator reports which field failed and why. Ratings
and prices are never invented. Existing files are compared, not clobbered: without
`--force` a differing file is skipped and reported.

For this repository that block looks like:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "dsh-geo-seo",
  "softwareVersion": "0.1.0",
  "applicationCategory": "DeveloperApplication",
  "license": "MIT",
  "author": { "@type": "Person", "name": "garcey" },
  "keywords": "dsh, geo, seo, llms.txt, structured data"
}
```

## Privacy

Everything runs locally. The default is zero network access: there is no telemetry, no
model call, no upload, and no external fetch. History and monitoring records are written
to `~/.dsh/geo-seo/workspaces/<hash>/` — override the root with `DSH_GEO_SEO_HOME`. Delete
that folder and the state is gone.

## What this cannot do

- It cannot promise or predict rankings, traffic or citations, and it will not print an
  "expected improvement" percentage.
- Allowing AI crawlers in `robots.txt` does not mean they cite you, and this tool says so
  in every audit.
- Domestic (Chinese) engine checks read configuration only. There is no public API that
  confirms indexing, so the tool never claims an index status.
- Monitoring is manual sampling: a person asks the fixed questions on each platform and
  records the answers. Rates from fewer than 20 samples are labelled as not statistically
  meaningful.
- A high score is not permission to over-optimise. The same PRD that defines the weights
  records that aggressive optimisation can lower perceived quality; the tool reports what
  it measured and nothing more.

## Development

```bash
pnpm install
pnpm run build        # tsc → dist/
pnpm run check:types  # type-check only
pnpm test             # node --test over the compiled tests
pnpm run selftest     # check examples/sample-plugin and print the report
```

Layout: `src/core` is the kernel (parse → rules → score → generate → audit → monitor →
render → store) and is exported as `dsh-geo-seo/core`; `src/cli` and `src/index.ts` are
thin adapters over it; `client/index.js` is the sidebar tab and `assets/panel.html` the
page it renders. `docs/DETAIL.md` documents the internals, `docs/DETAIL.zh.md` is the
Chinese version, and `docs/INTRO.md` holds the short descriptions used for listings.

Rules live in `src/core/rules.ts` with `RULE_PACK_VERSION` (`2026.02.1`) and each rule's
evidence level; adding a rule means adding one entry plus a fixture in `test/`.

## Changelog

Per-release notes live in [CHANGELOG.md](CHANGELOG.md); the current release is 0.1.0
(2026-11-24).

## Links

- Repository: <https://github.com/garcey6/dsh-geo-seo>
- Issues: <https://github.com/garcey6/dsh-geo-seo/issues>
- npm: <https://www.npmjs.com/package/dsh-geo-seo>
- Plugin market index: <https://raw.githubusercontent.com/garcey6/dsh-geo-seo/main/market/index.json>
- Design notes: [docs/DETAIL.md](docs/DETAIL.md) · [中文](docs/DETAIL.zh.md)
- Short descriptions for listings: [docs/INTRO.md](docs/INTRO.md)

## License

MIT.

