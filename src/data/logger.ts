import fs from 'node:fs/promises';
import type { DataPaths, ParsedArgs } from '../types';

export function log(message: string): void {
  console.log(`[dashboard] ${message}`);
}

export async function logToFile(paths: DataPaths, message: string): Promise<void> {
  const line = `${new Date().toISOString()} ${message}\n`;
  await fs.appendFile(paths.logFile, line, 'utf8');
}

export async function logCalled(paths: DataPaths, agent: string, action: string | undefined, args: ParsedArgs): Promise<void> {
  const params = Object.entries(args)
    .filter(([key]) => key !== '_')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  const posArgs = args._.join(' ');
  await logToFile(paths, `CALLED: ${agent} | action=${action} | ${params} | args="${posArgs}"`);
}

export async function logChange(paths: DataPaths, agent: string, note: string): Promise<void> {
  await logToFile(paths, `CHANGE: ${agent} | ${note}`);
}
