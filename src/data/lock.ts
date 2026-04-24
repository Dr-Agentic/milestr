import fs from 'node:fs/promises';
import { LockError } from '../errors';

export class FileLock {
  constructor(private readonly lockFile: string, private readonly pid: number = process.pid) {}

  async acquire(): Promise<void> {
    try {
      await fs.writeFile(this.lockFile, String(this.pid), { flag: 'wx' });
      return;
    } catch {
      // fallthrough
    }

    try {
      const holder = (await fs.readFile(this.lockFile, 'utf8')).trim();
      if (holder === String(this.pid)) {
        return;
      }
      throw new LockError(`Dashboard is locked by PID ${holder}. Another process may be editing it.`);
    } catch (error) {
      if (error instanceof LockError) {
        throw error;
      }
      throw new LockError('Dashboard is locked. Another process may be editing it.');
    }
  }

  async release(): Promise<void> {
    try {
      await fs.unlink(this.lockFile);
    } catch {
      // no-op if lock file disappeared
    }
  }
}
