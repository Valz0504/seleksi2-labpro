import 'dotenv/config';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';
import { resolveLocalDatabaseUrl } from './src/lib/database/environment';

const rootEnvironmentPath = resolve(process.cwd(), '../../.env');

if (existsSync(rootEnvironmentPath)) {
  loadEnvFile(rootEnvironmentPath);
}

const databaseEnvironmentNames = {
  applicationDatabaseUrl: 'APP_A_DATABASE_URL',
  databaseName: 'app_a',
};
const hasDatabaseEnvironment = [
  databaseEnvironmentNames.applicationDatabaseUrl,
  'DATABASE_URL',
  'LOCAL_DB_USER',
  'LOCAL_DB_PASSWORD',
  'LOCAL_DB_PORT',
].some((name) => process.env[name] !== undefined);
const databaseUrl = hasDatabaseEnvironment
  ? resolveLocalDatabaseUrl(process.env, databaseEnvironmentNames)
  : undefined;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
