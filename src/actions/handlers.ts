import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionContext, DashboardData, KPI, Metrics, ParsedArgs, Task, TaskStatus, TaskType, TrendDirection } from '../types';
import { VALID_STATUSES } from '../types';
import { CliError, ConflictError } from '../errors';
import { createBackup, listBackups, restoreBackup } from '../data/backup';
import { log } from '../data/logger';
import { loadData, saveData, validateData } from '../data/store';
import { exportDashboardHtml } from '../ui/dashboardHtml';
import { addActivityLog, cascadeUpdate, getTaskOrThrow, recalculateProgress, updateParentStatus } from './utils';

export type ActionHandler = (ctx: ActionContext, args: ParsedArgs) => Promise<void>;

function ensureType(type: string): TaskType {
  if (type === 'goal' || type === 'milestone' || type === 'initiative' || type === 'task') {
    return type;
  }
  throw new CliError('Invalid type: ' + type);
}

function ensureStatus(status: string): TaskStatus {
  if (VALID_STATUSES.includes(status as TaskStatus)) {
    return status as TaskStatus;
  }
  throw new CliError('Invalid status: ' + status + '. Valid: ' + VALID_STATUSES.join(', '));
}

function parseProgress(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    throw new CliError('Progress must be 0-100');
  }
  return parsed;
}

function taskIcon(task: Task): string {
  return task.icon || '📋';
}

export const actionCreate: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const id = typeof args.id === 'string' ? args.id : undefined;
  const title = typeof args.title === 'string' ? args.title : undefined;
  const type = typeof args.type === 'string' ? ensureType(args.type) : 'task';
  const parent = typeof args.parent === 'string' ? args.parent : undefined;
  const due = typeof args.due === 'string' ? args.due : null;
  const icon = typeof args.icon === 'string' ? args.icon : '📋';

  if (!id || !title) {
    throw new CliError('create requires --id and --title');
  }
  if (data.tasks[id]) {
    throw new ConflictError('Task already exists: ' + id);
  }
  if (parent && !data.tasks[parent]) {
    throw new CliError('Parent task not found: ' + parent);
  }

  data.tasks[id] = {
    id,
    title,
    subtitle: '',
    type,
    status: 'not_started',
    progress: 0,
    dueDate: due,
    icon,
    parent: parent ?? null,
    children: [],
    activityLog: [{
      date: new Date().toISOString(),
      agent: ctx.agent,
      note: 'Task created'
    }]
  };

  if (parent) {
    const parentTask = getTaskOrThrow(data, parent);
    if (!parentTask.children.includes(id)) {
      parentTask.children.push(id);
    }
    cascadeUpdate(data, parent);
  }

  await saveData(ctx.paths, data, ctx.agent, 'create task ' + id + ': ' + title);
  log('Created task: ' + id + ' (' + title + ')');
};

export const actionStatus: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id, rawStatus, ...noteParts] = args._;

  if (!id || !rawStatus) {
    throw new CliError('status requires <id> <status> [note]');
  }

  const status = ensureStatus(rawStatus);
  const task = getTaskOrThrow(data, id);
  const oldStatus = task.status;
  task.status = status;

  if (status === 'done') {
    task.progress = 100;
  } else if (status === 'not_started') {
    task.progress = 0;
  }

  const note = noteParts.join(' ').trim();
  if (note) {
    addActivityLog(data, id, note, ctx.agent);
  }
  addActivityLog(data, id, 'Status: ' + oldStatus + ' → ' + status + (note ? ' (' + note + ')' : ''), ctx.agent);

  updateParentStatus(data, id);
  cascadeUpdate(data, id);

  await saveData(ctx.paths, data, ctx.agent, 'status ' + id + ': ' + oldStatus + ' → ' + status);
  log('Updated ' + id + ': ' + oldStatus + ' → ' + status);
};

export const actionProgress: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id, rawProgress] = args._;

  if (!id || rawProgress === undefined) {
    throw new CliError('progress requires <id> <percentage>');
  }

  const task = getTaskOrThrow(data, id);
  const oldProgress = task.progress;
  const pct = parseProgress(rawProgress);
  task.progress = pct;

  if (pct === 100) {
    task.status = 'done';
  } else if (pct > 0) {
    task.status = 'ongoing';
  }

  addActivityLog(data, id, 'Progress: ' + oldProgress + '% → ' + pct + '%', ctx.agent);

  updateParentStatus(data, id);
  cascadeUpdate(data, id);

  await saveData(ctx.paths, data, ctx.agent, 'progress ' + id + ': ' + oldProgress + '% → ' + pct + '%');
  log('Updated ' + id + ': ' + oldProgress + '% → ' + pct + '%');
};

