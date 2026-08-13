# CR-0002 — `init` Command: Spec, Hardening & Real-Data Test

**Status:** Implemented
**Implemented in:** `ca7e110` (2026-08-12) — shipped in v1.2.1
**Author:** Milie (📐)
**Date:** 2026-08-01 (Proposed) / 2026-08-12 (Implemented)
**Scope:** `src/actions/handlers.ts` (only), `tests/handlers.test.ts`, `tests/fixtures/milestr-real-data.json`, `SKILL.md`, `.hermes/skills/milestr/`
**Related:** CR-0001 (data versioning), `SKILL.md` §3

---

## TL;DR

`init` already exists at `src/actions/handlers.ts:actionInit` and is wired into the CLI router. It writes a single root goal, stamps `CURRENT_DATA_VERSION`, and refuses to overwrite. This CR:

1. **Re-specs** the command so its contract is explicit (defaults, flags, error semantics).
2. **Hardens** gaps: `--force` overwrite, `--seed` rich sample, defensive checks.
3. **Extends tests** to 8 cases incl. schema/publish side-effects, CI sandbox, and a real-data test using Milestr's own `data.json`.
4. **Drops a fixture** at `tests/fixtures/milestr-real-data.json` and a test that runs `init --seed <fixture>` end-to-end.
5. **Updates `SKILL.md`** to match and **propagates** to the `.hermes` installation.

The implementation is already ~80% there — this is a contract + test + docs pass, not a from-scratch feature.

---

## 1. Motivation

- `SKILL.md` §3 documents `init` as if it's a polished feature, but the implementation is a minimal root-only stub.
- No `--force` flag → users can't reset a broken dashboard without manual `rm`.
- No `--seed` flag → no way to bootstrap a realistic example without hand-editing.
- Test coverage is 3 cases: basic create, flag overrides, overwrite refusal. Missing: publish call, schema validity, `--data <dir>` integration, `--force`, real-data round-trip.
- No real-data integration test. We should be able to run `init` against a copy of Milestr's own `data.json` and validate it round-trips through the schema.
- The skill is referenced in two places (`SKILL.md` in repo, and the `.hermes` skill shipped to agents). They must stay in sync.

## 2. Goals

1. `init` is documented as a first-class provisioning command with explicit contract.
2. Supports `--data <dir>`, `--data-file <path>`, `--agent <name>`, `--force`, `--minimal`, `--seed <path>`.
3. Stamps `meta.version = MILESTR_VERSION` and `meta.lastUpdated = now` (already true).
4. Generates a syntactically valid `data.json` that passes `validateDashboardData()` (Zod).
5. Writes the static dashboard HTML to `dashboard.html` and `site/index.html`.
6. Calls `publishDashboard()` (already true) and logs the published URL.
7. Refuses to overwrite without `--force`; emits a clear `ConflictError`.
8. 8+ test cases including a real-data round-trip using a fixture derived from Milestr's own dashboard.
9. `SKILL.md` updated and propagated to `.hermes/skills/milestr/`.

## 3. Non-Goals

- Interactive prompts (TTY mode). CLI is non-interactive by design.
- Network resolution of `--seed` URLs (local path only).
- Migration of pre-existing data (handled by CR-0001).
- Writing to a Cloudflare Pages project other than the configured one (CR-0003 territory).

## 4. Proposed Design

### 4.1 Final CLI contract

```text
milestr init [--data <dir>] [--data-file <path>] [--agent <name>]
             [--id <root-id>] [--title <title>] [--icon <emoji>]
             [--minimal] [--seed <path-to-json>] [--force]
```

| Flag | Default | Notes |
|------|---------|-------|
| `--data <dir>` | CWD | Resolve data file relative to this dir. |
| `--data-file <path>` | `<dir>/data.json` | Explicit file path; overrides default name. |
| `--agent <name>` | `MILESTR_AGENT` env → `unknown` | Required by `run()`. |
| `--id <root-id>` | `ROOT` | Stable identifier for the root goal. |
| `--title <title>` | `My Dashboard` | Human-readable title. |
| `--icon <emoji>` | `🎯` | Single emoji glyph. |
| `--minimal` | `false` | Skip the default seed (root-only). |
| `--seed <path>` | `<repo>/sample-data.json` if not `--minimal` | Optional path to a JSON file shaped like `DashboardData`. |
| `--force` | `false` | Overwrite an existing `data.json`. |
| `--json` | `false` | Emit the resulting `data.json` on stdout (machine-readable). |

### 4.2 Behavior

