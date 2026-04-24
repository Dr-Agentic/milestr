import fs from 'node:fs/promises';
import path from 'node:path';
import type { DataPaths, DashboardData } from '../types';

export function backupTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export async function createBackup(paths: DataPaths, limit: number = 10): Promise<string> {
  await fs.mkdir(paths.backupDir, { recursive: true });

  const fileName = `data-${backupTimestamp()}.json`;
  const backupFile = path.join(paths.backupDir, fileName);
  await fs.copyFile(paths.dataFile, backupFile);

  const backups = (await fs.readdir(paths.backupDir))
    .filter((name) => name.startsWith('data-') && name.endsWith('.json'))
    .sort()
    .reverse();

  for (const stale of backups.slice(limit)) {
    await fs.unlink(path.join(paths.backupDir, stale));
  }

  return fileName;
}

export async function listBackups(paths: DataPaths): Promise<Array<{ id: string; mtime: string }>> {
  try {
    const entries = (await fs.readdir(paths.backupDir))
      .filter((name) => name.startsWith('data-') && name.endsWith('.json'))
      .sort()
      .reverse();

    const result: Array<{ id: string; mtime: string }> = [];
    for (const name of entries) {
      const stats = await fs.stat(path.join(paths.backupDir, name));
      result.push({
        id: name.replace('data-', '').replace('.json', ''),
        mtime: stats.mtime.toISOString().replace('T', ' ').slice(0, 19)
      });
    }
    return result;
  } catch {
    return [];
  }
}

export async function restoreBackup(paths: DataPaths, timestamp: string): Promise<DashboardData> {
  const targetBackup = path.join(paths.backupDir, `data-${timestamp}.json`);
  const rawBackup = await fs.readFile(targetBackup, 'utf8');

  const currentRaw = await fs.readFile(paths.dataFile, 'utf8');
  const emergencyName = `data-pre-restore-${backupTimestamp()}.json`;
  await fs.writeFile(path.join(paths.backupDir, emergencyName), currentRaw, 'utf8');

  await fs.writeFile(paths.dataFile, rawBackup, 'utf8');
  return JSON.parse(rawBackup) as DashboardData;
}
