import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRelyingApplicationEnvironment } from './environment';

const names = {
  applicationName: 'App A',
  clientId: 'APP_A_CLIENT_ID',
  clientSecret: 'APP_A_CLIENT_SECRET',
  redirectUri: 'APP_A_REDIRECT_URI',
  launchUrl: 'APP_A_LAUNCH_URL',
  oauthTransactionCookieName: 'app_a_oauth_transaction',
  localSessionCookieName: 'app_a_local_session',
};

const validEnvironment = {
  AUTH_SERVER_PUBLIC_URL: 'http://localhost:3001',
  AUTH_SERVER_INTERNAL_URL: 'http://auth-server:3001',
  APP_A_CLIENT_ID: 'app-a',
  APP_A_CLIENT_SECRET: 'test-only-client-secret',
  APP_A_REDIRECT_URI: 'http://localhost:3002/auth/callback',
  APP_A_LAUNCH_URL: 'http://localhost:3002',
};

describe('validateRelyingApplicationEnvironment for App A', () => {
  it('separates browser and server-to-server Auth Provider URLs', () => {
    const config = validateRelyingApplicationEnvironment(validEnvironment, names);

    assert.deepEqual(config, {
      applicationName: 'App A',
      clientId: 'app-a',
      clientSecret: 'test-only-client-secret',
      redirectUri: 'http://localhost:3002/auth/callback',
      launchUrl: 'http://localhost:3002/',
      authorizeUrl: 'http://localhost:3001/authorize',
      tokenUrl: 'http://auth-server:3001/token',
      userInfoUrl: 'http://auth-server:3001/userinfo',
      oauthTransactionCookieName: 'app_a_oauth_transaction',
      oauthTransactionCookieSecure: false,
      localSessionCookieName: 'app_a_local_session',
      localSessionCookieSecure: false,
      localSessionTtlSeconds: 28_800,
    });
  });

  it('validates an explicit local session lifetime', () => {
    assert.equal(
      validateRelyingApplicationEnvironment(
        { ...validEnvironment, LOCAL_SESSION_TTL_SECONDS: '3600' },
        names,
      ).localSessionTtlSeconds,
      3600,
    );

    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          { ...validEnvironment, LOCAL_SESSION_TTL_SECONDS: '120' },
          names,
        ),
      /LOCAL_SESSION_TTL_SECONDS harus berada pada rentang 300-86400 detik/,
    );
  });

  it('rejects a missing or undersized confidential client secret', () => {
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          { ...validEnvironment, APP_A_CLIENT_SECRET: 'short' },
          names,
        ),
      /APP_A_CLIENT_SECRET harus berisi 16-1024 karakter/,
    );
  });

  it('rejects a redirect URI outside the application origin', () => {
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          {
            ...validEnvironment,
            APP_A_REDIRECT_URI: 'https://attacker.example/auth/callback',
          },
          names,
        ),
      /APP_A_REDIRECT_URI harus exact callback/,
    );
  });

  it('rejects credentials embedded in an Auth Provider URL', () => {
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          {
            ...validEnvironment,
            AUTH_SERVER_INTERNAL_URL: 'http://user:password@auth-server:3001',
          },
          names,
        ),
      /AUTH_SERVER_INTERNAL_URL harus berupa base URL HTTP\(S\) yang valid/,
    );
  });
});
