import fs from 'node:fs/promises';
import path from 'node:path';
import type { ActionContext, DataPaths, DashboardData, KPI, Metrics, ParsedArgs, Task, TaskStatus, TaskType, TrendDirection } from '../types';
import { VALID_STATUSES } from '../types';
import { CliError, ConflictError } from '../errors';
import { createBackup, listBackups, restoreBackup } from '../data/backup';
import { log } from '../data/logger';
import { loadData, saveData, saveStaticSite, validateData } from '../data/store';
import { CURRENT_DATA_VERSION } from '../data/migrations';
import { publishDashboard } from '../data/publish';
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

function logPublishedUrl(publishedUrl: string | null): void {
  if (publishedUrl) {
    log('Published: ' + publishedUrl);
    console.log(publishedUrl);
  }
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

  const result = await saveData(ctx.paths, data, ctx.agent, 'create task ' + id + ': ' + title);
  log('Created task: ' + id + ' (' + title + ')');
  logPublishedUrl(result.publishedUrl);
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

  const result = await saveData(ctx.paths, data, ctx.agent, 'status ' + id + ': ' + oldStatus + ' → ' + status);
  log('Updated ' + id + ': ' + oldStatus + ' → ' + status);
  logPublishedUrl(result.publishedUrl);
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

  const result = await saveData(ctx.paths, data, ctx.agent, 'progress ' + id + ': ' + oldProgress + '% → ' + pct + '%');
  log('Updated ' + id + ': ' + oldProgress + '% → ' + pct + '%');
  logPublishedUrl(result.publishedUrl);
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

  if (id === 'ROOT') {
    data.root.title = title;
  }

  addActivityLog(data, id, 'Title changed: "' + oldTitle + '" → "' + title + '"', ctx.agent);
  const result = await saveData(ctx.paths, data, ctx.agent, 'title ' + id + ': "' + oldTitle + '" → "' + title + '"');
  log('Updated ' + id + ' title');
  logPublishedUrl(result.publishedUrl);
};

/**
 * Allowed fields for `update --field <name> --value <v>`.
 * Keeps the schema-strip invariant intact: unknown fields are still rejected.
 * Add a field here only if it appears in taskSchema / kpiSchema in src/data/schema.ts.
 */
const ALLOWED_TASK_FIELDS = new Set([
  'title', 'subtitle', 'icon', 'dueDate'
]);

const ALLOWED_KPI_FIELDS = new Set([
  'title', 'unit', 'source', 'icon'
]);

export const actionUpdate: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;
  const field = typeof args.field === 'string' ? args.field : undefined;
  const value = typeof args.value === 'string' ? args.value : undefined;

  if (!id || !field) {
    throw new CliError('update requires <id> --field <name> [--value <v>]');
  }

  // Determine whether the id resolves to a task or a KPI. Tasks and KPIs share
  // the id namespace, but only one of them will be present at a time.
  const isTask = !!data.tasks[id];
  const isKpi = !isTask && !!data.kpis && !!data.kpis[id];

  if (!isTask && !isKpi) {
    throw new CliError('update: ' + id + ' not found in tasks or kpis');
  }

  const allowlist = isTask ? ALLOWED_TASK_FIELDS : ALLOWED_KPI_FIELDS;
  if (!allowlist.has(field)) {
    const allowed = Array.from(allowlist).join(', ');
    throw new CliError(
      'update: field "' + field + '" not in allowlist for ' +
      (isTask ? 'tasks' : 'kpis') + '. Allowed: ' + allowed +
      '. For status / progress / title use the dedicated actions; this command is for optional fields only.'
    );
  }

  const target: Record<string, unknown> = isTask ? data.tasks[id] as unknown as Record<string, unknown> : data.kpis![id] as unknown as Record<string, unknown>;
  const oldValue = target[field];

  if (value === undefined) {
    // No --value: report current value, do not mutate.
    log(id + '.' + field + ' = ' + JSON.stringify(oldValue));
    return;
  }

  // Coerce empty string to null for date fields (mirrors how dueDate is nullable in schema).
  const newValue: unknown = (field === 'dueDate' && value === '') ? null : value;
  target[field] = newValue;

  if (isTask) {
    addActivityLog(data, id, 'Field "' + field + '" updated: ' + JSON.stringify(oldValue) + ' → ' + JSON.stringify(newValue), ctx.agent);
  }

  const result = await saveData(
    ctx.paths, data, ctx.agent,
    'update ' + id + '.' + field + ': ' + JSON.stringify(oldValue) + ' → ' + JSON.stringify(newValue)
  );
  log('Updated ' + id + '.' + field);
  logPublishedUrl(result.publishedUrl);
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
  const result = await saveData(ctx.paths, data, ctx.agent, 'due ' + id + ': ' + (oldDue ?? 'none') + ' → ' + due);
  log('Updated ' + id + ' due date: ' + due);
  logPublishedUrl(result.publishedUrl);
};

