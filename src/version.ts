import fs from 'node:fs';
import path from 'node:path';

interface PackageMetadata {
  version: string;
}

function readPackageVersion(): string {
  const packagePath = path.resolve(__dirname, '..', 'package.json');
  const packageMetadata = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageMetadata;
  return packageMetadata.version;
}

export const MILESTR_VERSION = readPackageVersion();
