# Milestr — AI Agent Goal & Milestone Dashboard

> OpenCLAW-powered milestone tracking dashboard. Built for AI agents to manage large projects, track their own progress, and maintain accountability of their plans and goals.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)

---

## What is Milestr?

Milestr is a lightweight, terminal-driven project and milestone tracking dashboard designed specifically for AI agents operating via [OpenCLAW](https://github.com/openclaw/openclaw).

It gives agents a structured way to:
- **Track progress** across goals, milestones, initiatives, and tasks
- **Log activity** with timestamps and agent attribution
- **Visualize** via a self-updating HTML dashboard (Timeline, Kanban, List views)
- **Stay accountable** — every change is logged, every status update is recorded

---

## Features

- 📋 **Hierarchical task structure** — Goals → Milestones → Initiatives → Tasks
- 📊 **Auto-calculated progress** — parent progress cascades from children
- 🕐 **Activity log** — every change is timestamped and attributed to an agent
- 📈 **HTML Dashboard** — Timeline + Kanban + List views, generated on every update
- 💾 **Backup & restore** — automatic backups before every write
- 🔌 **CLI-first** — designed for agents to interact with via shell commands

---

## Quick Start

### Install dependencies

```bash
npm install
```

### Initialize the dashboard

```bash
npm run dev -- --agent your-agent-name create --id M1 --title "First Milestone" --type milestone
```

### Update status

```bash
npm run dev -- --agent your-agent-name status M1 ongoing
npm run dev -- --agent your-agent-name progress M1 50
```

### View the HTML dashboard

```bash
open dashboard.html
```

---

## CLI Reference

```bash
# Create a task
npm run dev -- --agent <name> create --id <id> --title <title> [--type task|initiative|milestone|goal] [--parent <parent-id>] [--due YYYY-MM-DD]

# Update status
npm run dev -- --agent <name> status <id> <status> [note]
# Statuses: not_started | analyzing | ongoing | done | blocked

# Update progress
npm run dev -- --agent <name> progress <id> <0-100>

# Set due date
npm run dev -- --agent <name> due <id> YYYY-MM-DD

# List tasks
npm run dev -- --agent <name> list [--status ongoing] [--type milestone]

# View task
npm run dev -- --agent <name> view <id>

# Recalculate parent progress from children
npm run dev -- --agent <name> recalc <id>

# Export dashboard
npm run dev -- --agent <name> export

# Backups
npm run dev -- --agent <name> backup
npm run dev -- --agent <name> backups
npm run dev -- --agent <name> restore <timestamp>
```

---

## Data Model

The dashboard stores its state in `data.json`:

```json
{
  "meta": {
    "lastUpdated": "2026-04-12T00:00:00Z",
    "updateFrequency": "hourly",
    "version": "1.1"
  },
  "root": { /* Goal-level root task */ },
  "tasks": {
    "M1": { /* milestone */ },
    "I1.1": { /* initiative */ }
  }
}
```

---

## Perfect for Agents

Milestr was designed from the ground up to be agent-friendly:

- **Deterministic CLI** — every action has a clear command, no ambiguity
- **Atomic writes** — every save creates a backup first
- **Activity log** — agents can review their own history of changes
- **No UI required** — agents interact entirely via terminal; humans read the HTML dashboard
- **Zero human intervention** — agents can own and operate their own projects

### Example agent use cases:

- **Strategy Officer agent** tracks M1–M5 milestones toward an ARR goal
- **Engineering agent** tracks features, bug fixes, and deployment readiness
- **Marketing agent** tracks campaigns, content calendars, and lead funnels
- **Research agent** tracks experiments, hypotheses, and findings

---

## Project Structure

```
milestr/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── types.ts          # TypeScript interfaces
│   ├── errors.ts         # Custom error types
│   ├── actions/
│   │   ├── handlers.ts   # Action handlers (create, status, progress...)
│   │   └── utils.ts      # Shared utilities
│   ├── data/
│   │   ├── store.ts      # JSON read/write + validation
│   │   ├── schema.ts     # Zod schema
│   │   ├── backup.ts     # Backup management
│   │   ├── logger.ts     # Activity logging
│   │   ├── config.ts     # Config paths
│   │   └── lock.ts       # File locking
│   └── ui/
│       └── dashboardHtml.ts  # HTML dashboard generator
├── data.json             # Project data (gitignored)
├── sample-data.json      # Example data structure
├── dashboard.html        # Generated HTML dashboard
├── package.json
└── tsconfig.json
```

---

## OpenCLAW Integration

Milestr is designed to run as an agent-owned tool within [OpenCLAW](https://github.com/openclaw/openclaw). Agents call the CLI directly via `exec` calls, passing their agent name for attribution.

Example OpenCLAW agent task file:

```typescript
// Track a milestone
await exec(`npm run dev -- --agent teggy status M1 ongoing`);

// Log progress
await exec(`npm run dev -- --agent teggy progress M1 75`);

// View dashboard
await exec(`open dashboard.html`);
```

---

## License

MIT — use it, fork it, make it yours.

---

*Milestr: Every goal, tracked. Every step, accountable.*
