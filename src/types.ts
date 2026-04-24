export const VALID_STATUSES = ['not_started', 'analyzing', 'ongoing', 'done', 'blocked'] as const;
export const VALID_TYPES = ['goal', 'milestone', 'initiative', 'task'] as const;

export type TaskStatus = (typeof VALID_STATUSES)[number];
export type TaskType = (typeof VALID_TYPES)[number];

export type TrendDirection = 'up' | 'down' | 'neutral';

export interface ActivityLogEntry {
  date: string;
  agent?: string;
  note: string;
}

export interface Task {
  id: string;
  title: string;
  subtitle?: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  dueDate: string | null;
  icon: string;
  parent: string | null;
  children: string[];
  activityLog: ActivityLogEntry[];
}

export interface KPI {
  id: string;
  title: string;
  value: string | number;
  unit?: string;
  trend?: TrendDirection;
  source?: string;
  icon: string;
  lastUpdated: string;
}

export interface DashboardMeta {
  lastUpdated: string;
  updateFrequency?: string;
  version?: string;
}

export interface DashboardRoot {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  dueDate: string | null;
  icon: string;
  parent: null;
  children: string[];
}

export interface DashboardData {
  meta: DashboardMeta;
  root: DashboardRoot;
  tasks: Record<string, Task>;
  kpis?: Record<string, KPI>;
}

export interface ParsedArgs {
  _: string[];
  [key: string]: string | boolean | string[];
}

export interface DataPaths {
  dashboardDir: string;
  dataFile: string;
  backupDir: string;
  lockFile: string;
  logFile: string;
  htmlFile: string;
  siteDir: string;
  siteIndexFile: string;
  cloudflareConfigFile: string;
}

export interface ActionContext {
  agent: string;
  paths: DataPaths;
}

export interface Metrics {
  total: number;
  byStatus: Partial<Record<TaskStatus, number>>;
  byType: Partial<Record<TaskType, number>>;
  completed: number;
}

export interface CloudflarePublishConfig {
  projectName: string;
}

export interface SaveResult {
  publishedUrl: string | null;
}
