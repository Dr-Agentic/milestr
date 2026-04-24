import fs from 'node:fs/promises';
import { ZodError } from 'zod';
import type { DataPaths, DashboardData, SaveResult } from '../types';
import { ValidationError } from '../errors';
import { createBackup } from './backup';
import { validateDashboardData } from './schema';
import { exportDashboardHtml } from '../ui/dashboardHtml';
import { logChange, logToFile } from './logger';
import { publishDashboard } from './publish';

export async function loadData(paths: DataPaths): Promise<DashboardData> {
  try {
    const raw = await fs.readFile(paths.dataFile, 'utf8');
    return validateData(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Failed to load data.json: ${(error as Error).message}`);
  }
}

export function validateData(data: unknown): DashboardData {
  try {
    return validateDashboardData(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError(`Invalid data: ${error.issues[0]?.message ?? 'schema mismatch'}`);
    }
    throw error;
  }
}

export async function saveStaticSite(paths: DataPaths, data: DashboardData): Promise<void> {
  const html = exportDashboardHtml(data);
  await fs.mkdir(paths.siteDir, { recursive: true });
  await fs.writeFile(paths.htmlFile, html, 'utf8');
  await fs.writeFile(paths.siteIndexFile, html, 'utf8');
}

export async function saveData(paths: DataPaths, data: DashboardData, agent: string, changeNote?: string): Promise<SaveResult> {
  const backupName = await createBackup(paths);
  await logToFile(paths, `INFO: backup created ${backupName}`);

  data.meta.lastUpdated = new Date().toISOString();
  validateData(data);

  await fs.writeFile(paths.dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  if (changeNote) {
    await logChange(paths, agent, changeNote);
  }

  await saveStaticSite(paths, data);
  const publishedUrl = await publishDashboard(paths, data);
  return { publishedUrl };
}
