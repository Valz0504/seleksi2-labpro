import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const rootEnvironmentPath = resolve(process.cwd(), '../../.env');

if (existsSync(rootEnvironmentPath)) {
  loadEnvFile(rootEnvironmentPath);
}

const nextConfig: NextConfig = {};

export default nextConfig;
