# Milestr User Guide

Milestr is a local CLI dashboard for tracking goals, milestones, initiatives, tasks, and KPIs. It stores state in `data.json`, renders `dashboard.html`, and can publish the static site to Cloudflare Pages.

## What it does

- Track work as a hierarchy of goals, milestones, initiatives, and tasks
- Record status, progress, due dates, and activity logs
- Track KPIs with values, units, trends, and sources
- Export a static HTML dashboard locally
- Publish the dashboard to Cloudflare Pages

## Quick start

```bash
npm install
npm run dev -- --agent your-name create --id M1 --title "First Milestone" --type milestone
npm run dev -- --agent your-name status M1 ongoing
npm run dev -- --agent your-name export
```

## Common commands

- `create`: add a task, milestone, initiative, or goal
- `status`: update task status
- `progress`: set a numeric completion value
- `title`: rename a task
- `due`: set a due date
- `delete`: remove a task with no children
- `recalc`: recompute progress from child items
- `create-kpi`: add a KPI card
- `update-kpi`: update KPI values
- `list`, `view`, `list-kpis`: inspect current state
- `export`: rebuild the local HTML dashboard
- `publish`: publish the dashboard to Cloudflare Pages

## Publishing

`publish` uses `wrangler login` for Cloudflare authentication. On first publish, Milestr derives the Pages project name from the dashboard root title, creates the project if needed, and then deploys the generated `site/index.html`.

The command prints the final Pages URL to stdout so agents and humans can reuse it safely.

## Data files

- `data.json`: the working dashboard state
- `dashboard.html`: local export for viewing
- `site/index.html`: deployable Pages entrypoint

## Notes

- Every mutating command creates a backup before writing.
- Use a unique `--agent` name so activity logs stay readable.
- `dashboard.html`, `site/`, `dist/`, and local Cloudflare config files are generated artifacts and should not be committed.

