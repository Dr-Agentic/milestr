import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../src/errors';
import { createSampleData, createTempPaths, readJson, writeData } from './helpers';

const publishDashboardMock = vi.fn();

vi.mock('../src/data/publish', () => ({
  publishDashboard: publishDashboardMock
}));

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishDashboardMock.mockResolvedValue('https://example.pages.dev');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads valid data and rejects invalid json payloads', async () => {
    const { loadData } = await import('../src/data/store');
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const paths = await createTempPaths();
    // Stamp the fixture to CURRENT_DATA_VERSION so loadData is a no-op read.
    // (Migration tests deliberately use older versions and override per-test.)
    const data = await writeData(paths, { ...createSampleData(), meta: { ...createSampleData().meta, version: CURRENT_DATA_VERSION } });

    await expect(loadData(paths)).resolves.toEqual(data);

    await fs.writeFile(paths.dataFile, '{"bad":true}', 'utf8');
    await expect(loadData(paths)).rejects.toBeInstanceOf(ValidationError);

    await fs.rm(paths.dataFile, { force: true });
    await expect(loadData(paths)).rejects.toBeInstanceOf(ValidationError);
  });

  it('automatically migrates older data to the executable version before loading', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const olderData = createSampleData();
    olderData.meta.version = '1.1';
    await writeData(paths, olderData);

    const migrated = await loadData(paths);
    const persisted = await readJson<typeof migrated>(paths.dataFile);

    expect(migrated.meta.version).toBe(CURRENT_DATA_VERSION);
    expect(persisted.meta.version).toBe(CURRENT_DATA_VERSION);
    expect((await fs.readdir(paths.backupDir)).some((name) => name.startsWith('data-'))).toBe(true);
    expect(await fs.readFile(paths.logFile, 'utf8')).toContain('MIGRATION: 1.1 → ' + CURRENT_DATA_VERSION);
  });

  it('migrates unversioned legacy data and rejects data newer than the executable', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const legacyData = createSampleData();
    delete legacyData.meta.version;
    await writeData(paths, legacyData);

    await expect(loadData(paths)).resolves.toMatchObject({ meta: { version: CURRENT_DATA_VERSION } });

    const futureData = createSampleData();
    futureData.meta.version = '999.0.0';
    await writeData(paths, futureData);
    await expect(loadData(paths)).rejects.toThrow('Data version 999.0.0 is newer than this Milestr executable');
  });

  it('writes static html output to both local files', async () => {
    const { saveStaticSite } = await import('../src/data/store');
    const paths = await createTempPaths();
    const data = createSampleData();

    await saveStaticSite(paths, data);

    expect(await fs.readFile(paths.htmlFile, 'utf8')).toContain('Milestr Dashboard');
    expect(await fs.readFile(paths.siteIndexFile, 'utf8')).toContain('Milestr Dashboard');
  });

  it('saves data, creates a backup, logs the change, and publishes', async () => {
    const { saveData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const data = await writeData(paths);

    const result = await saveData(paths, data, 'agent', 'updated something');

    expect(result.publishedUrl).toBe('https://example.pages.dev');
    expect(await fs.readFile(paths.siteIndexFile, 'utf8')).toContain('Milestr Dashboard');
    expect((await readJson<typeof data>(paths.dataFile)).meta.lastUpdated).not.toBe('2026-04-13T02:47:41.771Z');
    expect((await fs.readdir(paths.backupDir)).some((name) => name.startsWith('data-'))).toBe(true);
    expect(await fs.readFile(paths.logFile, 'utf8')).toContain('CHANGE: agent | updated something');
    expect(publishDashboardMock).toHaveBeenCalled();
  });

  it('rethrows non-zod validation errors unchanged', async () => {
    const schema = await import('../src/data/schema');
    const { validateData } = await import('../src/data/store');
    vi.spyOn(schema, 'validateDashboardData').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => validateData({})).toThrow('boom');
  });

  it('self-heals stale parent rollups on load and logs the fix', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    // Hand-craft a stale fixture: I1 is done/100 but M1 is stale (50/ongoing) and ROOT is stale (50/ongoing).
    const data = createSampleData();
    data.meta.version = CURRENT_DATA_VERSION;
    data.tasks.I1.status = 'done';
    data.tasks.I1.progress = 100;
    data.tasks.M1.status = 'ongoing';
    data.tasks.M1.progress = 50;
    data.tasks.ROOT.status = 'ongoing';
    data.tasks.ROOT.progress = 50;
    await writeData(paths, data);

    const healed = await loadData(paths);
    expect(healed.tasks.M1.progress).toBe(100);
    expect(healed.tasks.M1.status).toBe('done');
    expect(healed.tasks.ROOT.progress).toBe(100);
    expect(healed.tasks.ROOT.status).toBe('done');

    const log = await fs.readFile(paths.logFile, 'utf8');
    expect(log).toMatch(/HEAL: parent M1 → status=done, progress=100/);
    expect(log).toMatch(/parent ROOT → status=done, progress=100/);
    expect(log).toMatch(/auto-reconciled on load/);
  });

  it('does not log HEAL when loading already-correct data (idempotent)', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const data = createSampleData();
    data.meta.version = CURRENT_DATA_VERSION;
    await writeData(paths, data);

    await loadData(paths);

    // Either the log file does not exist (preferred — no writes happened) or it
    // exists but contains no HEAL line. Both prove idempotency.
    let log = '';
    try {
      log = await fs.readFile(paths.logFile, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    expect(log).not.toMatch(/HEAL:/);
  });

  it('warns MANUAL_EDIT when data.json mtime is newer than meta.lastUpdated', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const data = createSampleData();
    data.meta.version = CURRENT_DATA_VERSION;
    // Pretend the file was last written by the CLI an hour ago.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    data.meta.lastUpdated = anHourAgo;
    await writeData(paths, data);
    // Then touch the file to "now" (an out-of-band edit).
    const now = new Date();
    await fs.utimes(paths.dataFile, now, now);

    await loadData(paths);

    const log = await fs.readFile(paths.logFile, 'utf8');
    expect(log).toMatch(/MANUAL_EDIT: data\.json was modified after the last CLI write/);
    expect(log).toMatch(/Use `milestr` CLI actions to mutate data\.json/);
  });

  it('does not warn MANUAL_EDIT when data.json mtime is older than meta.lastUpdated (normal CLI write)', async () => {
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { loadData } = await import('../src/data/store');
    const paths = await createTempPaths();
    const data = createSampleData();
    data.meta.version = CURRENT_DATA_VERSION;
    // lastUpdated is in the future relative to a backdated file.
    const tomorrow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    data.meta.lastUpdated = tomorrow;
    await writeData(paths, data);
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await fs.utimes(paths.dataFile, anHourAgo, anHourAgo);

    await loadData(paths);

    let log = '';
    try {
      log = await fs.readFile(paths.logFile, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    expect(log).not.toMatch(/MANUAL_EDIT:/);
  });
});
