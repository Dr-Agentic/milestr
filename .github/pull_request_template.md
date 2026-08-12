## Summary

<!-- What changed and why? -->

## Test plan

- [ ] `npm run build`
- [ ] `npm run check-migrations`
- [ ] `npm test`

## Persisted data contract

Choose one:

- [ ] This change does not affect the persisted `data.json` shape.
- [ ] This change affects persisted data. I added a migration module, registered the source → target path, and added a regression fixture/test.
- [ ] This release changes `package.json.version`. I verified the migration registry targets the new executable version, including a no-op migration if the data shape is unchanged.

## Migration safety

- [ ] Older data remains readable or has a tested migration path.
- [ ] Newer data is not downgraded.
- [ ] Migration failures leave the original `data.json` unchanged.
