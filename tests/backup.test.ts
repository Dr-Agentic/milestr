import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupTimestamp, createBackup, listBackups, restoreBackup } from '../src/data/backup';
import { createSampleData, createTempPaths, readJson, writeData } from './helpers';

describe('backup helpers', () => {
  it('formats timestamps for filenames', () => {
    expect(backupTimestamp(new Date('2026-04-24T06:00:01.123Z'))).toBe('2026-04-24T06-00-01-123Z');
  });

  it('creates and trims backups', async () => {
    const paths = await createTempPaths();
    await writeData(paths);

    const names: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      names.push(await createBackup(paths, 2));
      await fs.writeFile(paths.dataFile, JSON.stringify({ index: i }), 'utf8');
    }

    const files = (await fs.readdir(paths.backupDir)).filter((name) => name.endsWith('.json')).sort();
    expect(names).toHaveLength(4);
    expect(files).toHaveLength(2);
  });

  it('lists backups and returns empty when the directory is missing', async () => {
    const emptyPaths = await createTempPaths();
    await expect(listBackups(emptyPaths)).resolves.toEqual([]);

    const paths = await createTempPaths();
    await writeData(paths);
    const fileName = await createBackup(paths);

    const backups = await listBackups(paths);
    expect(backups).toHaveLength(1);
    expect(backups[0]?.id).toBe(fileName.replace('data-', '').replace('.json', ''));
  });

  it('restores a backup and preserves the previous data as an emergency copy', async () => {
    const paths = await createTempPaths();
    const original = await writeData(paths);
    await createBackup(paths);

    const replacement = createSampleData();
    replacement.tasks.I1.title = 'Changed';
    await fs.writeFile(paths.dataFile, `${JSON.stringify(replacement, null, 2)}\n`, 'utf8');

    const [{ id }] = await listBackups(paths);
    const restored = await restoreBackup(paths, id);

    expect(restored.tasks.I1.title).toBe(original.tasks.I1.title);
    expect((await readJson<typeof original>(paths.dataFile)).tasks.I1.title).toBe(original.tasks.I1.title);

    const files = await fs.readdir(paths.backupDir);
    expect(files.some((name) => name.startsWith('data-pre-restore-'))).toBe(true);
    expect(await fs.readFile(path.join(paths.backupDir, files.find((name) => name.startsWith('data-pre-restore-'))!), 'utf8')).toContain('Changed');
  });
});
