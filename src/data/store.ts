import fs from 'node:fs/promises';
import { ZodError } from 'zod';
import type { DataPaths, DashboardData, SaveResult } from '../types';
import { DashboardError, ValidationError } from '../errors';
import { createBackup } from './backup';
import { validateDashboardData } from './schema';
import { exportDashboardHtml } from '../ui/dashboardHtml';
import { logChange, logToFile } from './logger';
import { publishDashboard } from './publish';
import { CURRENT_DATA_VERSION, migrateData } from './migrations';
import { healParentRollups } from '../actions/utils';

export async function loadData(paths: DataPaths): Promise<DashboardData> {
  try {
    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const migration = migrateData(JSON.parse(raw));
    let data = validateData(migration.data);

    if (migration.migrated) {
      const backupName = await createBackup(paths);
      // Stamp lastUpdated when we rewrite the file ourselves. Without this the
      // mtime-vs-lastUpdated drift check below immediately flags our own
      // migration write as a MANUAL_EDIT and logs a false alarm on every
      // subsequent load.
      data.meta.lastUpdated = new Date().toISOString();
      await fs.writeFile(paths.dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await logToFile(paths, `MIGRATION: ${migration.fromVersion ?? 'unversioned'} → ${CURRENT_DATA_VERSION} (backup ${backupName})`);
    }

    // Out-of-band edit detector: if data.json's mtime is more than 2 seconds
    // newer than the meta.lastUpdated timestamp, the file was touched after the
    // last CLI write. Log a warning so the agent notices, but do not block
    // loading. The 2-second margin absorbs filesystem timestamp slop on hosts
    // with 1-second mtime resolution (macOS HFS+, some FUSE mounts).
    const stats = await fs.stat(paths.dataFile);
    const lastCliWrite = Date.parse(data.meta.lastUpdated);
    if (!Number.isNaN(lastCliWrite)) {
      const drift = stats.mtime.getTime() - lastCliWrite;
      if (drift > 2000) {
        await logToFile(
          paths,
          `MANUAL_EDIT: data.json was modified after the last CLI write ` +
            `(file mtime ${stats.mtime.toISOString()} vs meta.lastUpdated ${data.meta.lastUpdated}). ` +
            `Drift: ${Math.round(drift / 1000)}s. ` +
            `Use \`milestr\` CLI actions to mutate data.json.`
        );
      }
    }

    // Self-heal: re-derive parent rollups from current child state. This catches
    // drift caused by out-of-band edits to data.json (older agent runtimes
    // without cascadeUpdate, or human edits that bypassed the CLI). Idempotent
    // — a no-op when the file is already consistent.
    const report = healParentRollups(data);
    if (report.fixed.length > 0) {
      const parts: string[] = [];
      for (const id of report.fixed) {
        const t = data.tasks[id];
        if (!t) continue;
        // Reconstruct the old/new narrative by reading the rule that fired.
        // healParentRollups only mutates progress + status, and the log already
        // knows the new value; we just narrate "rolled up to status=…, progress=…".
        parts.push(`parent ${id} → status=${t.status}, progress=${t.progress}`);
      }
      await logToFile(
        paths,
        `HEAL: ${parts.join(' | ')} (was out of sync; auto-reconciled on load)`
      );
    }

    return data;
  } catch (error) {
    if (error instanceof DashboardError) {
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

  data.meta.version = CURRENT_DATA_VERSION;
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