export const actionTitle: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id, ...titleParts] = args._;
  const title = titleParts.join(' ').trim();

  if (!id || !title) {
    throw new CliError('title requires <id> <new title>');
  }

  const task = getTaskOrThrow(data, id);
  const oldTitle = task.title;
  task.title = title;

  addActivityLog(data, id, 'Title changed: "' + oldTitle + '" → "' + title + '"', ctx.agent);
  await saveData(ctx.paths, data, ctx.agent, 'title ' + id + ': "' + oldTitle + '" → "' + title + '"');
  log('Updated ' + id + ' title');
};

export const actionDue: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id, due] = args._;

  if (!id || !due) {
    throw new CliError('due requires <id> <YYYY-MM-DD>');
  }

  const task = getTaskOrThrow(data, id);
  const oldDue = task.dueDate;
  task.dueDate = due;

  addActivityLog(data, id, 'Due date: ' + (oldDue ?? 'none') + ' → ' + due, ctx.agent);
  await saveData(ctx.paths, data, ctx.agent, 'due ' + id + ': ' + (oldDue ?? 'none') + ' → ' + due);
  log('Updated ' + id + ' due date: ' + due);
};

export const actionDelete: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;

  if (!id) {
    throw new CliError('delete requires <id>');
  }
  if (id === 'ROOT') {
    throw new CliError('Cannot delete ROOT');
  }

  const task = getTaskOrThrow(data, id);
  if (task.children.length > 0) {
    throw new CliError('Cannot delete ' + id + ': has children. Delete children first.');
  }

  const parentId = task.parent;
  if (parentId && data.tasks[parentId]) {
    data.tasks[parentId].children = data.tasks[parentId].children.filter((childId) => childId !== id);
  }

  delete data.tasks[id];
  if (parentId) {
    cascadeUpdate(data, parentId);
  }

  await saveData(ctx.paths, data, ctx.agent, 'delete task ' + id);
  log('Deleted task: ' + id);
};

export const actionRecalc: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;

  if (!id) {
    throw new CliError('recalc requires <id>');
  }

  recalculateProgress(data, id);
  cascadeUpdate(data, id);

  await saveData(ctx.paths, data, ctx.agent, 'recalc ' + id);
  log('Recalculated ' + id);
};

export const actionView: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;

  if (!id) {
    throw new CliError('view requires <id>');
  }

  const task = getTaskOrThrow(data, id);
  console.log('\n' + JSON.stringify(task, null, 2));
};

export const actionList: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const type = typeof args.type === 'string' ? args.type : undefined;
  const status = typeof args.status === 'string' ? args.status : undefined;
  const parent = typeof args.parent === 'string' ? args.parent : undefined;

  let tasks = Object.values(data.tasks);
  if (type) {
    tasks = tasks.filter((task) => task.type === type);
  }
  if (status) {
    tasks = tasks.filter((task) => task.status === status);
  }
  if (parent) {
    tasks = tasks.filter((task) => task.parent === parent);
  }

  console.log('\nFound ' + tasks.length + ' tasks:\n');
  for (const task of tasks) {
    console.log('  ' + taskIcon(task) + ' ' + task.id + ' | ' + task.status.padEnd(12) + ' | ' + String(task.progress).padStart(3) + '% | ' + task.title);
  }
  console.log('');
};

export const actionBackup: ActionHandler = async (ctx) => {
  await loadData(ctx.paths);
  const name = await createBackup(ctx.paths);
  log('Backup complete: ' + name);
};

export const actionRestore: ActionHandler = async (ctx, args) => {
  const [timestamp] = args._;
  if (!timestamp) {
    throw new CliError('restore requires <timestamp> (e.g., 2026-02-21-15-30-00)');
  }

  let restored: DashboardData;
  try {
    restored = await restoreBackup(ctx.paths, timestamp);
  } catch (error) {
    throw new CliError('Backup not found or unreadable: ' + timestamp + ' (' + (error as Error).message + ')');
  }

  validateData(restored);
  const html = exportDashboardHtml(restored);
  await fs.writeFile(ctx.paths.htmlFile, html, 'utf8');
  log('Restored from backup: ' + timestamp);
};

export const actionListBackups: ActionHandler = async (ctx) => {
  const backups = await listBackups(ctx.paths);
  if (backups.length === 0) {
    console.log('No backups yet');
    return;
  }

  console.log('\nAvailable backups:\n');
  for (const backup of backups) {
    console.log('  ' + backup.id + '  ' + backup.mtime);
  }
  console.log('');
};

