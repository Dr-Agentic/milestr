import fs from 'node:fs/promises';
import path from 'node:path';
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

  it('appends free-text log entries to a task via the log action', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await ACTIONS.log(ctx, { _: ['I1', 'drafted the API spec for review'] });
    await ACTIONS.log(ctx, { _: ['I1', 'merged PR #42'] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    // addActivityLog prepends (newest first); the most recent write is at index 0
    expect(current.tasks.I1.activityLog[0]).toMatchObject({
      agent: 'agent',
      note: 'merged PR #42'
    });
    expect(current.tasks.I1.activityLog[1]).toMatchObject({
      agent: 'agent',
      note: 'drafted the API spec for review'
    });
  });

  it('refuses to log without an id or a message', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await expect(ACTIONS.log(ctx, { _: [] })).rejects.toThrow('log requires <id>');
    await expect(ACTIONS.log(ctx, { _: ['I1'] })).rejects.toThrow('log requires <id>');
    await expect(ACTIONS.log(ctx, { _: ['missing', 'nope'] })).rejects.toThrow('Task not found');
  });

  it('keeps both ROOT title representations in sync', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await ACTIONS.title(ctx, { _: ['ROOT', 'Renamed project'] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(current.tasks.ROOT.title).toBe('Renamed project');
    expect(current.root.title).toBe('Renamed project');
  });

  it('does not change the root title when renaming another task', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await ACTIONS.title(ctx, { _: ['I1', 'Renamed initiative'] });

    const current = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(current.tasks.I1.title).toBe('Renamed initiative');
    expect(current.tasks.ROOT.title).toBe('AI Agent Project');
    expect(current.root.title).toBe('AI Agent Project');
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

  it('emits JSON output for view, list, list-kpis, and metrics when --json is set', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS['create-kpi'](ctx, { _: [], id: 'mrr', title: 'MRR', value: '100', unit: 'USD', trend: 'up', source: 'Stripe' });

    logSpy.mockClear();
    await ACTIONS.view(ctx, { _: ['M1'], json: true });
    const viewLines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(() => JSON.parse(viewLines)).not.toThrow();
    expect(JSON.parse(viewLines).id).toBe('M1');

    logSpy.mockClear();
    await ACTIONS.list(ctx, { _: [], json: true });
    const listLines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const listParsed = JSON.parse(listLines);
    expect(Array.isArray(listParsed)).toBe(true);
    expect(listParsed[0]).toHaveProperty('id');
    expect(listParsed[0]).toHaveProperty('status');
    expect(listParsed[0]).not.toHaveProperty('activityLog');

    logSpy.mockClear();
    await ACTIONS['list-kpis'](ctx, { _: [], json: true });
    const kpiLines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const kpiParsed = JSON.parse(kpiLines) as Array<{ id: string; value: string | number; unit?: string; trend?: string }>;
    expect(Array.isArray(kpiParsed)).toBe(true);
    const mrr = kpiParsed.find((k) => k.id === 'mrr');
    expect(mrr).toMatchObject({ id: 'mrr', value: '100', unit: 'USD', trend: 'up' });

    logSpy.mockClear();
    await ACTIONS.metrics(ctx, { _: [], json: true });
    const metricsLines = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    const metricsParsed = JSON.parse(metricsLines);
    expect(metricsParsed).toHaveProperty('total');
    expect(metricsParsed).toHaveProperty('byStatus');
    expect(metricsParsed).toHaveProperty('kpis', 2);
  });

  it('keeps human-readable output when --json is not set', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS['create-kpi'](ctx, { _: [], id: 'mrr', title: 'MRR', value: '100' });

    logSpy.mockClear();
    await ACTIONS['list-kpis'](ctx, { _: [] });
    expect(logSpy.mock.calls.flat().join(' ')).toContain('mrr');

    logSpy.mockClear();
    await ACTIONS.metrics(ctx, { _: [] });
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Total tasks');
  });

  it('init creates a data.json with a root goal and correct version', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [] });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.meta.version).toBe('1.2.1');
    expect(data.root.id).toBe('ROOT');
    expect(data.root.type).toBe('goal');
    expect(data.tasks.ROOT).toBeDefined();
    expect(data.tasks.ROOT.children).toEqual([]);
    expect(data.kpis).toEqual({});
  });

  it('init accepts --id, --title, and --icon overrides', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-opts-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [], id: 'PROJ', title: 'My Project', icon: '🚀' });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.root.id).toBe('PROJ');
    expect(data.root.title).toBe('My Project');
    expect(data.root.icon).toBe('🚀');
    expect(data.tasks.PROJ).toBeDefined();
  });

  it('init refuses to overwrite an existing data.json', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    const ctx = { agent: 'agent', paths };

    await expect(ACTIONS.init(ctx, { _: [] })).rejects.toThrow('already exists');
  });

  it('init creates data that passes validateData and has correct CURRENT_DATA_VERSION', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { validateData } = await import('../src/data/store');
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const dir = await fs.mkdtemp('/tmp/milestr-init-validate-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [] });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    // Must not throw — validateData wraps Zod validation
    const validated = validateData(data);
    expect(validated.meta.version).toBe(CURRENT_DATA_VERSION);
    expect(validated.root.type).toBe('goal');
    expect(validated.tasks[validated.root.id]).toBeDefined();
    expect(validated.kpis).toEqual({});
  });

  it('init bootstraps a dashboard that list and metrics can read end-to-end', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-list-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ACTIONS.init(ctx, { _: [] });

    logSpy.mockClear();
    await ACTIONS.list(ctx, { _: [] });
    expect(logSpy.mock.calls.flat().join(' ')).toContain('My Dashboard');

    logSpy.mockClear();
    await ACTIONS.metrics(ctx, { _: [] });
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Total tasks');
  });

  it('init stamps CURRENT_DATA_VERSION in meta.version using the hardcoded registry target', async () => {
    // This test verifies the explicit hardcoded version in MIGRATIONS matches
    // what init writes, and that this equals the package version.
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const { MIGRATIONS } = await import('../src/data/migrations');
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-version-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [] });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);

    // The hardcoded migration target must equal CURRENT_DATA_VERSION
    const latestMigration = MIGRATIONS[MIGRATIONS.length - 1];
    expect(latestMigration.to).toBe('1.2.1');
    expect(CURRENT_DATA_VERSION).toBe('1.2.1');

    // init stamps CURRENT_DATA_VERSION
    expect(data.meta.version).toBe(CURRENT_DATA_VERSION);
    expect(data.meta.version).toBe('1.2.1');
  });

  it('init produces a dashboard.html in the site directory', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-html-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [] });

    const html = await fs.readFile(paths.htmlFile, 'utf8');
    expect(html).toContain('<html');
    expect(html).toContain('Milestr Dashboard');
  });

  it('init respects --id flag and creates the task under that id', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-id-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [], id: 'MYGOAL' });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.root.id).toBe('MYGOAL');
    expect(data.tasks.MYGOAL).toBeDefined();
    expect(data.tasks.MYGOAL.type).toBe('goal');
    expect(data.root.children).toEqual([]);
  });

  it('init sets lastUpdated to a valid ISO timestamp', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-ts-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [] });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.meta.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const parsed = new Date(data.meta.lastUpdated);
    expect(parsed.getTime()).toBeGreaterThan(0);
  });

  it('init --force overwrites an existing data.json with new contents', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace(); // has existing data
    const ctx = { agent: 'agent', paths };

    // Refuse without --force
    await expect(ACTIONS.init(ctx, { _: [] })).rejects.toThrow('already exists');

    // --force replaces it
    await ACTIONS.init(ctx, { _: [], force: true, title: 'Overwritten Title' });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(data.root.title).toBe('Overwritten Title');
    expect(data.tasks.ROOT).toBeDefined();
  });

  it('init --minimal produces a root-only payload (no child tasks)', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-minimal-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [], minimal: true, title: 'Minimal Setup' });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    expect(Object.keys(data.tasks)).toEqual(['ROOT']);
    expect(data.kpis).toEqual({});
    expect(data.root.children).toEqual([]);
  });

  it('init --seed <bad.json> throws ValidationError and writes nothing', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-seed-bad-');
    const badSeed = path.join(dir, 'bad.json');
    await fs.writeFile(badSeed, '{ "not": "a valid dashboard" }', 'utf8');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await expect(ACTIONS.init(ctx, { _: [], seed: badSeed })).rejects.toThrow();
    await expect(fs.access(paths.dataFile)).rejects.toThrow(); // file not created
  });

  it('init --seed preserves tasks and kpis from the seed but overwrites meta', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-seed-good-');
    const seedPath = path.join(dir, 'seed.json');
    const seedData = {
      meta: { lastUpdated: '2020-01-01T00:00:00Z', updateFrequency: 'daily', version: '0.1.0' },
      root: { id: 'ROOT', title: 'Seed Title', type: 'goal', status: 'ongoing', dueDate: null, icon: '🌱', parent: null, children: [] },
      tasks: {
        ROOT: { id: 'ROOT', title: 'Seed Title', subtitle: 'From seed', type: 'goal', status: 'ongoing', progress: 0, dueDate: null, icon: '🌱', parent: null, children: [], activityLog: [] }
      },
      kpis: { 'kpi-test': { id: 'kpi-test', title: 'Test KPI', value: 42, unit: 'x', trend: 'up', source: 'test', icon: '🧪', lastUpdated: '2020-01-01T00:00:00Z' } }
    };
    await fs.writeFile(seedPath, JSON.stringify(seedData), 'utf8');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };

    await ACTIONS.init(ctx, { _: [], seed: seedPath });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);
    // meta stamped to current version
    expect(data.meta.version).toBe('1.2.1');
    expect(data.meta.lastUpdated).not.toBe('2020-01-01T00:00:00Z');
    // task and kpi content preserved
    expect(data.tasks.ROOT.title).toBe('Seed Title');
    expect(data.kpis['kpi-test'].value).toBe(42);
  });

  it('init --data-file writes to an explicit absolute path', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-df-');
    const explicitPath = path.join(dir, 'custom', 'my-dashboard.json');
    const ctx = { agent: 'agent', paths: resolvePaths(dir) };

    await ACTIONS.init(ctx, { _: [], 'data-file': explicitPath });

    const raw = await fs.readFile(explicitPath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.root.id).toBe('ROOT');
    // CWD data.json should NOT exist
    await expect(fs.access(path.join(dir, 'data.json'))).rejects.toThrow();
  });

  it('init --json emits the resulting data.json to stdout', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const dir = await fs.mkdtemp('/tmp/milestr-init-json-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ACTIONS.init(ctx, { _: [], json: true });

    const calls = logSpy.mock.calls.flat();
    const output = calls.join('');
    const parsed = JSON.parse(output);
    expect(parsed.meta.version).toBe('1.2.1');
    expect(parsed.root.type).toBe('goal');
    expect(parsed.tasks.ROOT).toBeDefined();
  });

  it('init --seed real-data fixture round-trips: version stamped, tasks/kpis preserved', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { CURRENT_DATA_VERSION } = await import('../src/data/migrations');
    const dir = await fs.mkdtemp('/tmp/milestr-init-realdata-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/milestr-real-data.json');

    await ACTIONS.init(ctx, { _: [], seed: fixturePath });

    const raw = await fs.readFile(paths.dataFile, 'utf8');
    const data = JSON.parse(raw);

    // version stamped to current
    expect(data.meta.version).toBe(CURRENT_DATA_VERSION);
    // root task content preserved
    expect(data.root.id).toBe('ROOT');
    expect(data.root.title).toBe('Milestr Self-Dashboard'); // from fixture
    expect(data.tasks.ROOT).toBeDefined();
    // KPIs preserved from fixture
    expect(data.kpis['kpi-users']).toBeDefined();
    expect(data.kpis['kpi-mrr']).toBeDefined();
    // fixture was v0.5.0, now stamped to 1.2.1
    expect(data.meta.version).toBe('1.2.1');
  });

  it('init publishes and logs the dashboard URL', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    publishDashboardMock.mockResolvedValueOnce('https://agent-dashboard.pages.dev');
    const dir = await fs.mkdtemp('/tmp/milestr-init-publish-');
    const paths = resolvePaths(dir);
    const ctx = { agent: 'agent', paths };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await ACTIONS.init(ctx, { _: [] });

    expect(publishDashboardMock).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('https://agent-dashboard.pages.dev');
  });
});

