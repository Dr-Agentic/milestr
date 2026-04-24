---
name: milestr-dashboard
description: Use this skill when working on the Milestr TypeScript CLI dashboard, its generated HTML output, local data files, tests, or Cloudflare Pages publishing workflow.
---

# Milestr Dashboard Skill

Use this repo as a local project dashboard for goals, milestones, tasks, and KPIs.

## What to do first

- Read `README.md` for the product overview.
- Read [docs/user-guide.md](docs/user-guide.md) for user-facing workflows.
- Read [docs/developer-guide.md](docs/developer-guide.md) before changing code.

## Safe operating rules

- Always run commands with `--agent <name>`.
- Prefer `npm run dev -- --agent <name> <action>` over manual file edits for state changes.
- Mutating commands automatically back up data and regenerate HTML.
- `publish` uses `wrangler login`; do not request API tokens for the supported flow.
- Do not commit generated artifacts like `dashboard.html`, `site/`, `dist/`, `coverage/`, or `.milestr-cloudflare.json`.

## Common actions

- Create work items with `create`
- Update workflow state with `status`, `progress`, `title`, and `due`
- Inspect state with `list`, `view`, `list-kpis`, and `metrics`
- Export locally with `export`
- Publish with `publish`

## When editing code

- Keep changes compatible with the existing CLI contract.
- Preserve the publish behavior: derive the Pages project name once, persist it, and print the deployed URL.
- Update tests when changing parsing, persistence, export, or publish behavior.

## Validation

- Run `npm run build`
- Run `npm test`
- Run `npm run test:coverage` for behavior that should be well covered

