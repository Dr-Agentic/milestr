#!/usr/bin/env node

import { ACTIONS } from './actions/handlers';
import { resolvePaths } from './data/config';
import { FileLock } from './data/lock';
import { logCalled } from './data/logger';
import { CliError, DashboardError } from './errors';
import type { ParsedArgs } from './types';

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { _: [] };
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
      continue;
    }

    args._.push(arg);
    i += 1;
  }

  return args;
}

function printHelp(): void {
  console.log([
    '',
    'Milestr Dashboard Manager (TypeScript)',
    '',
    'Usage: npm run dev -- --agent <name> <action> [options]',
    '',
    'REQUIRED: --agent <name>   Track who is executing the command',
    '                         (e.g., --agent planner, --agent builder, --agent operator)',
    '',
    'Task Actions:',
    '  create --id <id> --title <title> [--type task|initiative|milestone|goal] [--parent <id>] [--due YYYY-MM-DD] [--icon emoji]',
    '  status <id> <status> [note]           Status: not_started, analyzing, ongoing, done, blocked',
    '  progress <id> <0-100>                  Set progress percentage',
    '  title <id> <new title>                 Rename task',
    '  due <id> <YYYY-MM-DD>                  Set due date',
    '  delete <id>                            Delete task (no children allowed)',
    '  recalc <id>                            Recalculate parent progress from children',
    '  view <id>                              Show task details',
    '  list [--type type] [--status status]   List tasks with filters',
    '',
    'KPI Actions:',
    '  create-kpi --id <id> --title <title> [--value <val>] [--unit <unit>] [--trend up|down|neutral] [--source <src>] [--icon emoji]',
    '  update-kpi --id <id> [--value <val>] [--unit <unit>] [--trend up|down|neutral] [--source <src>]',
    '  list-kpis                              List all KPIs',
    '',
    'Dashboard Actions:',
    '  backup                                 Create backup',
    '  restore <timestamp>                    Restore from backup',
    '  backups                                List available backups',
    '  metrics                                Show dashboard statistics',
    '  export                                 Export HTML dashboard (KPIs/Timeline/Kanban/List views)',
    '  publish                                Publish the static dashboard to Cloudflare Pages',
    '',
    'Examples:',
    '  npm run dev -- --agent planner status I1.2 ongoing "Working on it"',
    '  npm run dev -- --agent builder create --id I1.4 --title "New Feature" --type initiative --parent M1',
    '  npm run dev -- --agent operator create-kpi --id kpi-signups --title "Weekly Sign-ups" --value 0 --unit users --source "Product analytics" --icon "people"',
    '  npm run dev -- --agent operator update-kpi --id kpi-signups --value 12 --trend up',
    '  npm run dev -- --agent operator list-kpis',
    ''
  ].join('\n'));
}

export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [action, ...rest] = args._;
  const agent = typeof args.agent === 'string' ? args.agent : 'unknown';
  const paths = resolvePaths();

  if (!args.agent && action !== 'help' && action !== undefined) {
    throw new CliError('--agent is required (e.g., --agent planner, --agent builder, --agent operator)');
  }

  await logCalled(paths, agent, action, args);

  if (!action || action === 'help') {
    printHelp();
    return 0;
  }

  const handler = ACTIONS[action];
  if (!handler) {
    throw new CliError('Unknown action: ' + action);
  }

  args._ = rest;
  const lock = new FileLock(paths.lockFile);

  try {
    await lock.acquire();
    await handler({ agent, paths }, args);
    return 0;
  } finally {
    await lock.release();
  }
}

async function main(): Promise<void> {
  try {
    const exitCode = await run(process.argv.slice(2));
    process.exit(exitCode);
  } catch (error) {
    const message = error instanceof DashboardError ? error.message : (error as Error).message;
    console.error('[dashboard] ERROR: ' + message);
    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
