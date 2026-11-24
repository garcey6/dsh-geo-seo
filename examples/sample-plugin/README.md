# sample-plugin

sample-plugin is a DeepSeek Harness plugin that adds a deterministic word counter to the
composer. It answers "how long is this note" without sending anything to a server, and it
never truncates an answer to make the number look nicer: input that is too long is
rejected so that a wrong count cannot be reported as a real one.

- Version: 1.2.3 (released 2026-02-10)
- License: MIT
- Maintainer: Example Maintainers
- Issues and feedback: https://github.com/example/sample-plugin/issues
- Package: https://example.com/sample-plugin

## What it does

sample-plugin exposes one tool, `count_words`, and one command, `sample.count`. The tool
returns the number of words and characters in the text it receives, plus the unit it
used for CJK input. The command prints the same numbers into the transcript, so a note
can be measured without leaving the conversation.

The counter is deterministic: the same input always produces the same numbers, both
values are computed locally, and nothing about the text leaves the machine. There is no
model call, no network request, and no stored copy of the text.

## Install

```bash
pnpm add dsh-sample-plugin
```

Then add the plugin to your profile. In the desktop app, open Plugins, choose Add plugin,
and point it at this folder. For a manual profile, add the package name to the profile
and start DeepSeek Harness again.

## Usage

Ask the assistant to count words, or run the command directly:

```text
/sample.count
```

The tool returns JSON that a person and a script can both read:

```json
{ "words": 12, "chars": 63, "unit": "latin" }
```

`unit` is `latin` when the text counted by whitespace boundaries, and `cjk` when each
Han character was counted as one word.

## Configuration

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| maxChars | number | 20000 | Inputs longer than this are rejected |
| includeCjk | boolean | true | Count Chinese characters as words |
| stripMarkdown | boolean | false | Ignore Markdown syntax before counting |

Set the keys in the plugin configuration block:

```yaml
sample-plugin:
  maxChars: 20000
  includeCjk: true
  stripMarkdown: false
```

## Why the limits are published

The plugin rejects inputs over maxChars instead of truncating them, because a truncated
count would be wrong and silently wrong numbers are worse than an error. The limit is
documented, reported in the error payload, and stable across versions, so a caller can
split a long document and retry without guessing.

The same reasoning applies to CJK counting. Counting by whitespace undercounts Chinese
text badly, so the plugin decides the unit from the content and reports which unit it
used. A caller that needs one unit everywhere can set includeCjk to false.

## Failure behaviour

When the input exceeds maxChars the tool returns an error object with code TOO_LONG and
the configured limit. Nothing is written to disk and no partial result is returned. When
the input is empty the tool returns zeroes rather than an error, because an empty note
has a length of zero and that is a correct answer.

## Privacy

The plugin keeps no history, writes no files, and makes no network requests. It reads the
configuration once at start-up and holds it in memory for the life of the process. Since
the counter is pure, the plugin can be removed at any time without leaving data behind.

## Compatibility

Node.js 22 or newer is required, because the plugin uses the built-in test runner and the
modern module resolution rules. DeepSeek Harness 0.30 or newer is required for the
`ctx.tools.register` and `ctx.command` APIs this plugin calls. Older hosts will load the
plugin and skip its registrations rather than fail.

## Support

Open an issue at https://github.com/example/sample-plugin/issues for bug reports and
feature requests. Please include the version reported by `plugin version`, the input
length, and whether CJK counting was enabled. Security reports should go to the same
tracker with the "security" label rather than a public discussion.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the dated history. The short version: 1.2.3 rejects
oversized input instead of truncating it, and 1.2.0 added the includeCjk option.

## License

MIT. Copyright (c) 2026 Example Maintainers.

Last updated: 2026-02-10
