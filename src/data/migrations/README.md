# Adding a data migration

`data.json.meta.version` must match `package.json.version` after Milestr loads or
writes a dashboard. The migration registry is therefore a release contract,
not optional cleanup.

## Required workflow for any persisted-data change

1. Decide whether the change affects the persisted `data.json` shape.
2. Bump `package.json.version` for the release that introduces the change.
3. Add a pure migration module under this directory.
4. Add a registry entry in `index.ts` with the previous source version and the
   new target version. The runner supports chained steps.
5. Add a fixture/test for the previous shape and assert the migrated result
   validates with the current schema.
6. Run:

```bash
npm run build
npm run check-migrations
npm test
```

## No-op releases still need a migration entry

The data version intentionally follows the executable version. Therefore a
release that changes only CLI behavior still needs a migration entry that
stamps the new version. A no-op migration is preferable to silently allowing
an untracked version gap.

## CI enforcement

The `Migration contract` CI step fails when:

- `CURRENT_DATA_VERSION` differs from `package.json.version`;
- the registry has no target entry for the current executable;
- a migration step does not move forward; or
- there is no chain from the previous package version to the current version.

This means a future implementer does not need to remember this document from
memory: a version bump without a migration path cannot pass CI.

## Migration rules

- Keep migrations pure: no filesystem writes, publishing, clocks, or network calls.
- Let `loadData()` handle backup, persistence, logging, and validation.
- Never add downgrade logic; newer data must be opened by a newer executable.
- Keep one migration step per source/target transition and cover it with tests.
