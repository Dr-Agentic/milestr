import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleData } from './helpers';

const repoRoot = path.resolve(__dirname, '..');
const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliEntry = path.join(repoRoot, 'src', 'index.ts');

interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): CliResult {
  const result = spawnSync(tsxBin, [cliEntry, ...args], {
    cwd: cwd ?? repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1
  };
}

async function setupWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'milestr-smoke-'));
  await fs.writeFile(
    path.join(dir, 'data.json'),
    `${JSON.stringify(createSampleData(), null, 2)}\n`,
    'utf8'
  );
  return dir;
}

async function readDashboardLog(workspace: string): Promise<string> {
  try {
    return await fs.readFile(path.join(workspace, 'dashboard.log'), 'utf8');
  } catch {
    return '';
  }
}

describe('CLI smoke', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await setupWorkspace();
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('reads MILESTR_AGENT env var when --agent is absent', async () => {
    const result = runCli(['list'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Found 3 tasks');

    const log = await readDashboardLog(workspace);
    expect(log).toMatch(/CALLED: stewart \| action=list/);
  });

  it('emits parseable JSON from list --json without activityLog noise', async () => {
    const result = runCli(['list', '--json'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('status');
    expect(parsed[0]).not.toHaveProperty('activityLog');
  });

  it('emits parseable JSON from view ROOT --json', async () => {
    const result = runCli(['view', 'ROOT', '--json'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { id: string; title: string };
    expect(parsed.id).toBe('ROOT');
    expect(parsed.title).toBeTruthy();
  });

  it('preserves human-readable output from view without --json', async () => {
    const result = runCli(['view', 'ROOT'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"id": "ROOT"');
    expect(result.stdout).toContain('AI Agent Project');
  });

  it('emits parseable JSON from list-kpis --json', async () => {
    const result = runCli(['list-kpis', '--json'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('value');
    expect(parsed[0]).toHaveProperty('lastUpdated');
  });

  it('emits JSON metrics with total, byStatus, and kpis fields', async () => {
    const result = runCli(['metrics', '--json'], { MILESTR_AGENT: 'stewart' }, workspace);

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      total: number;
      byStatus: Record<string, number>;
      kpis: number;
    };
    expect(parsed.total).toBeGreaterThan(0);
    expect(typeof parsed.byStatus).toBe('object');
    expect(typeof parsed.kpis).toBe('number');
  });

  it('throws CliError when neither --agent nor MILESTR_AGENT is set', async () => {
    const envWithoutAgent: NodeJS.ProcessEnv = { ...process.env };
    delete envWithoutAgent.MILESTR_AGENT;

    const result = runCli(['list'], envWithoutAgent, workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--agent is required');
    expect(result.stderr).toContain('MILESTR_AGENT');
  });

  it('lets explicit --agent override MILESTR_AGENT', async () => {
    const result = runCli(
      ['--agent', 'explicit', 'list'],
      { MILESTR_AGENT: 'env-agent' },
      workspace
    );

    expect(result.status).toBe(0);

    const log = await readDashboardLog(workspace);
    expect(log).toMatch(/CALLED: explicit \| action=list \| agent=explicit/);
    expect(log).not.toMatch(/CALLED: env-agent/);
  });

  it('reads MILESTR_DATA env var to locate the data directory', async () => {
    // The CLI is invoked from /tmp (no data.json there). MILESTR_DATA points
    // at the workspace, so the command should still find the sample data.
    const result = runCli(
      ['--agent', 'stewart', 'list'],
      { MILESTR_DATA: workspace },
      '/tmp'
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Found 3 tasks');
  });

  it('throws CliError when MILESTR_DATA points at a missing directory', async () => {
    const result = runCli(
      ['--agent', 'stewart', 'list'],
      { MILESTR_DATA: '/nonexistent/path/that/does/not/exist' },
      '/tmp'
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('MILESTR_DATA');
    expect(result.stderr).toContain('Could not chdir');
  });

  it('--data flag overrides CWD without MILESTR_DATA env var', async () => {
    // No MILESTR_DATA set; --data flag points at workspace from /tmp
    const result = runCli(
      ['--agent', 'stewart', '--data', workspace, 'list'],
      {},
      '/tmp'
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Found 3 tasks');
  });

  it('--data flag overrides MILESTR_DATA env var (flag wins)', async () => {
    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), 'milestr-other-'));
    await fs.writeFile(
      path.join(otherDir, 'data.json'),
      `${JSON.stringify(createSampleData(), null, 2)}\n`,
      'utf8'
    );

    try {
      // MILESTR_DATA points to /tmp (no data.json there), --data points to workspace.
      // --data should win.
      const result = runCli(
        ['--agent', 'stewart', '--data', workspace, 'list'],
        { MILESTR_DATA: '/tmp' },
        '/tmp'
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Found 3 tasks');
    } finally {
      await fs.rm(otherDir, { recursive: true, force: true });
    }
  });
});