export const actionMetrics: ActionHandler = async (ctx) => {
  const data = await loadData(ctx.paths);
  const metrics: Metrics = {
    total: Object.keys(data.tasks).length,
    byStatus: {},
    byType: {},
    completed: 0
  };

  for (const task of Object.values(data.tasks)) {
    metrics.byStatus[task.status] = (metrics.byStatus[task.status] ?? 0) + 1;
    metrics.byType[task.type] = (metrics.byType[task.type] ?? 0) + 1;
    if (task.status === 'done') {
      metrics.completed += 1;
    }
  }

  console.log('\n📊 Dashboard Metrics:\n');
  console.log('  Total tasks: ' + metrics.total);
  console.log('  Completed: ' + metrics.completed);
  console.log('  \n  By Status:');
  for (const [status, count] of Object.entries(metrics.byStatus)) {
    console.log('    ' + status + ': ' + count);
  }
  console.log('  \n  By Type:');
  for (const [type, count] of Object.entries(metrics.byType)) {
    console.log('    ' + type + ': ' + count);
  }
  if (data.kpis) {
    console.log('\n  KPIs: ' + Object.keys(data.kpis).length);
  }
  console.log('');
};

export const actionExport: ActionHandler = async (ctx) => {
  const data = await loadData(ctx.paths);
  const html = exportDashboardHtml(data);
  await fs.writeFile(path.join(ctx.paths.dashboardDir, 'dashboard.html'), html, 'utf8');
  log('Exported dashboard.html');
};

// --- KPI Actions ---

export const actionCreateKpi: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const id = typeof args.id === 'string' ? args.id : undefined;
  const title = typeof args.title === 'string' ? args.title : undefined;
  const rawValue = args.value;
  const value: string | number = typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : '0';
  const unit = typeof args.unit === 'string' ? args.unit : undefined;
  const trend = typeof args.trend === 'string' ? args.trend as TrendDirection : undefined;
  const source = typeof args.source === 'string' ? args.source : undefined;
  const icon = typeof args.icon === 'string' ? args.icon : '📊';

  if (!id || !title) {
    throw new CliError('create-kpi requires --id and --title');
  }

  if (!data.kpis) {
    data.kpis = {};
  }
  if (data.kpis[id]) {
    throw new ConflictError('KPI already exists: ' + id);
  }

  data.kpis[id] = {
    id,
    title,
    value,
    unit,
    trend,
    source,
    icon,
    lastUpdated: new Date().toISOString()
  };

  await saveData(ctx.paths, data, ctx.agent, 'create KPI ' + id + ': ' + title + ' = ' + value + (unit ? ' ' + unit : ''));
  log('Created KPI: ' + id + ' (' + title + ')');
};

export const actionUpdateKpi: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const id = typeof args.id === 'string' ? args.id : undefined;
  const rawValue = args.value;
  const value: string | number | undefined = typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : undefined;
  const unit = typeof args.unit === 'string' ? args.unit : undefined;
  const trend = typeof args.trend === 'string' ? args.trend as TrendDirection : undefined;
  const source = typeof args.source === 'string' ? args.source : undefined;
  const icon = typeof args.icon === 'string' ? args.icon : undefined;

  if (!id) {
    throw new CliError('update-kpi requires --id');
  }

  if (!data.kpis || !data.kpis[id]) {
    throw new CliError('KPI not found: ' + id);
  }

  const kpi = data.kpis[id];
  const oldValue = kpi.value;

  if (value !== undefined) kpi.value = value;
  if (unit !== undefined) kpi.unit = unit;
  if (trend !== undefined) kpi.trend = trend;
  if (source !== undefined) kpi.source = source;
  if (icon !== undefined) kpi.icon = icon;
  kpi.lastUpdated = new Date().toISOString();

  await saveData(ctx.paths, data, ctx.agent, 'update KPI ' + id + ': ' + oldValue + ' → ' + kpi.value);
  log('Updated KPI ' + id + ': ' + oldValue + ' → ' + kpi.value);
};

export const actionListKpis: ActionHandler = async (ctx) => {
  const data = await loadData(ctx.paths);
  const kpis = data.kpis ? Object.values(data.kpis) : [];

  console.log('\nFound ' + kpis.length + ' KPIs:\n');
  for (const kpi of kpis) {
    const trend = kpi.trend ? ' (' + (kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→') + ')' : '';
    const source = kpi.source ? ' [' + kpi.source + ']' : '';
    console.log('  ' + kpi.icon + ' ' + kpi.id + ' | ' + kpi.value + (kpi.unit ? ' ' + kpi.unit : '') + trend + ' | ' + kpi.title + source);
  }
  console.log('');
};

export const ACTIONS: Record<string, ActionHandler> = {
  create: actionCreate,
  status: actionStatus,
  progress: actionProgress,
  title: actionTitle,
  due: actionDue,
  delete: actionDelete,
  recalc: actionRecalc,
  recalculate: actionRecalc,
  view: actionView,
  list: actionList,
  backup: actionBackup,
  restore: actionRestore,
  backups: actionListBackups,
  metrics: actionMetrics,
  export: actionExport,
  'create-kpi': actionCreateKpi,
  'update-kpi': actionUpdateKpi,
  'list-kpis': actionListKpis
};