export const actionLog: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id, ...noteParts] = args._;
  const note = noteParts.join(' ').trim();

  if (!id || !note) {
    throw new CliError('log requires <id> "<message>"');
  }

  const task = getTaskOrThrow(data, id);
  if (!task.activityLog) {
    task.activityLog = [];
  }
  addActivityLog(data, id, note, ctx.agent);

  const result = await saveData(ctx.paths, data, ctx.agent, 'log ' + id);
  log('Logged action on ' + id);
  logPublishedUrl(result.publishedUrl);
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

  const result = await saveData(ctx.paths, data, ctx.agent, 'delete task ' + id);
  log('Deleted task: ' + id);
  logPublishedUrl(result.publishedUrl);
};

export const actionRecalc: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;

  if (!id) {
    throw new CliError('recalc requires <id>');
  }

  recalculateProgress(data, id);
  cascadeUpdate(data, id);

  const result = await saveData(ctx.paths, data, ctx.agent, 'recalc ' + id);
  log('Recalculated ' + id);
  logPublishedUrl(result.publishedUrl);
};

function isJsonMode(args: ParsedArgs): boolean {
  return args.json === true || args.json === 'true';
}

export const actionView: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const [id] = args._;

  if (!id) {
    throw new CliError('view requires <id>');
  }

  const task = getTaskOrThrow(data, id);

  if (isJsonMode(args)) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

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

  if (isJsonMode(args)) {
    const json = tasks.map((task) => ({
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      title: task.title,
      parent: task.parent,
      icon: task.icon
    }));
    console.log(JSON.stringify(json, null, 2));
    return;
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

  // Re-load through the normal data path so restoring an older backup also
  // receives the same automatic migration as every other CLI command.
  restored = await loadData(ctx.paths);
  await saveStaticSite(ctx.paths, restored);
  const publishedUrl = await publishDashboard(ctx.paths, restored);
  log('Restored from backup: ' + timestamp);
  logPublishedUrl(publishedUrl);
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

export const actionMetrics: ActionHandler = async (ctx, args) => {
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

  if (data.kpis) {
    metrics.kpis = Object.keys(data.kpis).length;
  }

  if (isJsonMode(args)) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
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
  if (metrics.kpis !== undefined) {
    console.log('\n  KPIs: ' + metrics.kpis);
  }
  console.log('');
};

export const actionExport: ActionHandler = async (ctx) => {
  const data = await loadData(ctx.paths);
  await saveStaticSite(ctx.paths, data);
  log('Exported dashboard.html');
};

export const actionPublish: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  await saveStaticSite(ctx.paths, data);
  const overrideProject = typeof args.project === 'string' && args.project ? args.project : null;
  const publishedUrl = overrideProject
    ? await publishDashboard(ctx.paths, data, { project: overrideProject })
    : await publishDashboard(ctx.paths, data);
  logPublishedUrl(publishedUrl);
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

  const kpi: KPI = {
    id,
    title,
    value,
    icon,
    lastUpdated: new Date().toISOString()
  };

  if (unit !== undefined) kpi.unit = unit;
  if (trend !== undefined) kpi.trend = trend;
  if (source !== undefined) kpi.source = source;

  data.kpis[id] = kpi;

  const result = await saveData(ctx.paths, data, ctx.agent, 'create KPI ' + id + ': ' + title + ' = ' + value + (unit ? ' ' + unit : ''));
  log('Created KPI: ' + id + ' (' + title + ')');
  logPublishedUrl(result.publishedUrl);
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

  const result = await saveData(ctx.paths, data, ctx.agent, 'update KPI ' + id + ': ' + oldValue + ' → ' + kpi.value);
  log('Updated KPI ' + id + ': ' + oldValue + ' → ' + kpi.value);
  logPublishedUrl(result.publishedUrl);
};

