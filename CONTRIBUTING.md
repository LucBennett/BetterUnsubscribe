# Contributing to BetterUnsubscribe

Thanks for your interest in contributing! This covers the basics for both code and translation contributions.

## Setup

```bash
npm install
```

## Development workflow

- **Format**: `npm run format` (Prettier)
- **Lint**: `npm run lint` (ESLint)
- **Test**: `npm run test` (Jest)
- **Build**: `npm run compile` (produces `BetterUnsubscribe.xpi` in `build/`; see the README's Build Instructions for platform-specific alternatives)

Run format, lint, and test before opening a pull request.

## Code contributions

- Keep changes focused; unrelated formatting/refactoring makes a PR harder to review.
- New source files under `src/` should follow the existing pattern of a short file-header comment describing the module's responsibility, plus JSDoc on exported functions/classes (see `src/unsubMethods.js` or `src/background.js` for examples).
- If you're changing message strings, update `src/_locales/en/messages.json` (the source locale) - other locales don't need to be updated in the same PR.

## Translation contributions

Translations live in `src/_locales/<locale>/messages.json`, one file per locale, each entry keyed by message name with a `message` and `description` field. To add or update a translation:

1. Copy the key structure from `src/_locales/en/messages.json`.
2. Translate the `message` values; leave `description` untranslated (it's for translator context, not shown to users).
3. Open a PR with just the locale file(s) you're changing.

## Reporting issues

Please open a GitHub issue with steps to reproduce, your Thunderbird version, and (if relevant) the extension version.
