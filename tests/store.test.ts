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
    const paths = await createTempPaths();
    const data = await writeData(paths);

    await expect(loadData(paths)).resolves.toEqual(data);

    await fs.writeFile(paths.dataFile, '{"bad":true}', 'utf8');
    await expect(loadData(paths)).rejects.toBeInstanceOf(ValidationError);

    await fs.rm(paths.dataFile, { force: true });
    await expect(loadData(paths)).rejects.toBeInstanceOf(ValidationError);
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