export const actionListKpis: ActionHandler = async (ctx, args) => {
  const data = await loadData(ctx.paths);
  const kpis = data.kpis ? Object.values(data.kpis) : [];

  if (isJsonMode(args)) {
    const json = kpis.map((kpi) => ({
      id: kpi.id,
      title: kpi.title,
      value: kpi.value,
      unit: kpi.unit,
      trend: kpi.trend,
      source: kpi.source,
      icon: kpi.icon,
      lastUpdated: kpi.lastUpdated
    }));
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  console.log('\nFound ' + kpis.length + ' KPIs:\n');
  for (const kpi of kpis) {
    const trend = kpi.trend ? ' (' + (kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→') + ')' : '';
    const source = kpi.source ? ' [' + kpi.source + ']' : '';
    console.log('  ' + kpi.icon + ' ' + kpi.id + ' | ' + kpi.value + (kpi.unit ? ' ' + kpi.unit : '') + trend + ' | ' + kpi.title + source);
  }
  console.log('');
};

export const actionInit: ActionHandler = async (ctx, args) => {
  const id = typeof args.id === 'string' ? args.id : 'ROOT';
  const title = typeof args.title === 'string' ? args.title : 'My Dashboard';
  const icon = typeof args.icon === 'string' ? args.icon : '🎯';
  const force = args.force === true;
  const minimal = args.minimal === true;
  const seedPath = typeof args.seed === 'string' ? args.seed : null;
  const explicitFile = typeof args['data-file'] === 'string' ? args['data-file'] : null;
  const jsonMode = args.json === true || args.json === 'true';
  const targetPath = explicitFile
    ? path.resolve(explicitFile)
    : ctx.paths.dataFile;

  if (await dataExists(targetPath) && !force) {
    throw new ConflictError(
      `data.json already exists at ${targetPath}. ` +
      `Remove it first, or re-run with --force, or use --data <dir> to initialize a different directory.`
    );
  }

  const now = new Date().toISOString();
  let data: DashboardData;

  if (seedPath && !minimal) {
    const raw = await fs.readFile(seedPath, 'utf8');
    const parsed = JSON.parse(raw);
    data = validateData(parsed);
    data.meta = {
      lastUpdated: now,
      updateFrequency: data.meta?.updateFrequency ?? 'hourly',
      version: CURRENT_DATA_VERSION
    };
  } else {
    data = {
      meta: {
        lastUpdated: now,
        updateFrequency: 'hourly',
        version: CURRENT_DATA_VERSION
      },
      root: { id, title, type: 'goal', status: 'ongoing', dueDate: null, icon, parent: null, children: [] },
      tasks: {
        [id]: {
          id, title,
          subtitle: 'Initialized with milestr init',
          type: 'goal', status: 'ongoing', progress: 0,
          dueDate: null, icon, parent: null, children: [], activityLog: []
        }
      },
      kpis: {}
    };
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await saveStaticSite(ctx.paths, data);
  const publishedUrl = await publishDashboard(ctx.paths, data);

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    log('Initialized: ' + targetPath);
    if (publishedUrl) log('Dashboard: ' + publishedUrl);
  }
};

async function dataExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export const ACTIONS: Record<string, ActionHandler> = {
  create: actionCreate,
  status: actionStatus,
  progress: actionProgress,
  title: actionTitle,
  due: actionDue,
  log: actionLog,
  delete: actionDelete,
  recalc: actionRecalc,
  recalculate: actionRecalc,
  view: actionView,
  list: actionList,
  update: actionUpdate,
  backup: actionBackup,
  restore: actionRestore,
  backups: actionListBackups,
  metrics: actionMetrics,
  export: actionExport,
  publish: actionPublish,
  'create-kpi': actionCreateKpi,
  'update-kpi': actionUpdateKpi,
  'list-kpis': actionListKpis,
  init: actionInit
};
