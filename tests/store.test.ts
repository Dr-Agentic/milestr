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
});
