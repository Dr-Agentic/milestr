import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlerMock = vi.fn();
const acquireMock = vi.fn();
const releaseMock = vi.fn();
const logCalledMock = vi.fn();

vi.mock('../src/actions/handlers', () => ({
  ACTIONS: {
    status: handlerMock
  }
}));

vi.mock('../src/data/config', () => ({
  resolvePaths: vi.fn(() => ({
    dashboardDir: '/tmp/milestr',
    dataFile: '/tmp/milestr/data.json',
    backupDir: '/tmp/milestr/backups',
    lockFile: '/tmp/milestr/.dashboard.lock',
    logFile: '/tmp/milestr/dashboard.log',
    htmlFile: '/tmp/milestr/dashboard.html',
    siteDir: '/tmp/milestr/site',
    siteIndexFile: '/tmp/milestr/site/index.html',
    cloudflareConfigFile: '/tmp/milestr/.milestr-cloudflare.json'
  }))
}));

vi.mock('../src/data/lock', () => ({
  FileLock: vi.fn(() => ({
    acquire: acquireMock,
    release: releaseMock
  }))
}));

vi.mock('../src/data/logger', () => ({
  logCalled: logCalledMock
}));

describe('index', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    acquireMock.mockResolvedValue(undefined);
    releaseMock.mockResolvedValue(undefined);
    logCalledMock.mockResolvedValue(undefined);
    handlerMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses long and short args', async () => {
    const { parseArgs } = await import('../src/index');
    expect(parseArgs(['--agent', 'codex', '-f', 'x', 'status', 'M1', 'done'])).toEqual({
      _: ['status', 'M1', 'done'],
      agent: 'codex',
      f: 'x'
    });
    expect(parseArgs(['', '--dry', '-v'])).toEqual({
      _: [],
      dry: true,
      v: true
    });
  });

  it('prints help and returns zero', async () => {
    const { run } = await import('../src/index');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(run(['help'])).resolves.toBe(0);
    await expect(run([])).resolves.toBe(0);
    expect(spy).toHaveBeenCalled();
  });

  it('requires an agent for actions', async () => {
    const { run } = await import('../src/index');
    await expect(run(['status', 'M1', 'done'])).rejects.toThrow('--agent is required');
  });

  it('rejects unknown actions', async () => {
    const { run } = await import('../src/index');
    await expect(run(['--agent', 'codex', 'missing'])).rejects.toThrow('Unknown action');
  });

  it('acquires the lock, invokes the handler, and releases the lock', async () => {
    const { run } = await import('../src/index');

    await expect(run(['--agent', 'codex', 'status', 'M1', 'done'])).resolves.toBe(0);
    expect(logCalledMock).toHaveBeenCalled();
    expect(acquireMock).toHaveBeenCalled();
    expect(handlerMock).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex' }),
      expect.objectContaining({ _: ['M1', 'done'], agent: 'codex' })
    );
    expect(releaseMock).toHaveBeenCalled();
  });
});
