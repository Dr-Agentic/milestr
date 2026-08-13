# CR-0001 — Data Versioning & Automatic Migrations for `data.json`

| **Status:** Partial
| **Partially implemented in:** `ca7e110` (2026-08-12) — shipped in v1.2.1
| **Author:** Milie (📐)
| **Date:** 2026-07-29 (Proposed) / 2026-08-12 (Partial)

### Implementation status
- ✅ `meta.version` required and tracked against executable version (`src/version.ts`, `src/data/schema.ts`).
- ✅ Registry pattern (`src/data/migrations/index.ts`) with `from[]` → `to` chain runner.
- ✅ Loader hardening (`src/data/store.ts`): `migrateData()`, pre-migration backup, Zod re-validation, log entry, restore re-enters normal load path.
- ✅ `MigrationError` for new-version data; in-memory migration that never mutates `data.json` on failure.
- ✅ CI gate (`scripts/check-migrations.mjs` + `npm run check-migrations` in `.github/workflows/ci.yml`).
- ✅ Contributor checklist (`.github/pull_request_template.md`).
- ✅ Author guide (`src/data/migrations/README.md`).
- ✅ Tests: chain of two migrations, partial failure preserves file, future-version error (`tests/store.test.ts`, `tests/migrations.test.ts`).
- ❌ **`milestr migrate <subcommand>` CLI surface (§4.4).** The user-facing
  `status | dry-run | run | rollback` subcommands were not landed in `ca7e110`.
  The current `init` and load-time auto-migration are the only ways to
  trigger a migration. Tracked for v1.3.

**Scope:** `src/data/migrations/`, `src/data/store.ts`, `src/version.ts`, CLI surface, docs
**Related:** Milestr `data.json`, `package.json` semver, `CHANGELOG.md`

---

## TL;DR

`data.json` currently has no contract with the executable that reads it. As the
schema grows we risk silent corruption, lost fields, or agents writing to a
file their CLI cannot parse. This CR formalizes the data-version + migration
contract that already exists in the codebase (`meta.version`, `migrateData()`,
`MigrationError`), hardens the gaps, and exposes it as a first-class CLI
command so users and agents can inspect, dry-run, and force upgrades.

---

## 1. Motivation

Today:

- `meta.version` is written on save but **not enforced on load** unless the
  shape changes accidentally break Zod validation.
- `src/data/migrations/` ships a single `v1.1.0 → current` step that only
  stamps the version. There is no registry pattern, no chain, no contract for
  adding new steps.
- There is **no CLI command** to view the stored vs. executable version, run a
  migration dry-run, or roll back from a backup.
- Backup rotation, lockfile, and migration all happen implicitly inside
  `loadData()`. A user who opens a dashboard from a future executable sees a
  `MigrationError` with no remediation hint.
- Adding any new task/KPI field today means hand-editing sample data + hoping
  users re-init. That breaks adoption.

## 2. Goals

1. Every persisted `data.json` carries a `meta.version` matching the
   executable that produced it.
2. Loading a file with an older `meta.version` automatically upgrades it,
   creates a timestamped backup, logs the migration, and re-validates with
   Zod — all **before** any dashboard export or publish.
3. Loading a file with a **newer** `meta.version` than the executable fails
   fast with an actionable `MigrationError`.
4. Loading **unversioned** legacy data (≤ v1.1.0) is treated as `0.0.0` and
   migrated forward.
5. A migration registry pattern makes adding a step a one-file change with
   tests.
6. A new CLI surface exposes `migrate status | dry-run | run | rollback` so
   agents and humans can drive migrations explicitly.

## 3. Non-Goals

- Cloud-side schema migration (Cloudflare Pages publish flow is unaffected).
- Auto-downgrade (rolling forward is allowed; rolling back requires a backup
  and an explicit `--force` flag).
- Online migration of multi-writer concurrent data.json files (single-writer
  + lockfile remains the model).

## 4. Proposed Design

### 4.1 Data contract

