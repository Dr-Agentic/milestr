# Milestr Developer Guide

This repo is a small TypeScript CLI that persists dashboard state, exports HTML, and optionally publishes to Cloudflare Pages.

## Architecture

- `src/index.ts`: CLI parsing, help text, lock orchestration
- `src/actions/handlers.ts`: user actions and state mutations
- `src/data/store.ts`: read/write/validate state, generate HTML, publish after saves
- `src/data/migrations/`: versioned data migrations applied automatically on load
- `src/version.ts`: reads the executable version from `package.json`
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

## Data migrations

`data.json.meta.version` is the persisted data format version and must match the
installed executable after a successful load. `loadData()` parses the raw JSON,
checks the stored version against `package.json`, applies the registered
migration path, validates the migrated result, creates a pre-migration backup,
and persists the new version. Newer data is rejected rather than downgraded.

When changing the persisted shape:

1. Add a pure migration module under `src/data/migrations/`.
2. Register its `source → target` transition in `src/data/migrations/index.ts`.
3. Add a failing regression test for the old shape, then implement the migration.
4. If `package.json.version` changes, add a target entry for the new executable even when the migration is a no-op.
5. Run `npm run build`, `npm run check-migrations`, and `npm test`.

The migration contract is enforced in CI. It checks that the registry target
matches `package.json`, every step moves forward, and a chain exists from the
previous package version to the current one. A future implementation cannot
silently forget migrations: a version bump without a registry path fails before
the PR can merge. See `src/data/migrations/README.md` and the pull-request
template for the contributor checklist.

