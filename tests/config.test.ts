import { describe, expect, it } from 'vitest';
import { resolvePaths } from '../src/data/config';

describe('resolvePaths', () => {
  it('resolves all local workspace paths', () => {
    const paths = resolvePaths('/tmp/milestr');

    expect(paths.dashboardDir).toBe('/tmp/milestr');
    expect(paths.dataFile).toBe('/tmp/milestr/data.json');
    expect(paths.backupDir).toBe('/tmp/milestr/backups');
    expect(paths.lockFile).toBe('/tmp/milestr/.dashboard.lock');
    expect(paths.logFile).toBe('/tmp/milestr/dashboard.log');
    expect(paths.htmlFile).toBe('/tmp/milestr/dashboard.html');
    expect(paths.siteDir).toBe('/tmp/milestr/site');
    expect(paths.siteIndexFile).toBe('/tmp/milestr/site/index.html');
    expect(paths.cloudflareConfigFile).toBe('/tmp/milestr/.milestr-cloudflare.json');
  });
});
