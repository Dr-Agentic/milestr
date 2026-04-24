import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import type { CloudflarePublishConfig, DashboardData, DataPaths } from '../types';
import { CliError } from '../errors';

interface WranglerResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runWrangler(args: string[], cwd: string, inherit = false, extraEnv?: NodeJS.ProcessEnv): WranglerResult {
  const result = spawnSync('npx', ['wrangler', ...args], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv
    },
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe'
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

async function loadConfig(paths: DataPaths): Promise<CloudflarePublishConfig | null> {
  try {
    const raw = await fs.readFile(paths.cloudflareConfigFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CloudflarePublishConfig>;
    if (typeof parsed.projectName === 'string' && parsed.projectName.trim()) {
      return { projectName: parsed.projectName.trim() };
    }
  } catch {
    return null;
  }

  return null;
}

async function saveConfig(paths: DataPaths, config: CloudflarePublishConfig): Promise<void> {
  await fs.writeFile(paths.cloudflareConfigFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function slugifyProjectName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 58);
}

function projectTitle(data: DashboardData): string {
  return data.tasks.ROOT?.title ?? data.root.title;
}

function isValidProjectName(projectName: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(projectName);
}

async function promptProjectName(defaultName: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = (await rl.question(`Cloudflare Pages project name [${defaultName}]: `)).trim();
    return answer || defaultName;
  } finally {
    rl.close();
  }
}

function extractProjectNames(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout) as Array<{ name?: unknown; ['Project Name']?: unknown }>;
    return parsed
      .map((entry) => {
        if (typeof entry.name === 'string') {
          return entry.name;
        }
        if (typeof entry['Project Name'] === 'string') {
          return entry['Project Name'];
        }
        return null;
      })
      .filter((entry): entry is string => entry !== null);
  } catch {
    return [];
  }
}

async function ensureLoggedIn(paths: DataPaths): Promise<void> {
  const whoami = runWrangler(['whoami'], paths.dashboardDir);
  if (whoami.code === 0) {
    return;
  }

  console.log('[dashboard] Cloudflare login required. Opening wrangler login...');
  const login = runWrangler(['login'], paths.dashboardDir, true);
  if (login.code !== 0) {
    throw new CliError('wrangler login failed');
  }
}

async function resolveProjectName(paths: DataPaths, data: DashboardData): Promise<string> {
  const existing = await loadConfig(paths);
  if (existing) {
    return existing.projectName;
  }

  const derived = slugifyProjectName(projectTitle(data));
  let candidate = derived || 'milestr-dashboard';

  if (!isValidProjectName(candidate)) {
    candidate = await promptProjectName('milestr-dashboard');
  }

  const projects = runWrangler(['pages', 'project', 'list', '--json'], paths.dashboardDir);
  if (projects.code !== 0) {
    throw new CliError(projects.stderr.trim() || 'Failed to list Cloudflare Pages projects');
  }

  const projectNames = new Set(extractProjectNames(projects.stdout));
  if (!projectNames.has(candidate)) {
    const create = runWrangler(['pages', 'project', 'create', candidate, '--production-branch=main'], paths.dashboardDir);
    if (create.code !== 0) {
      const prompted = await promptProjectName(candidate);
      if (!isValidProjectName(prompted)) {
        throw new CliError('Invalid Cloudflare Pages project name');
      }
      const createWithPrompt = runWrangler(['pages', 'project', 'create', prompted, '--production-branch=main'], paths.dashboardDir);
      if (createWithPrompt.code !== 0) {
        throw new CliError(createWithPrompt.stderr.trim() || createWithPrompt.stdout.trim() || 'Failed to create Cloudflare Pages project');
      }
      candidate = prompted;
    }
  }

  await saveConfig(paths, { projectName: candidate });
  return candidate;
}

function collectUrls(value: unknown, found: string[]): void {
  if (typeof value === 'string') {
    const matches = value.match(/https?:\/\/[^\s"'<>]+/g);
    if (matches) {
      found.push(...matches);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectUrls(entry, found);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      collectUrls(entry, found);
    }
  }
}

async function parsePagesDeployUrl(outputFilePath: string, stdout: string, stderr: string): Promise<string> {
  const raw = await fs.readFile(outputFilePath, 'utf8');
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type?: string });

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== 'pages-deploy') {
      continue;
    }

    const urls: string[] = [];
    collectUrls(entry, urls);
    const preferred = urls.find((url) => url.includes('.pages.dev')) ?? urls[0];
    if (preferred) {
      return preferred;
    }
  }

  const combined = `${stdout}\n${stderr}`;
  const fallback = combined.match(/https?:\/\/[^\s"'<>]+/g)?.find((url) => url.includes('.pages.dev'));
  if (fallback) {
    return fallback;
  }

  throw new CliError('Cloudflare deploy succeeded but no deployment URL was found');
}

export async function publishDashboard(paths: DataPaths, data: DashboardData): Promise<string> {
  await ensureLoggedIn(paths);
  const projectName = await resolveProjectName(paths, data);

  const outputFilePath = path.join(os.tmpdir(), `milestr-wrangler-${Date.now()}.jsonl`);
  const deploy = runWrangler(
    ['pages', 'deploy', paths.siteDir, `--project-name=${projectName}`],
    paths.dashboardDir,
    false,
    { WRANGLER_OUTPUT_FILE_PATH: outputFilePath }
  );

  if (deploy.code !== 0) {
    throw new CliError(deploy.stderr.trim() || deploy.stdout.trim() || 'Cloudflare Pages deploy failed');
  }

  try {
    return await parsePagesDeployUrl(outputFilePath, deploy.stdout, deploy.stderr);
  } finally {
    await fs.rm(outputFilePath, { force: true });
  }
}