1. Resolve target path via `--data-file` (if set) else `paths.dataFile` (which already honors `--data`).
2. If the file exists and `--force` is not set → throw `ConflictError` with the existing path and the hint to use `--force` or `--data <dir>`.
3. Build the `DashboardData` payload:
   - **Default:** root goal only, empty `tasks` map except for root, empty `kpis`, `meta.version = MILESTR_VERSION`, `meta.lastUpdated = now`.
   - **`--minimal`:** same as default but skips loading the shipped `sample-data.json`.
   - **`--seed <file>`:** deep-clone the file contents, validate with `validateDashboardData()`, then **overwrite** `meta.version = MILESTR_VERSION` and `meta.lastUpdated = now`. Refuses if the file does not parse or fails schema.
4. Ensure dashboard directory exists (`fs.mkdir({ recursive: true })`).
5. Write `data.json` (2-space indent + trailing newline).
6. Call `saveStaticSite(paths, data)` to emit `dashboard.html` and `site/index.html`.
7. Call `publishDashboard(paths, data)` and log the URL on success.
8. Print a one-line summary: `Initialized: <path>` + optional `Dashboard: <url>`.

### 4.3 Schema & payload invariants

- `meta.version` MUST equal `MILESTR_VERSION` (not the seed file's version).
- `meta.lastUpdated` MUST be ISO-8601 UTC.
- `root` and `tasks[rootId]` MUST have identical `id`, `title`, `type`, `status`, `icon`, `parent = null`, `children = []` (or the seed's children).
- `activityLog` starts empty (the seed's log is preserved if `--seed` is used).
- `kpis` defaults to `{}` if not present in the seed.

### 4.4 Files to change

| File | Change |
|------|--------|
| `src/actions/handlers.ts` (`actionInit`) | Add `--data-file`, `--force`, `--minimal`, `--seed`, `--json`; pre-validate seed; ensure `meta.version` is always stamped. |
| `tests/handlers.test.ts` | Add 5 new cases (see §6). |
| `tests/fixtures/milestr-real-data.json` | **New** — snapshot of Milestr's own `data.json` for the real-data test. |
| `src/data/store.ts` | Export `validateData` is already public; no change. |
| `SKILL.md` §3 | Update to match the new CLI contract. |
| `.hermes/skills/milestr/SKILL.md` | Same change, propagated (see §7). |

### 4.5 Out-of-scope (tracked elsewhere)

- `MIGRATION` interaction: `init` never reads an existing `data.json` (refuses), so CR-0001's loader is irrelevant.
- `dist/` rebuild: `npm run build` will run before publish.

## 5. Pseudo-diff for `actionInit`

```ts
export const actionInit: ActionHandler = async (ctx, args) => {
  const id = typeof args.id === 'string' ? args.id : 'ROOT';
  const title = typeof args.title === 'string' ? args.title : 'My Dashboard';
  const icon = typeof args.icon === 'string' ? args.icon : '🎯';
  const force = args.force === true;
  const minimal = args.minimal === true;
  const json = args.json === true;
  const seedPath = typeof args.seed === 'string' ? args.seed : null;
  const explicitFile = typeof args['data-file'] === 'string' ? args['data-file'] : null;
  const targetPath = explicitFile ? path.resolve(explicitFile) : ctx.paths.dataFile;

  if (await dataExists(targetPath) && !force) {
    throw new ConflictError(
      `data.json already exists at ${targetPath}. ` +
      `Remove it first, or re-run with --force, or use --data <dir> to initialize a different directory.`
    );
  }

  const now = new Date().toISOString();
  let data: DashboardData;

  if (seedPath && !minimal) {
    const raw = await fs.readFile(seedPath, 'utf8');
    const parsed = JSON.parse(raw);
    data = validateDashboardData(parsed); // throws ValidationError on bad shape
    data.meta.version = MILESTR_VERSION;  // always stamp current version
    data.meta.lastUpdated = now;
    data.meta.updateFrequency = data.meta.updateFrequency ?? 'hourly';
  } else {
    data = {
      meta: { lastUpdated: now, updateFrequency: 'hourly', version: MILESTR_VERSION },
      root: { id, title, type: 'goal', status: 'ongoing', dueDate: null, icon, parent: null, children: [] },
      tasks: { [id]: { id, title, subtitle: 'Initialized with milestr init', type: 'goal', status: 'ongoing', progress: 0, dueDate: null, icon, parent: null, children: [], activityLog: [] } },
      kpis: {}
    };
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await saveStaticSite(ctx.paths, data);
  const publishedUrl = await publishDashboard(ctx.paths, data);

  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    log('Initialized: ' + targetPath);
    if (publishedUrl) log('Dashboard: ' + publishedUrl);
  }
};
```

## 6. Test plan

### 6.1 Existing tests (keep + extend)

Already in `tests/handlers.test.ts`:
- T1: `init` creates a `data.json` with a root goal and correct `meta.version`.
- T2: `init` accepts `--id`, `--title`, `--icon` overrides.
- T3: `init` refuses to overwrite an existing `data.json` (with `ConflictError`).

### 6.2 New tests (add)

- **T4:** `init --force` overwrites an existing `data.json` and the new contents match expectations.
- **T5:** `init` writes HTML to `dashboard.html` and `site/index.html` via `saveStaticSite`.
- **T6:** `init` calls `publishDashboard` exactly once and the log includes the published URL.
- **T7:** `init --minimal` skips the `sample-data.json` default and produces a root-only payload.
- **T8:** `init --seed <bad.json>` (invalid shape) throws `ValidationError` and does **not** write any file.
- **T9:** `init --data <dir>` writes `<dir>/data.json` even when CWD is different.
- **T10 (real-data):** `init --seed tests/fixtures/milestr-real-data.json` round-trips through the schema. The resulting `data.json` has `meta.version === MILESTR_VERSION` and is byte-identical to the seed except for the `meta` block. After re-`loadData()` it produces the same `tasks` map (deep equality).

### 6.3 Real-data fixture

- Path: `tests/fixtures/milestr-real-data.json`.
- Source: copy of `~/dev/milestr/data.json` at a known commit, with `meta.version` deliberately set to `0.5.0` so the test verifies the version-stamping path.
- Committed under `tests/fixtures/` (small, ~4 KB).
- The test asserts:
  - `meta.version` is rewritten to `MILESTR_VERSION` after `init`.
  - `root.id`, `tasks`, `kpis` keys are identical to the seed.
  - `loadData()` against the resulting file yields a `DashboardData` equal to the seed's `tasks` + `kpis` (ignoring rewritten `meta`).

### 6.4 Coverage targets

- `actionInit` line + branch coverage ≥ 95%.
- `test:coverage` global threshold unchanged from current.

### 6.5 CI

- `npm run build && npm test && npm run test:coverage` green.
- Sandbox mode (no network) — `publishDashboard` is mocked, so no external deps.

## 7. SKILL.md & .hermes propagation

### 7.1 In-repo `SKILL.md`

Update §3 to match the final CLI contract, swap the example:

```text
Use `init` to bootstrap a fresh `data.json`:

```bash
mkdir -p ~/milestr/my-project
cd ~/milestr/my-project
milestr --agent operator init [--id ROOT] [--title "My Project"] [--icon 🚀]
```

`init` refuses to overwrite an existing `data.json` — pass `--force` to reset, or
`--data <dir>` to initialize a different directory. Use `--seed <path>` to
bootstrap from a JSON file, or `--minimal` for a root-only stub.
```

### 7.2 .hermes propagation

The `.hermes` skill mirror must be updated so agents shipped via Hermes see the
new contract. Procedure:

1. Locate the mirror: `find ~/.hermes ~/.openclaw -path '*milestr*SKILL.md' -type f`.
2. Update with the same patch — use `apply_patch` or `edit` on the mirror file.
3. Verify the in-repo `SKILL.md` (version `1.2.1`) and the mirror match the
   frontmatter and the §3 spec.
4. If the mirror is a skill registry (e.g. `~/.openclaw/skills/milestr-dashboard/`),
   follow the registry's own update command (e.g. `npm run publish-skill` or
   `openclaw skills sync`). Document the exact command in the PR.

## 8. Rollout

1. Land `actionInit` changes + new tests + fixture.
2. Run `npm test` locally, confirm green.
3. Run `npm run build` to republish `dist/`.
4. Update `SKILL.md` + propagate to `.hermes`.
5. Update `CHANGELOG.md` under `Unreleased`: "Enhance `init` with `--force`, `--seed`, `--minimal`, `--data-file`, `--json`; add real-data test; refresh SKILL.md."
6. Cut `1.3.0`.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `init --force` deletes agent work silently | `init` writes a backup via `createBackup()` before overwriting. |
| `--seed` with arbitrary large file balloons `data.json` | Doc the constraint; tests use a small fixture. |
| Re-stamping `meta.version` breaks a user who manually bumps it | Documented behavior; CR-0001 covers chain migration for users who *want* to stay on an older version. |
| `SKILL.md` ↔ `.hermes` drift | Propagation step is part of the PR checklist. |

## 10. Acceptance criteria

- [ ] `actionInit` accepts `--data`, `--data-file`, `--force`, `--minimal`, `--seed`, `--json`, `--id`, `--title`, `--icon`, `--agent`.
- [ ] `meta.version` is always `MILESTR_VERSION` regardless of seed contents.
- [ ] Existing files are refused unless `--force` is set (with `ConflictError`).
- [ ] `init --seed <bad>` throws `ValidationError`, writes nothing.
- [ ] 10 init tests pass, including T10 (real-data round-trip).
- [ ] `test:coverage` ≥ current baseline.
- [ ] `SKILL.md` §3 reflects the new contract.
- [ ] `.hermes/skills/milestr/SKILL.md` (or equivalent) is updated to match.
- [ ] `npm run build` succeeds.