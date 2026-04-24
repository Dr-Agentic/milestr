# Milestr Developer Guide

This repo is a small TypeScript CLI that persists dashboard state, exports HTML, and optionally publishes to Cloudflare Pages.

## Architecture

- `src/index.ts`: CLI parsing, help text, lock orchestration
- `src/actions/handlers.ts`: user actions and state mutations
- `src/data/store.ts`: read/write/validate state, generate HTML, publish after saves
- `src/data/publish.ts`: Cloudflare Pages login, project provisioning, deploy, URL extraction
- `src/ui/dashboardHtml.ts`: static dashboard renderer
- `src/data/*`: backups, locks, logging, config

## Local workflow

```bash
npm install
npm run build
npm test
npm run test:coverage
```

## Publishing workflow

- `publish` calls `wrangler login` if the user is not authenticated.
- The project name is derived from `data.root.title` and persisted in `.milestr-cloudflare.json`.
- If the Pages project does not exist, the CLI creates it before deploying.
- The deploy output URL is printed to stdout and used as the canonical result.

## Files to keep tracked

- `data.json` only if the repo intentionally includes sanitized sample state
- `sample-data.json` for generic examples
- `tests/` for coverage and regression protection
- `docs/` and `SKILL.md` for human and agent onboarding

## Files to keep ignored

- `dashboard.html`
- `site/`
- `dist/`
- `.milestr-cloudflare.json`
- `coverage/`
- `.DS_Store`

## Validation rules

- Build must pass before publishing changes.
- Test suite must pass before merging.
- Any change to publish behavior should be covered by `tests/publish.test.ts`.
- Any change to CLI behavior should be covered by `tests/index.test.ts`.

