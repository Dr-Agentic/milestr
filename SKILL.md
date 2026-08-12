---
name: milestr-dashboard
description: Use when operating a Milestr dashboard instance — a TypeScript CLI that tracks hierarchical tasks (goal → milestone → initiative → task) and KPIs for a single project. Triggers on requests like "create a milestone", "log KPI value", "update task status", "set progress", "export the dashboard", "publish to Cloudflare Pages", "check task list", "back up the data", or any work that writes to or reads from a `data.json` Milestr file. Load this skill before running `npm run dev` against a Milestr instance.
version: 1.2.1
author: Stewart (strategy agent for Morsy) and the Milestr maintainers
license: MIT
metadata:
  hermes:
    tags: [milestr, dashboard, cli, task-tracking, kpi, cloudflare-pages]
---

# Milestr — Agent User Guide

## Overview

Milestr is a **local-first CLI dashboard** for tracking the work of a single project. Each project gets its own `data.json`, its own HTML dashboard, and its own Cloudflare Pages deployment. This skill teaches agents how to **operate a Milestr instance** — the safe operating rules, the full CLI surface, the data shape, and the common pitfalls.

If you need to *develop the engine itself* (add features, fix bugs in the CLI, change the data schema, manage releases), you want a separate engine-development skill — this guide is for users of a Milestr instance, not contributors to the engine.

## How agents find and use this skill

This file is the agent-use guide for any agent that operates a Milestr dashboard instance. How an agent runtime discovers and loads skills is **framework-specific** — some loaders scan a global directory on the host, some scan the project root, some accept skills passed in via prompts. Consult your framework's documentation for installation.

**The portable rule:** this file's `description:` frontmatter lists the trigger phrases ("create a milestone", "log KPI value", etc.). Any framework that supports skill loading can match on those and inject this file's contents into agent context when the user prompt matches.

For the simplest case — an agent that has no skill loader — just point the agent at `SKILL.md` in the repo and let it read the file directly. The conventions and CLI recipes in here are language-agnostic.

The skill version tracks the engine version. After every `git pull` on the engine repo, re-read this file or re-run your framework's skill refresh procedure.

## Install & Setup

This section is for an agent or human setting up Milestr from scratch. Follow the steps in order.

### 1. Verify Node.js version

Milestr requires **Node.js ≥ 22** (Active LTS).

```bash
node --version
# must print v22.x or later
```

If Node is missing or older, install it via your platform's package manager (nvm, brew, apt) before continuing.

### 2. Install the `milestr` CLI

The recommended install is via npm, which puts the `milestr` binary on your PATH:

```bash
npm install -g milestr
```

Verify:

```bash
which milestr              # must point to the binary
milestr help               # prints the full action list
npm list -g milestr        # → milestr@<latest> (confirms the installed version)
```

### 3. Create a dashboard directory

Milestr reads and writes `data.json` in the **current working directory** by default.
Use `init` to bootstrap a fresh one:

```bash
mkdir -p ~/milestr/my-project
cd ~/milestr/my-project
milestr --agent operator init [--id ROOT] [--title "My Project"] [--icon 🚀]
# Or from anywhere:
milestr --data ~/milestr/my-project --agent operator init --title "My Project"
```

Flags:
- `--id`, `--title`, `--icon` — customize the root goal.
- `--minimal` — create a bare root-only dashboard (no sample tasks/KPIs).
- `--seed <path>` — bootstrap from an existing `data.json` (preserves tasks/kpis, stamps current version).
- `--force` — overwrite an existing `data.json` without prompting.
- `--data-file <path>` — write to an explicit file path instead of `./data.json`.
- `--json` — emit the resulting `data.json` to stdout instead of logging paths.

`init` auto-stamps `meta.version = CURRENT_DATA_VERSION` (matches `package.json`) and
publishes the dashboard to Cloudflare Pages. It refuses to overwrite without `--force`.

### 4. Pin the data directory per command (recommended for multi-instance users)

If you operate more than one Milestr dashboard, **always pass `--data <dir>` per command** rather than setting an env var. This keeps each invocation explicit and avoids surprises when working across projects:

