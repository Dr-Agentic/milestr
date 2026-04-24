import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleData, createTempPaths } from './helpers';

const spawnSyncMock = vi.fn();
const questionMock = vi.fn();
const closeMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock
}));

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: questionMock,
      close: closeMock
    }))
  }
}));

describe('publishDashboard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses saved config and extracts the deployed pages url from wrangler output metadata', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    const data = createSampleData();
    await fs.writeFile(paths.cloudflareConfigFile, JSON.stringify({ projectName: 'saved-name' }), 'utf8');

    spawnSyncMock.mockImplementation((_cmd, args, options) => {
      if (args[1] === 'whoami') {
        return { status: 0, stdout: 'ok', stderr: '' };
      }
      if (args[1] === 'pages' && args[2] === 'deploy') {
        const outputPath = options.env.WRANGLER_OUTPUT_FILE_PATH as string;
        syncFs.writeFileSync(outputPath, `${JSON.stringify({ type: 'pages-deploy', deployment: { url: 'https://saved-name.pages.dev' } })}\n`, 'utf8');
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected wrangler call: ${args.join(' ')}`);
    });

    const url = await publishDashboard(paths, data);

    expect(url).toBe('https://saved-name.pages.dev');
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
  });

  it('logs in, creates a project, saves derived config, and falls back to stdout url parsing', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    const data = createSampleData();

    spawnSyncMock
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '[]', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockImplementationOnce((_cmd, _args, options) => {
        const outputPath = options.env.WRANGLER_OUTPUT_FILE_PATH as string;
        syncFs.writeFileSync(outputPath, `${JSON.stringify({ type: 'pages-deploy', result: {} })}\n`, 'utf8');
        return { status: 0, stdout: 'visit https://ai-agent-project.pages.dev now', stderr: '' };
      });

    const url = await publishDashboard(paths, data);

    expect(url).toBe('https://ai-agent-project.pages.dev');
    expect(JSON.parse(await fs.readFile(paths.cloudflareConfigFile, 'utf8'))).toEqual({ projectName: 'ai-agent-project' });
    expect(spawnSyncMock.mock.calls[1]?.[1]).toEqual(['wrangler', 'login']);
    expect(spawnSyncMock.mock.calls[3]?.[1]).toEqual(['wrangler', 'pages', 'project', 'create', 'ai-agent-project', '--production-branch=main']);
  });

  it('prompts for an alternate project name when creation fails', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    const data = createSampleData();
    data.root.title = '!!!';
    data.tasks.ROOT.title = '!!!';
    questionMock.mockResolvedValue('fallback-name');

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '[]', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'already exists' })
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockImplementationOnce((_cmd, _args, options) => {
        const outputPath = options.env.WRANGLER_OUTPUT_FILE_PATH as string;
        syncFs.writeFileSync(outputPath, `${JSON.stringify({ type: 'pages-deploy', deployment: { aliases: ['https://fallback-name.pages.dev'] } })}\n`, 'utf8');
        return { status: 0, stdout: '', stderr: '' };
      });

    const url = await publishDashboard(paths, data);

    expect(url).toBe('https://fallback-name.pages.dev');
    expect(closeMock).toHaveBeenCalled();
  });

  it('throws when deploy succeeds but no url can be found', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    const data = createSampleData();
    await fs.writeFile(paths.cloudflareConfigFile, JSON.stringify({ projectName: 'saved-name' }), 'utf8');

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockImplementationOnce((_cmd, _args, options) => {
        const outputPath = options.env.WRANGLER_OUTPUT_FILE_PATH as string;
        syncFs.writeFileSync(outputPath, `${JSON.stringify({ type: 'pages-deploy', deployment: {} })}\n`, 'utf8');
        return { status: 0, stdout: '', stderr: '' };
      });

    await expect(publishDashboard(paths, data)).rejects.toThrow('Cloudflare deploy succeeded but no deployment URL was found');
  });

  it('throws when login fails', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();

    spawnSyncMock
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' });

    await expect(publishDashboard(paths, createSampleData())).rejects.toThrow('wrangler login failed');
  });

  it('throws when project listing fails', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'nope' });

    await expect(publishDashboard(paths, createSampleData())).rejects.toThrow('nope');
  });

  it('throws when prompted project name is invalid or second creation fails', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    const data = createSampleData();
    questionMock.mockResolvedValueOnce('bad name').mockResolvedValueOnce('fallback-name');

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '[]', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'exists' });

    await expect(publishDashboard(paths, data)).rejects.toThrow('Invalid Cloudflare Pages project name');

    vi.clearAllMocks();
    questionMock.mockResolvedValue('fallback-name');
    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: '[]', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'exists' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'still exists' });

    await expect(publishDashboard(paths, data)).rejects.toThrow('still exists');
  });

  it('throws when deploy itself fails', async () => {
    const { publishDashboard } = await import('../src/data/publish');
    const paths = await createTempPaths();
    await fs.writeFile(paths.cloudflareConfigFile, JSON.stringify({ projectName: 'saved-name' }), 'utf8');

    spawnSyncMock
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'deploy failed' });

    await expect(publishDashboard(paths, createSampleData())).rejects.toThrow('deploy failed');
  });
});
