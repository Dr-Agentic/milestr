import path from 'node:path';
import type { DataPaths } from '../types';

export function resolvePaths(cwd: string = process.cwd()): DataPaths {
  const dashboardDir = path.resolve(cwd);
  const siteDir = path.join(dashboardDir, 'site');
  return {
    dashboardDir,
    dataFile: path.join(dashboardDir, 'data.json'),
    backupDir: path.join(dashboardDir, 'backups'),
    lockFile: path.join(dashboardDir, '.dashboard.lock'),
    logFile: path.join(dashboardDir, 'dashboard.log'),
    htmlFile: path.join(dashboardDir, 'dashboard.html'),
    siteDir,
    siteIndexFile: path.join(siteDir, 'index.html'),
    cloudflareConfigFile: path.join(dashboardDir, '.milestr-cloudflare.json')
  };
}