describe('update (generic field setter)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    publishDashboardMock.mockResolvedValue('https://example.pages.dev');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets an allowlisted task field with --value', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths, data } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS.update(ctx, { _: ['M1'], field: 'subtitle', value: 'A new subtitle' });

    const updated = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(updated.tasks.M1.subtitle).toBe('A new subtitle');
    // audit entry was appended
    expect(updated.tasks.M1.activityLog[0].note).toContain('subtitle');
    // root.children untouched
    expect(updated.root.children).toEqual(data.root.children);
  });

  it('reports current value when --value is omitted (no mutation)', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    // capture before-state hash to confirm file unchanged on disk
    const beforeHash = (await fs.stat(paths.dataFile)).mtimeMs;

    await ACTIONS.update(ctx, { _: ['M1'], field: 'subtitle' });

    const afterHash = (await fs.stat(paths.dataFile)).mtimeMs;
    expect(afterHash).toBe(beforeHash);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('M1.subtitle');
    // publishDashboard NOT called when no mutation
    expect(publishDashboardMock).toHaveBeenCalledTimes(0);
  });

  it('rejects fields not in the task allowlist', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await expect(
      ACTIONS.update(ctx, { _: ['M1'], field: 'progress', value: '50' })
    ).rejects.toThrow(/not in allowlist/);

    await expect(
      ACTIONS.update(ctx, { _: ['M1'], field: 'bogusField', value: 'x' })
    ).rejects.toThrow(/not in allowlist/);
  });

  it('rejects fields not in the KPI allowlist', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    // create a KPI so we have one to target
    await ACTIONS['create-kpi'](ctx, { _: [], id: 'kpi-test', title: 'Test KPI', value: '0', unit: 'users' });

    // KPI allowlist: title, unit, source, icon — value is NOT in it
    await expect(
      ACTIONS.update(ctx, { _: ['kpi-test'], field: 'value', value: '50' })
    ).rejects.toThrow(/not in allowlist/);
  });

  it('updates a KPI field that IS in the KPI allowlist', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS['create-kpi'](ctx, { _: [], id: 'kpi-test', title: 'Test KPI', value: '0', unit: 'users' });
    await ACTIONS.update(ctx, { _: ['kpi-test'], field: 'unit', value: 'signups' });

    const updated = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(updated.kpis['kpi-test'].unit).toBe('signups');
  });

  it('throws when the id does not exist in tasks or kpis', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await expect(
      ACTIONS.update(ctx, { _: ['NOPE'], field: 'subtitle', value: 'x' })
    ).rejects.toThrow(/not found in tasks or kpis/);
  });

  it('coerces empty string to null for dueDate', async () => {
    const { ACTIONS } = await import('../src/actions/handlers');
    const { paths } = await createWorkspace();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { agent: 'agent', paths };

    await ACTIONS.update(ctx, { _: ['M1'], field: 'dueDate', value: '' });

    const updated = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    expect(updated.tasks.M1.dueDate).toBeNull();
  });
});
