import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { LockError } from '../src/errors';
import { FileLock } from '../src/data/lock';
import { createTempPaths } from './helpers';

describe('FileLock', () => {
  it('acquires and releases a lock', async () => {
    const paths = await createTempPaths();
    const lock = new FileLock(paths.lockFile, 123);

    await lock.acquire();
    expect(await fs.readFile(paths.lockFile, 'utf8')).toBe('123');

    await lock.release();
    await expect(fs.readFile(paths.lockFile, 'utf8')).rejects.toThrow();
  });

  it('allows reentry by the same pid', async () => {
    const paths = await createTempPaths();
    await fs.writeFile(paths.lockFile, '123', 'utf8');

    await expect(new FileLock(paths.lockFile, 123).acquire()).resolves.toBeUndefined();
  });

  it('throws when another process holds the lock', async () => {
    const paths = await createTempPaths();
    await fs.writeFile(paths.lockFile, '999', 'utf8');

    await expect(new FileLock(paths.lockFile, 123).acquire()).rejects.toBeInstanceOf(LockError);
  });

  it('ignores missing lock files on release', async () => {
    const paths = await createTempPaths();
    await expect(new FileLock(paths.lockFile, 123).release()).resolves.toBeUndefined();
  });
});