```jsonc
{
  "meta": {
    "lastUpdated": "2026-07-29T07:17:00.000Z",
    "updateFrequency": "hourly",
    "version": "1.2.1"            // <-- MUST equal MILESTR_VERSION at write-time
  },
  // ...
}
```

- `meta.version` is required (Zod).
- Version format: SemVer `MAJOR.MINOR.PATCH`. `v` prefix tolerated on read.
- The executable version is sourced from `src/version.ts` → `MILESTR_VERSION`
  (already reads `package.json`).

### 4.2 Migration registry (`src/data/migrations/index.ts`)

Already partially implemented. CR formalizes:

```ts
interface VersionMigration {
  from: string[];                                   // supported source versions
  to: string;                                       // target version
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

const migrations: VersionMigration[] = [
  { from: ['0.0.0', '1.0.0', '1.1.0'], to: '1.2.1', migrate: migrateLegacyDashboard },
  // future: { from: ['1.2.1'], to: '1.3.0', migrate: addKpiTrendSource },
];
```

Rules:

- Registry is **ordered low → high**. The runner picks the first entry whose
  `from` contains the stored version, runs it, and repeats until the result
  equals the executable version or no path exists.
- Each migration is a pure function: `(data) => data`. No I/O, no clock, no
  randomness. This keeps them unit-testable and replayable.
- Each migration lives in its own file under `src/data/migrations/<from>-to-<to>.ts`
  and ships with a sibling test under `tests/migrations/`.

### 4.2.1 Future-self guardrails

The process must not depend on an agent remembering this CR years later. The
repository enforces the contract mechanically:

- `npm run check-migrations` verifies that `CURRENT_DATA_VERSION` matches
  `package.json`, every step moves forward, the registry targets the current
  executable, and a chain exists from the previous package version.
- CI runs that guard after the build, with two git revisions available so it
  can compare the current release against its predecessor.
- `.github/pull_request_template.md` requires every contributor to declare
  whether the persisted data shape changed and whether a migration was added.
- A code-only release still needs a no-op migration entry because persisted
  data versions intentionally follow executable versions.

This makes a forgotten migration a failing check, not a future documentation
lookup or memory problem.

### 4.3 Load behavior (`src/data/store.ts`)

Current flow (already present, will be hardened):

```text
read data.json
  → migrateData(parsed)        // version check + chain
  → validateData(result)       // Zod
  → if migrated: backup + persist upgraded copy + log
  → return DashboardData
```

CR additions:

- Migration failure **never** mutates `data.json`. The original file is left
  intact so users can roll back manually.
- `MigrationError` messages include: stored version, executable version,
  nearest known source version, and a hint pointing at `milestr migrate status`.
- On successful auto-migration the log entry is:
  `MIGRATION: <from> → <to> (backup <name>)` (already implemented).

### 4.4 CLI surface (`src/actions/handlers.ts` + `src/index.ts`)

New top-level command:

```text
milestr migrate <subcommand>

  status      Show stored vs. executable version, last migration log entry, backup count.
  dry-run     Parse + migrate in-memory only; report diff summary, do not write.
  run         Force a migration pass now (useful after editing data.json by hand).
  rollback    Restore the most recent backup; refuses if backup version > executable.
```

Flags:

- `--data-file <path>` (default: resolved `data.json`)
- `--force` for `rollback` to bypass version check (logs a WARNING).

### 4.5 Backup & rotation (`src/data/backup.ts`)

- Keep current "one backup per save" semantics.
- On migration, the **pre-migration** file is the backup target (already done).
- Add a `milestr backups list` subcommand reusing the existing
  `createBackup` helper for visibility.

### 4.6 Error contract (`src/errors.ts`)

Already has `MigrationError`. Add typed subclasses for clearer UX:

- `VersionTooNewError` (stored > executable)
- `VersionTooOldError` (stored < executable, no path)
- `MigrationChecksumError` (reserved, for future signed migrations)

Each carries `{ storedVersion, executableVersion, hint }` for friendlier
output.

## 5. File-by-file changes

