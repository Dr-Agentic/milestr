import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolvePaths } from '../src/data/config';
import type { DashboardData, DataPaths } from '../src/types';

export function createSampleData(): DashboardData {
  return {
    meta: {
      lastUpdated: '2026-04-13T02:47:41.771Z',
      updateFrequency: 'hourly',
      version: '1.1'
    },
    root: {
      id: 'ROOT',
      title: 'AI Agent Project',
      type: 'goal',
      status: 'ongoing',
      dueDate: null,
      icon: '🎯',
      parent: null,
      children: ['M1', 'I1']
    },
    tasks: {
      ROOT: {
        id: 'ROOT',
        title: 'AI Agent Project',
        subtitle: 'Example goal structure',
        type: 'goal',
        status: 'ongoing',
        progress: 50,
        dueDate: null,
        icon: '🎯',
        parent: null,
        children: ['M1', 'I1'],
        activityLog: []
      },
      M1: {
        id: 'M1',
        title: 'Foundation',
        subtitle: 'Core infrastructure',
        type: 'milestone',
        status: 'ongoing',
        progress: 50,
        dueDate: '2026-05-01',
        icon: '🏗',
        parent: 'ROOT',
        children: ['I1'],
        activityLog: []
      },
      I1: {
        id: 'I1',
        title: 'Core API',
        subtitle: 'REST API',
        type: 'initiative',
        status: 'ongoing',
        progress: 50,
        dueDate: '2026-04-20',
        icon: '⚙️',
        parent: 'M1',
        children: [],
        activityLog: []
      }
    },
    kpis: {
      users: {
        id: 'users',
        title: 'Active Users',
        value: 7,
        unit: 'users',
        trend: 'up',
        source: 'Email inbox',
        icon: 'people',
        lastUpdated: '2026-04-13T02:47:40.288Z'
      }
    }
  };
}

export async function createTempPaths(prefix = 'milestr-test-'): Promise<DataPaths> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return resolvePaths(dir);
}

export async function writeData(paths: DataPaths, data: DashboardData = createSampleData()): Promise<DashboardData> {
  await fs.mkdir(paths.dashboardDir, { recursive: true });
  await fs.writeFile(paths.dataFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}