```bash
milestr --data ~/milestr/my-project --agent planner list
milestr --data ~/milestr/other-project --agent operator create-kpi --id kpi-x --title "X" --value 0 --unit count
```

Single-instance shortcut (if you only ever work with one dashboard):

```bash
export MILESTR_DATA=~/milestr/my-project
milestr --agent planner list   # reads $MILESTR_DATA/data.json
```

`MILESTR_DATA` exists for ergonomics — prefer `--data` when in doubt.

### 5. Try a read-only command

```bash
milestr --agent your-name list
# or, if MILESTR_AGENT is set:
milestr list
```

You should see your tasks (or "Found 0 tasks" if data.json is empty).

### 6. (Optional) Install from source

If you need to modify the engine, install from the GitHub repo instead:

```bash
git clone https://github.com/Dr-Agentic/milestr.git
cd milestr
npm install
npm run build
npm test
```

From the source repo, use `npm run dev -- <args>` instead of `milestr <args>`.

### Engine contributor rule: data migrations are CI-enforced

When changing the persisted `data.json` shape, add a pure migration module under
`src/data/migrations/`, register its source → target version in `index.ts`, and
add a regression fixture/test. Because the data version follows the executable
version, every `package.json` version bump also needs a registry target—even a
no-op migration for a code-only release.

Run the guard before considering the change complete:

```bash
npm run build
npm run check-migrations
npm test
```

CI rejects a version bump without a target migration or a chain from the
previous package version. This is the durable reminder for future contributors;
don't rely on session memory. See `src/data/migrations/README.md` for the
full authoring workflow.

### Troubleshooting

- **`milestr: command not found`** — npm's global bin dir isn't on PATH. Run `npm config get prefix`, then add `<prefix>/bin` to PATH.
- **`Error: Failed to load data.json`** — CWD doesn't contain a `data.json`. Either pass `--data /path/to/dashboard`, set `MILESTR_DATA`, `cd` into the right directory, or run `milestr create --id ROOT --title "My Project" --type goal` to bootstrap one.
- **`--agent is required`** — set `MILESTR_AGENT=<name>` or pass `--agent <name>` per command.
- **Permission denied on global install** — use `sudo npm install -g milestr`, or set up npm to use a non-root prefix: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally

## What Milestr does

- **Persists a goal → milestone → initiative → task graph** to `data.json`.
- **Tracks KPIs** (Key Performance Indicators) — values, units, trend arrows, sources.
- **Auto-regenerates `dashboard.html`** on every write (KPIs + Timeline + Kanban + List views in a single dark-themed HTML file).
- **Optionally publishes** to Cloudflare Pages on every write — that gives the project a public URL.
- **Auto-backs-up** `data.json` before every write (10-deep ring in `backups/`).
- **Logs every change** with timestamp + agent attribution in `dashboard.log` (append-only).

Milestr never executes the actions it tracks. It only records that an agent did something. Execution is your responsibility.

## Data model

```ts
type TaskType = 'goal' | 'milestone' | 'initiative' | 'task';
type TaskStatus = 'not_started' | 'analyzing' | 'ongoing' | 'done' | 'blocked';
type TrendDirection = 'up' | 'down' | 'neutral';

interface Task {
  id: string;             // unique within the project (e.g. "M1", "I2.3")
  title: string;
  subtitle?: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;       // 0–100
  dueDate: string | null; // YYYY-MM-DD or null
  icon: string;           // emoji
  parent: string | null;  // task id or null (ROOT only)
  children: string[];     // child task ids
  activityLog: Array<{ date: string; agent?: string; note: string }>;
}

interface KPI {
  id: string;             // e.g. "kpi-mrr"
  title: string;
  value: string | number;
  unit?: string;
  trend?: TrendDirection;
  source?: string;
  icon: string;
  lastUpdated: string;    // ISO timestamp
}
```

**Hierarchy rule:** children must be of a type strictly *below* their parent in the hierarchy. `goal` → `milestone` → `initiative` → `task`. The engine does not enforce this on `create` — you are responsible for the hierarchy being meaningful.

