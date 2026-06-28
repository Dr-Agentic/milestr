# Changelog

All notable changes to Milestr are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) — `build + test` matrix on Node 18, 20, 22.
- `.editorconfig` and `.gitattributes` for consistent formatting.
- `SECURITY.md` with disclosure policy and threat model notes.
- `milestr-engine` Hermes skill for engine stewardship.

## [1.0.0] - 2026-04-24

### Added
- Initial public release on [Dr-Agentic/milestr](https://github.com/Dr-Agentic/milestr).
- Hierarchical task model: Goal → Milestone → Initiative → Task.
- KPIs as first-class entities (create-kpi, update-kpi, list-kpis).
- Auto-generated `dashboard.html` with KPIs, Timeline, Kanban, and List views.
- Cloudflare Pages publishing via `wrangler` (login flow, no API tokens).
- Atomic writes with PID-based file locking and 10-deep backup ring.
- 96.46% statement coverage across 41 tests.

[Unreleased]: https://github.com/Dr-Agentic/milestr/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Dr-Agentic/milestr/releases/tag/v1.0.0
