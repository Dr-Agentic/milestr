import { z } from 'zod';
import type { DashboardData } from '../types';
import { VALID_STATUSES, VALID_TYPES } from '../types';

const activityLogEntrySchema = z.object({
  date: z.string(),
  agent: z.string().optional(),
  note: z.string()
});

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  type: z.enum(VALID_TYPES),
  status: z.enum(VALID_STATUSES),
  progress: z.number().int().min(0).max(100),
  dueDate: z.string().nullable(),
  icon: z.string(),
  parent: z.string().nullable(),
  children: z.array(z.string()),
  activityLog: z.array(activityLogEntrySchema)
});

const rootSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(VALID_TYPES),
  status: z.enum(VALID_STATUSES),
  dueDate: z.string().nullable(),
  icon: z.string(),
  parent: z.null(),
  children: z.array(z.string())
});

const kpiSchema = z.object({
  id: z.string(),
  title: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
  source: z.string().optional(),
  icon: z.string(),
  lastUpdated: z.string()
});

export const dashboardDataSchema = z.object({
  meta: z.object({
    lastUpdated: z.string(),
    updateFrequency: z.string().optional(),
    version: z.string().optional()
  }),
  root: rootSchema,
  tasks: z.record(taskSchema),
  kpis: z.record(kpiSchema).optional()
});

export function validateDashboardData(data: unknown): DashboardData {
  return dashboardDataSchema.parse(data);
}
