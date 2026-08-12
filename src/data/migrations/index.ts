import { MigrationError } from '../../errors';
import { MILESTR_VERSION } from '../../version';
import { migrateLegacyDashboard } from './v1.1.0-to-current';

export const CURRENT_DATA_VERSION = MILESTR_VERSION;

interface VersionParts {
  major: number;
  minor: number;
  patch: number;
}

export interface VersionMigration {
  from: string[];
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

export interface MigrationResult {
  data: unknown;
  migrated: boolean;
  fromVersion?: string | undefined;
  toVersion: string;
  path?: string[];
}

export const MIGRATIONS: VersionMigration[] = [
  {
    from: ['0.0.0', '1.0.0', '1.1.0', '1.2.0'],
    // Keep migration targets explicit. CI must fail when a package bump is not
    // accompanied by a deliberate registry entry for that exact version.
    to: '1.2.1',
    migrate: migrateLegacyDashboard
  }
];

function parseVersion(version: string): VersionParts {
  const match = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(version.trim());
  if (!match) {
    throw new MigrationError(`Invalid data version "${version}"`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0)
  };
}

function compareVersions(left: VersionParts, right: VersionParts): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedVersion(version: string): string {
  const parsed = parseVersion(version);
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function stampVersion(data: Record<string, unknown>, version: string): Record<string, unknown> {
  const meta = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
    ? data.meta as Record<string, unknown>
    : {};

  return {
    ...data,
    meta: {
      ...meta,
      version
    }
  };
}

function findMigration(version: string): VersionMigration | undefined {
  const normalized = normalizedVersion(version);
  return MIGRATIONS.find((migration) => migration.from.some((source) => normalizedVersion(source) === normalized));
}

export function migrateData(data: unknown): MigrationResult {
  const rawData = isRecord(data) ? data : undefined;
  const rawMeta = rawData && isRecord(rawData.meta) ? rawData.meta : undefined;
  const storedVersion = typeof rawMeta?.version === 'string' ? rawMeta.version : undefined;
  const current = parseVersion(CURRENT_DATA_VERSION);

  if (!rawData) {
    return { data, migrated: false, toVersion: CURRENT_DATA_VERSION };
  }

  const sourceVersion = storedVersion ? normalizedVersion(storedVersion) : '0.0.0';
  const source = parseVersion(sourceVersion);

  if (compareVersions(source, current) === 0) {
    return { data, migrated: false, fromVersion: storedVersion, toVersion: CURRENT_DATA_VERSION };
  }

  if (compareVersions(source, current) > 0) {
    throw new MigrationError(
      `Data version ${storedVersion ?? sourceVersion} is newer than this Milestr executable (${CURRENT_DATA_VERSION}). Upgrade Milestr before opening this dashboard.`
    );
  }

  let migratedData = rawData;
  let cursor = sourceVersion;
  const path: string[] = [];
  const maxSteps = MIGRATIONS.length + 1;

  for (let stepCount = 0; stepCount < maxSteps; stepCount += 1) {
    const migration = findMigration(cursor);
    if (!migration) {
      throw new MigrationError(
        `No migration path from data version ${storedVersion ?? sourceVersion} to ${CURRENT_DATA_VERSION}. Upgrade Milestr with a compatible migration.`
      );
    }

    const target = normalizedVersion(migration.to);
    if (compareVersions(parseVersion(target), current) > 0) {
      throw new MigrationError(
        `Migration target ${migration.to} is newer than this Milestr executable (${CURRENT_DATA_VERSION}).`
      );
    }

    migratedData = stampVersion(migration.migrate(migratedData), migration.to);
    path.push(`${cursor} → ${target}`);
    cursor = target;

    if (compareVersions(parseVersion(cursor), current) === 0) {
      return {
        data: migratedData,
        migrated: true,
        fromVersion: storedVersion,
        toVersion: CURRENT_DATA_VERSION,
        path
      };
    }
  }

  throw new MigrationError(`Migration chain exceeded ${maxSteps} steps before reaching ${CURRENT_DATA_VERSION}.`);
}