| File | Change |
|------|--------|
| `src/version.ts` | No change; remains single source of executable version. |
| `src/data/migrations/index.ts` | Formalize chain runner, return typed result with path. |
| `src/data/migrations/v1.1.0-to-current.ts` | No change; kept as legacy step. |
| `src/data/migrations/README.md` | New — author guide for adding a migration step. |
| `scripts/check-migrations.mjs` | New — CI guard for version bumps and registry paths. |
| `.github/pull_request_template.md` | New — persisted-data/migration checklist. |
| `src/data/store.ts` | Don't write on migration failure; surface typed errors. |
| `src/data/backup.ts` | Expose `listBackups()` for the CLI. |
| `src/actions/handlers.ts` | Add `migrate` subcommand handlers. |
| `src/index.ts` | Wire `migrate` into the command router. |
| `src/errors.ts` | Add `VersionTooNewError`, `VersionTooOldError`, `MigrationChecksumError`. |
| `tests/store.test.ts` | Cover: chain of two migrations, partial failure leaves file intact, future-version error message. |
| `tests/migrations/` | New folder; one spec per migration file. |
| `docs/developer-guide.md` | New section: "Adding a data migration". |
| `SKILL.md` | Document `meta.version`, auto-migration behavior, `milestr migrate` usage. |
| `CHANGELOG.md` | Note under `Unreleased` once shipped. |

## 6. Test plan

- Unit:
  - `migrateData()` runs the registry chain for `1.0.0 → 1.1.0 → 1.2.1`.
  - Migrations are pure (no clock, no fs reads).
  - Future-version file throws `VersionTooNewError` with executable version in message.
  - Unknown older version throws `VersionTooOldError` listing nearest known version.
  - Migration failure leaves `data.json` byte-identical to pre-call.
- Integration (`tests/store.test.ts`):
  - Auto-migration persists upgraded copy and creates a `data-<ts>.json` backup.
  - `loadData()` succeeds end-to-end after chained migration.
- CLI (`tests/cli-smoke.test.ts`):
  - `milestr migrate status` prints stored vs. executable version.
  - `milestr migrate dry-run` does not modify `data.json`.
  - `milestr migrate rollback` restores the most recent backup.

Coverage target: `test:coverage` ≥ current baseline (don't regress).

## 7. Rollout

1. Land registry + loader hardening behind the existing behavior. No user-visible change.
2. Add CLI subcommand under `milestr migrate`. Document in `SKILL.md`.
3. Add author guide `src/data/migrations/README.md` + dev-guide section.
4. Cut `1.3.0`. CHANGELOG entry: "Automatic `data.json` versioning & migration on load; new `milestr migrate` CLI."
5. Publish to npm + Cloudflare Pages.

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bad migration mutates `data.json` in place | Migration runs in-memory; persistence happens only after Zod re-validates. Test asserts byte-identical on failure. |
| User on future executable downgrades accidentally | `rollback` refuses if backup version > executable unless `--force`. |
| Migration drift between distributed agents | Single registry, single executable version, every save re-stamps. |
| Hidden coupling to package layout | `MILESTR_VERSION` already lives in `src/version.ts`; no change needed. |

## 9. Open questions

- Should we sign migrations (hash chain) for tamper detection? — Deferred; not blocking.
- Do we need `milestr migrate diff` for human review of pre/post JSON? — Nice-to-have, post-1.3.0.
- Multi-dataset migration (`--data-file` already supported) — confirm the same code path covers `sample-data.json`. — Yes, already true.

## 10. Acceptance criteria

- [ ] `data.json` without `meta.version` loads and gets stamped to `MILESTR_VERSION` automatically.
- [ ] `data.json` with `meta.version` newer than the executable fails with a typed, actionable error.
- [ ] `data.json` with `meta.version` older than the executable runs the correct migration chain, creates a backup, and re-validates.
- [ ] `milestr migrate status | dry-run | run | rollback` all work and are covered by tests.
- [ ] Adding a new migration step is a one-file change plus a test.
- [ ] `npm run build && npm test && npm run test:coverage` green, no coverage regression.
- [ ] `SKILL.md` and `docs/developer-guide.md` updated.