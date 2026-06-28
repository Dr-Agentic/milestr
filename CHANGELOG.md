# Changelog

All notable changes to Milestr are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Notes
- **Cascade quirk (deferred):** When a parent task is fully complete
  (`progress=100`, `status=done`) and a new child is added with
  `progress=0`, the parent's `progress` recomputes to a lower number
  (unweighted mean). The parent's `status` does not currently flip
  back to `ongoing` unless a sibling is `ongoing` — only `not_started`.
  Morsy's call: defer. The intended v1.2 behavior is that 100% is a
  deliberate signal and must be reset by the agent (`status ... ongoing`
  or `progress ... <100>`), not silently re-derived from children.
  Tracked for the v1.2 actions release.

## [1.1.0] - 2026-06-28

### Added
- `--json` output flag for `view`, `list`, `list-kpis`, and `metrics`.
  Emits machine-readable JSON instead of human-formatted console
  output. Human output is unchanged when the flag is absent.
- `MILESTR_AGENT` env var as a fallback for the `--agent` flag.
  Explicit `--agent` still wins; without either, the CLI throws
  `CliError` (no silent `agent=unknown` writes).
- `vitest.config.ts` coverage thresholds (statements 95%, branches
  80%, functions 95%, lines 95%). CI fails the build on regression.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running
  `npm ci && npm run build && npm test` on Node 18.x, 20.x, 22.x.
  Coverage is uploaded as an artifact on Node 22.x.
- `CHANGELOG.md` (this file) in Keep-a-Changelog format.
- `SECURITY.md` with disclosure policy and threat-model notes.
- `.editorconfig` and `.gitattributes` for cross-platform formatting
  hygiene.

## [1.0.0] - 2026-04-24

### Added
- Initial public release on [Dr-Agentic/milestr](https://github.com/Dr-Agentic/milestr).
- Hierarchical task model: Goal → Milestone → Initiative → Task.
- KPIs as first-class entities (create-kpi, update-kpi, list-kpis).
- Auto-generated `dashboard.html` with KPIs, Timeline, Kanban, and List views.
- Cloudflare Pages publishing via `wrangler` (login flow, no API tokens).
- Atomic writes with PID-based file locking and 10-deep backup ring.
- 96.46% statement coverage across 41 tests.

[Unreleased]: https://github.com/Dr-Agentic/milestr/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Dr-Agentic/milestr/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Dr-Agentic/milestr/releases/tag/v1.0.0
