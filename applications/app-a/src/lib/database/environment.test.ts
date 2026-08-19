import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLocalDatabaseUrl } from './environment';

const names = {
  applicationDatabaseUrl: 'APP_A_DATABASE_URL',
  databaseName: 'app_a',
};

describe('resolveLocalDatabaseUrl for App A', () => {
  it('prefers the application-specific database URL', () => {
    assert.equal(
      resolveLocalDatabaseUrl(
        {
          APP_A_DATABASE_URL: 'postgresql://app_a:secret@database:5432/app_a',
          DATABASE_URL: 'postgresql://wrong:secret@database:5432/app_a',
        },
        names,
      ),
      'postgresql://app_a:secret@database:5432/app_a',
    );
  });

  it('accepts the container DATABASE_URL fallback', () => {
    assert.equal(
      resolveLocalDatabaseUrl(
        { DATABASE_URL: 'postgresql://postgres:secret@local-db:5432/app_a' },
        names,
      ),
      'postgresql://postgres:secret@local-db:5432/app_a',
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
      'postgresql://local%20user:p%40ss%20word@localhost:5433/app_a',
    );
  });

  it('rejects a URL for another database', () => {
    assert.throws(
      () =>
        resolveLocalDatabaseUrl(
          { APP_A_DATABASE_URL: 'postgresql://postgres:secret@localhost:5433/app_b' },
          names,
        ),
      /menunjuk tepat ke database app_a/,
    );
  });
});
