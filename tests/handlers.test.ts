import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePaths } from '../src/data/config';
import { createSampleData } from './helpers';

const publishDashboardMock = vi.fn();

vi.mock('../src/data/publish', () => ({
  publishDashboard: publishDashboardMock
}));

async function createWorkspace() {
  const dir = await fs.mkdtemp('/tmp/milestr-handlers-');
  const paths = resolvePaths(dir);
  const data = createSampleData();
  await fs.writeFile(paths.dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { dir, paths, data };
}

describe('handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishDashboardMock.mockResolvedValue('https://example.pages.dev');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates, updates, recalculates, and deletes tasks', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS.create(ctx, { _: [], id: 'T1', title: 'Task 1', parent: 'M1', type: 'task' });
    await ACTIONS.status(ctx, { _: ['T1', 'done', 'shipped'] });
    await ACTIONS.progress(ctx, { _: ['I1', '100'] });
    await ACTIONS.title(ctx, { _: ['T1', 'Renamed task'] });
    await ACTIONS.due(ctx, { _: ['T1', '2026-06-01'] });
    await ACTIONS.recalc(ctx, { _: ['M1'] });
    await ACTIONS.delete(ctx, { _: ['T1'] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(current.tasks.T1).toBeUndefined();
    expect(current.tasks.I1.status).toBe('done');
    expect(current.tasks.M1.progress).toBe(100);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('https://example.pages.dev');
  });

  it('renders view, list, metrics, export, publish, and backup commands', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS.view(ctx, { _: ['M1'] });
    await ACTIONS.list(ctx, { _: [], status: 'ongoing' });
    await ACTIONS.metrics(ctx, { _: [] });
    await ACTIONS.export(ctx, { _: [] });
    await ACTIONS.publish(ctx, { _: [] });
    await ACTIONS.backup(ctx, { _: [] });
    await ACTIONS.backups(ctx, { _: [] });

    expect(await fs.readFile(paths.htmlFile, 'utf8')).toContain('Milestr Dashboard');
    expect(await fs.readFile(paths.siteIndexFile, 'utf8')).toContain('Milestr Dashboard');
    expect((await fs.readdir(paths.backupDir)).length).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalled();
  });

  it('creates, updates, and lists KPIs', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS['create-kpi'](ctx, { _: [], id: 'mrr', title: 'MRR', value: '10', unit: 'USD', trend: 'up', source: 'Stripe' });
    await ACTIONS['update-kpi'](ctx, { _: [], id: 'mrr', value: '20', trend: 'neutral' });
    await ACTIONS['list-kpis'](ctx, { _: [] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(current.kpis.mrr.value).toBe('20');
    expect(logSpy).toHaveBeenCalled();
  });

  it('restores from backup', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await ACTIONS.backup(ctx, { _: [] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    current.tasks.I1.title = 'Modified';
    await fs.writeFile(paths.dataFile, `${JSON.stringify(current, null, 2)}\n`, 'utf8');

    const backupFile = (await fs.readdir(paths.backupDir)).find((name) => name.startsWith('data-'))!;
    const timestamp = backupFile.replace('data-', '').replace('.json', '');
    await ACTIONS.restore(ctx, { _: [timestamp] });

    const restored = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(restored.tasks.I1.title).toBe('Core API');
  });

  it('covers validation and failure branches', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await expect(ACTIONS.create(ctx, { _: [] })).rejects.toThrow('create requires --id and --title');
    await expect(ACTIONS.create(ctx, { _: [], id: 'M1', title: 'dup' })).rejects.toThrow('Task already exists');
    await expect(ACTIONS.create(ctx, { _: [], id: 'X1', title: 'x', type: 'bad' })).rejects.toThrow('Invalid type');
    await expect(ACTIONS.create(ctx, { _: [], id: 'X1', title: 'x', parent: 'missing' })).rejects.toThrow('Parent task not found');

    await expect(ACTIONS.status(ctx, { _: [] })).rejects.toThrow('status requires <id> <status> [note]');
    await expect(ACTIONS.status(ctx, { _: ['I1', 'bad'] })).rejects.toThrow('Invalid status');
    await expect(ACTIONS.progress(ctx, { _: [] })).rejects.toThrow('progress requires <id> <percentage>');
    await expect(ACTIONS.progress(ctx, { _: ['I1', '200'] })).rejects.toThrow('Progress must be 0-100');
    await expect(ACTIONS.title(ctx, { _: [] })).rejects.toThrow('title requires <id> <new title>');
    await expect(ACTIONS.due(ctx, { _: [] })).rejects.toThrow('due requires <id> <YYYY-MM-DD>');
    await expect(ACTIONS.delete(ctx, { _: [] })).rejects.toThrow('delete requires <id>');
    await expect(ACTIONS.delete(ctx, { _: ['ROOT'] })).rejects.toThrow('Cannot delete ROOT');
    await expect(ACTIONS.delete(ctx, { _: ['M1'] })).rejects.toThrow('has children');
    await expect(ACTIONS.recalc(ctx, { _: [] })).rejects.toThrow('recalc requires <id>');
    await expect(ACTIONS.view(ctx, { _: [] })).rejects.toThrow('view requires <id>');
    await expect(ACTIONS.restore(ctx, { _: [] })).rejects.toThrow('restore requires <timestamp>');
    await expect(ACTIONS.restore(ctx, { _: ['missing'] })).rejects.toThrow('Backup not found or unreadable');

    await fs.rm(paths.backupDir, { recursive: true, force: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await ACTIONS.backups(ctx, { _: [] });
    expect(logSpy).toHaveBeenCalledWith('No backups yet');

    const dataWithoutKpis = createSampleData();
    delete dataWithoutKpis.kpis;
    await fs.writeFile(paths.dataFile, `${JSON.stringify(dataWithoutKpis, null, 2)}\n`, 'utf8');

    await expect(ACTIONS['create-kpi'](ctx, { _: [] })).rejects.toThrow('create-kpi requires --id and --title');
    await ACTIONS['create-kpi'](ctx, { _: [], id: 'k1', title: 'K1' });
    await expect(ACTIONS['create-kpi'](ctx, { _: [], id: 'k1', title: 'K1' })).rejects.toThrow('KPI already exists');
    await expect(ACTIONS['update-kpi'](ctx, { _: [] })).rejects.toThrow('update-kpi requires --id');
    await expect(ACTIONS['update-kpi'](ctx, { _: [], id: 'missing' })).rejects.toThrow('KPI not found');
  });
});