**Cascade rule:** setting a task `status=done` forces `progress=100`. Setting `progress=100` forces `status=done`. The engine recomputes parent progress as the unweighted mean of children whenever you `create`/`status`/`progress` a child. The parent's status only flips to `done` if **every** child is `done`.

## CLI quick reference

All commands follow the form:
```bash
cd /path/to/milestr-instance
npm run dev -- --agent <your-agent-name> <action> [options]
```

If you set `export MILESTR_AGENT=your-agent-name` once in your shell, you can drop the `--agent` flag from every command (see "Environment" below).

### Task actions

```bash
# Create a task (defaults to type=task if --type omitted)
npm run dev -- --agent teggy create --id I1.5 --title "Ship onboarding flow" --type initiative --parent M1
npm run dev -- --agent teggy create --id T1 --title "Draft launch email" --type task --parent I1.5 --due 2026-07-01 --icon "✉️"

# Update status (note is optional, freeform)
npm run dev -- --agent teggy status I1.5 ongoing
npm run dev -- --agent teggy status I1.5 done "Shipped to 100% of beta cohort"

# Update progress (0-100)
npm run dev -- --agent teggy progress I1.5 75

# Rename, set due date, delete (no children allowed)
npm run dev -- --agent teggy title I1.5 "Onboarding flow (revised)"
npm run dev -- --agent teggy due I1.5 2026-07-15
npm run dev -- --agent teggy delete I1.5       # refuses if I1.5 has children

# Recompute parent progress from current child states (use after manual data edits)
npm run dev -- --agent teggy recalc M1

# Inspect
npm run dev -- --agent teggy view M1            # JSON dump of full task
npm run dev -- --agent teggy list               # all tasks, human-readable
npm run dev -- --agent teggy list --status ongoing
npm run dev -- --agent teggy list --type milestone
```

### KPI actions

```bash
# Create a KPI (icon emoji optional)
npm run dev -- --agent teggy create-kpi --id kpi-mrr --title "MRR" --value 0 --unit USD --source "Stripe" --icon "💰"

# Update a KPI value (any field except id is optional; lastUpdated is auto-set)
npm run dev -- --agent teggy update-kpi --id kpi-mrr --value 4200 --trend up
npm run dev -- --agent teggy update-kpi --id kpi-mrr --unit USD   # units-only update

# List
npm run dev -- --agent teggy list-kpis
```

### Backup, restore, metrics, export, publish

```bash
# Backup (also auto-runs before every write, but you can force it)
npm run dev -- --agent teggy backup

# List backups
npm run dev -- --agent teggy backups

# Restore from a backup timestamp (printed by `backups`)
npm run dev -- --agent teggy restore 2026-04-25T01-38-32-547Z

# Quick stats (total tasks, breakdown by status and type, KPI count)
npm run dev -- --agent teggy metrics

# Regenerate dashboard.html and site/index.html (does NOT publish)
npm run dev -- --agent teggy export

# Publish to Cloudflare Pages (every mutating action auto-publishes; this is for explicit re-publishes)
npm run dev -- --agent teggy publish
```

## Environment variables

### `MILESTR_AGENT` — set your agent identity once

```bash
export MILESTR_AGENT=teggy
npm run dev -- status I1.5 ongoing    # equivalent to: --agent teggy status I1.5 ongoing
```

Precedence: explicit `--agent` flag > `MILESTR_AGENT` env var > CliError.

If neither is set, the engine throws `CliError` — **no silent `agent=unknown` writes**. This was a real bug-fix in v1.1.0: prior versions would log `agent=unknown` and still execute the command. Use the env var to keep your crontab clean.

### `MILESTR_NO_PUBLISH` — opt out of auto-publish (not yet implemented)

Reserved for a future release. Today every mutation publishes. To opt out, run `export` instead and never `publish`.

## Output formats

By default, every command prints human-readable text. The following commands also accept `--json` for machine-readable output:

| Command | Default | With `--json` |
|---|---|---|
| `view <id>` | Full task as pretty JSON with a leading newline | Pure JSON, no leading newline |
| `list` | Formatted table | Array of `{id, type, status, progress, title, parent, icon}` (no `activityLog` — keeps payload small) |
| `list-kpis` | Formatted table | Array of full KPI objects |
| `metrics` | Human stats | Object with `total`, `byStatus`, `byType`, `completed`, `kpis` |

