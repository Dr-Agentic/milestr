import fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliError, ConflictError, DashboardError, LockError, NotFoundError, ValidationError } from '../src/errors';
import { log, logCalled, logChange, logToFile } from '../src/data/logger';
import { createTempPaths } from './helpers';

describe('errors', () => {
  it('sets error names', () => {
    expect(new DashboardError('x').name).toBe('DashboardError');
    expect(new ValidationError('x').name).toBe('ValidationError');
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new ConflictError('x').name).toBe('ConflictError');
    expect(new LockError('x').name).toBe('LockError');
    expect(new CliError('x').name).toBe('CliError');
  });
});

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints prefixed log lines', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('hello');
    expect(spy).toHaveBeenCalledWith('[dashboard] hello');
  });

  it('writes log files and structured entries', async () => {
    const paths = await createTempPaths();

    await logToFile(paths, 'INFO: test');
    await logCalled(paths, 'agent', 'status', { _: ['M1', 'done'], note: 'ship', dry: true });
    await logChange(paths, 'agent', 'changed something');

    const contents = await fs.readFile(paths.logFile, 'utf8');
    expect(contents).toContain('INFO: test');
    expect(contents).toContain('CALLED: agent | action=status | note=ship dry=true | args="M1 done"');
    expect(contents).toContain('CHANGE: agent | changed something');
  });
});
