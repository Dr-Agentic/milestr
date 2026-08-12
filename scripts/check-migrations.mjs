#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const migrationsModule = require(path.join(repoRoot, 'dist', 'data', 'migrations', 'index.js'));

function parseVersion(version) {
  const match = /^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(String(version).trim());
  if (!match) throw new Error(`Invalid SemVer: ${version}`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function normalize(version) {
  return parseVersion(version).join('.');
}

function compare(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function fail(message) {
  console.error(`Migration contract failed: ${message}`);
  process.exit(1);
}

const executableVersion = packageJson.version;
const currentVersion = migrationsModule.CURRENT_DATA_VERSION;
const migrations = migrationsModule.MIGRATIONS;

if (currentVersion !== executableVersion) {
  fail(`CURRENT_DATA_VERSION (${currentVersion}) does not match package.json (${executableVersion}).`);
}

if (!Array.isArray(migrations) || migrations.length === 0) {
  fail('the migration registry is empty. Every executable version needs a target migration entry.');
}

for (const [index, migration] of migrations.entries()) {
  if (!Array.isArray(migration.from) || migration.from.length === 0) {
    fail(`migration #${index + 1} has no source versions.`);
  }
  if (typeof migration.to !== 'string') {
    fail(`migration #${index + 1} has no target version.`);
  }
  if (typeof migration.migrate !== 'function') {
    fail(`migration #${index + 1} has no migrate function.`);
  }
  for (const source of migration.from) {
    parseVersion(source);
    if (compare(source, migration.to) >= 0) {
      fail(`migration ${source} → ${migration.to} must move forward.`);
    }
  }
  parseVersion(migration.to);
}

if (!migrations.some((migration) => normalize(migration.to) === normalize(executableVersion))) {
  fail(`no migration targets the current executable version ${executableVersion}. Add a ${executableVersion} migration entry, even for a no-op schema release.`);
}

function canReach(startVersion, targetVersion) {
  let cursor = normalize(startVersion);
  const target = normalize(targetVersion);
  const visited = new Set();

  while (cursor !== target) {
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const step = migrations.find((candidate) => candidate.from.some((source) => normalize(source) === cursor));
    if (!step || compare(step.to, targetVersion) > 0) return false;
    cursor = normalize(step.to);
  }

  return true;
}

let previousVersion;
try {
  previousVersion = execFileSync('git', ['show', 'HEAD^:package.json'], { cwd: repoRoot, encoding: 'utf8' });
  previousVersion = JSON.parse(previousVersion).version;
} catch {
  // Tarballs and shallow non-git installs have no previous release to check.
}

if (previousVersion && normalize(previousVersion) !== normalize(executableVersion) && !canReach(previousVersion, executableVersion)) {
  fail(`no migration path from the previous package version ${previousVersion} to ${executableVersion}. Add a migration step before bumping the version.`);
}

console.log(`Migration contract OK: ${previousVersion ? `${previousVersion} → ` : ''}${executableVersion}; ${migrations.length} registry step(s).`);
