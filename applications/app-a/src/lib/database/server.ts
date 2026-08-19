import 'server-only';
import { resolveLocalDatabaseUrl } from './environment';

let cachedDatabaseUrl: string | undefined;

export function getLocalDatabaseUrl(): string {
  cachedDatabaseUrl ??= resolveLocalDatabaseUrl(process.env, {
    applicationDatabaseUrl: 'APP_A_DATABASE_URL',
    databaseName: 'app_a',
  });

  return cachedDatabaseUrl;
}
