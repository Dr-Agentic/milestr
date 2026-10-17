import { describe, expect, it } from 'vitest';
import { CURRENT_DATA_VERSION, MIGRATIONS, migrateData } from '../src/data/migrations';
import { createSampleData } from './helpers';

function previousExecutableVersion(current: string): string {
  const [major, minor, patch] = current.split('.').map((n) => Number(n));
  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.0`;
  if (major > 0) return `${major - 1}.0.0`;
  throw new Error(`cannot decrement ${current}`);
}

describe('migration registry', () => {
  it('declares a target version for every migration step', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(MIGRATIONS.every((migration) => migration.to)).toBe(true);
  });

  it('includes a path from the previous executable version to the current version', () => {
    const previousVersion = previousExecutableVersion(CURRENT_DATA_VERSION);
    const currentMigration = MIGRATIONS.find((migration) => migration.to === CURRENT_DATA_VERSION);

    expect(currentMigration?.from).toContain(previousVersion);
  });

  it('migrates through the registered path to the current version', () => {
    const data = createSampleData();
    data.meta.version = '1.2.2';

    const result = migrateData(data);

    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('1.2.2');
    expect((result.data as typeof data).meta.version).toBe(CURRENT_DATA_VERSION);
  });
});
