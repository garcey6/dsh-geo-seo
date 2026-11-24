# Changelog

All notable changes to sample-plugin are recorded here, newest first. Dates are ISO 8601.

## 1.2.3 - 2026-02-10

- Reject input above maxChars instead of truncating it; the error carries code TOO_LONG.
- Report the counting unit (`latin` or `cjk`) in the tool payload.

## 1.2.0 - 2026-01-18

- Add the includeCjk option so CJK text can be counted per character.
- Document the configuration keys in a table.

## 1.1.0 - 2025-12-02

- Add the sample.count command as a shortcut for the tool.

## 1.0.0 - 2025-11-20

- First release: count words and characters locally, with no network access.