**Example jq recipe:**
```bash
# Get all in-progress initiatives
npm run dev -- list --type initiative --status ongoing --json | jq '.[] | .id'

# Sum KPI values (works only if all values are numeric)
npm run dev -- list-kpis --json | jq '[.[] | .value] | add'

# Watch for status changes
npm run dev -- list --json | jq -r '.[] | select(.status == "blocked") | .id'
```

## File layout (per instance)

| Path | Purpose |
|---|---|
| `data.json` | Source of truth — every read and write goes through here |
| `dashboard.html` | Self-contained HTML dashboard (regenerated on every write) |
| `site/index.html` | Identical to `dashboard.html` (deployable entry point) |
| `backups/data-<ISO-timestamp>.json` | Auto-created before every write; 10-deep ring |
| `dashboard.log` | Append-only change log with timestamp + agent + action |
| `.dashboard.lock` | PID-based file lock, prevents concurrent writes |
| `.milestr-cloudflare.json` | Cloudflare Pages project name for `publish` (gitignored) |

## Common pitfalls

1. **You are working in the wrong instance.** Always `pwd` before any mutation. Three projects share the engine source — running `create` in the wrong directory mutates the wrong `data.json`.
2. **Forgetting `--agent`.** Pre-v1.1.0 silently wrote as `agent=unknown`. Fix: `export MILESTR_AGENT=<name>` once per session.
3. **Setting `progress=100` to mark something done.** Just call `status <id> done` instead — the engine sets `progress=100` automatically. Same for the inverse: setting `status=not_started` forces `progress=0`.
4. **Trying to delete a task with children.** The engine refuses. Delete or re-parent the children first.
5. **Trying to delete `ROOT`.** Refused by design — `ROOT` is the project's anchor.
6. **Running `publish` from the engine repo accidentally.** Hits the demo Cloudflare Pages project, not your instance. Always `cd` into your instance first.
7. **Calling `restore` with a wrong timestamp.** `backups` prints the exact ISO timestamp to use. The `restore` command also writes a `data-pre-restore-<ts>.json` emergency backup before overwriting, so a wrong restore is recoverable.
8. **Concurrent writes.** Two processes writing at the same time: the second one fails with `LockError`. Check `.dashboard.lock` if this happens — the file holds the PID of the holder. The lock auto-clears on process exit.
9. **Trying to read `data.json` while a write is in progress.** The lock is only enforced by the CLI; external readers can see partial writes. The CLI's read-modify-write cycle is atomic, so use the CLI for any mutation.
10. **Stale `data.json` after a long-running session.** The CLI re-reads `data.json` on every command, so there's no in-process staleness. Across processes, the latest write wins — if two agents are editing concurrently, last write wins.

## Verification checklist before any mutating command

- [ ] `pwd` confirms you are in the right Milestr instance directory.
- [ ] `MILESTR_AGENT` is set, or you passed `--agent`.
- [ ] You are not on the engine repo directory (would deploy to demo Cloudflare project).
- [ ] The task ID you are about to use does not already exist (run `list` first).
- [ ] The parent ID you are about to use exists (run `view <parent>` first).
- [ ] The status / progress values you are setting are valid (see Data model above).

## Verification checklist before any publish

- [ ] `backups` shows recent backups exist (recovery path is in place).
- [ ] You have not made any test writes in the last few minutes (those would ship too).
- [ ] You have run `export` after your last edit (every mutation does this automatically, but if you edited `data.json` by hand, you must).

## Self-update

This file's `version` frontmatter MUST match `package.json`'s `version`. The CI workflow fails the build if they diverge.

When you bump `package.json` for a release, bump `version:` in this file in the same commit. The CI workflow runs `npm run check-skill-version` and fails the build if the two diverge.

## Where to find more

- Public repo: https://github.com/Dr-Agentic/milestr
- Engine README (for humans): `README.md` in the engine repo.
- Detailed developer / contributor notes: `docs/developer-guide.md` in the engine repo.
