import 'server-only';
import { resolveLocalDatabaseUrl } from './environment';

let cachedDatabaseUrl: string | undefined;

export function getLocalDatabaseUrl(): string {
  cachedDatabaseUrl ??= resolveLocalDatabaseUrl(process.env, {
    applicationDatabaseUrl: 'APP_B_DATABASE_URL',
    databaseName: 'app_b',
  });

  return cachedDatabaseUrl;
}
