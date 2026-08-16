import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLocalDatabaseUrl } from './environment';

const names = {
  applicationDatabaseUrl: 'APP_B_DATABASE_URL',
  databaseName: 'app_b',
};

describe('resolveLocalDatabaseUrl for App B', () => {
  it('prefers the application-specific database URL', () => {
    assert.equal(
      resolveLocalDatabaseUrl(
        {
          APP_B_DATABASE_URL: 'postgresql://app_b:secret@database:5432/app_b',
          DATABASE_URL: 'postgresql://wrong:secret@database:5432/app_b',
        },
        names,
      ),
      'postgresql://app_b:secret@database:5432/app_b',
    );
  });

  it('accepts the container DATABASE_URL fallback', () => {
    assert.equal(
      resolveLocalDatabaseUrl(
        { DATABASE_URL: 'postgresql://postgres:secret@local-db:5432/app_b' },
        names,
      ),
      'postgresql://postgres:secret@local-db:5432/app_b',
    );
  });

  it('builds a local URL from the root development variables', () => {
    assert.equal(
      resolveLocalDatabaseUrl(
        {
          LOCAL_DB_USER: 'local user',
          LOCAL_DB_PASSWORD: 'p@ss word',
          LOCAL_DB_PORT: '5433',
        },
        names,
      ),
      'postgresql://local%20user:p%40ss%20word@localhost:5433/app_b',
    );
  });

  it('rejects a URL for another database', () => {
    assert.throws(
      () =>
        resolveLocalDatabaseUrl(
          { APP_B_DATABASE_URL: 'postgresql://postgres:secret@localhost:5433/app_a' },
          names,
        ),
      /menunjuk tepat ke database app_b/,
    );
  });
});
