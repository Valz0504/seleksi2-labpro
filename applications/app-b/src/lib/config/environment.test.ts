import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRelyingApplicationEnvironment } from './environment';

const names = {
  applicationName: 'App B',
  clientId: 'APP_B_CLIENT_ID',
  clientSecret: 'APP_B_CLIENT_SECRET',
  redirectUri: 'APP_B_REDIRECT_URI',
  launchUrl: 'APP_B_LAUNCH_URL',
  oauthTransactionCookieName: 'app_b_oauth_transaction',
  localSessionCookieName: 'app_b_local_session',
};

const validEnvironment = {
  AUTH_SERVER_PUBLIC_URL: 'http://localhost:3001',
  AUTH_SERVER_INTERNAL_URL: 'http://auth-server:3001',
  APP_B_CLIENT_ID: 'app-b',
  APP_B_CLIENT_SECRET: 'test-only-client-secret',
  INTERNAL_SERVICE_SECRET: 'test-only-internal-service-secret',
  APP_B_REDIRECT_URI: 'http://localhost:3003/auth/callback',
  APP_B_LAUNCH_URL: 'http://localhost:3003',
};

describe('validateRelyingApplicationEnvironment for App B', () => {
  it('separates browser and server-to-server Auth Provider URLs', () => {
    const config = validateRelyingApplicationEnvironment(validEnvironment, names);

    assert.deepEqual(config, {
      applicationName: 'App B',
      clientId: 'app-b',
      clientSecret: 'test-only-client-secret',
      internalServiceSecret: 'test-only-internal-service-secret',
      redirectUri: 'http://localhost:3003/auth/callback',
      launchUrl: 'http://localhost:3003/',
      authorizeUrl: 'http://localhost:3001/authorize',
      tokenUrl: 'http://auth-server:3001/token',
      userInfoUrl: 'http://auth-server:3001/userinfo',
      oauthTransactionCookieName: 'app_b_oauth_transaction',
      oauthTransactionCookieSecure: false,
      localSessionCookieName: 'app_b_local_session',
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
          { ...validEnvironment, APP_B_CLIENT_SECRET: 'short' },
          names,
        ),
      /APP_B_CLIENT_SECRET harus berisi 16-1024 karakter/,
    );
  });

  it('requires an opaque internal service secret', () => {
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          { ...validEnvironment, INTERNAL_SERVICE_SECRET: 'short' },
          names,
        ),
      /INTERNAL_SERVICE_SECRET harus berisi 16-1024 karakter/,
    );
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          { ...validEnvironment, INTERNAL_SERVICE_SECRET: 'internal secret with spaces' },
          names,
        ),
      /INTERNAL_SERVICE_SECRET harus berupa opaque secret tanpa whitespace/,
    );
  });

  it('rejects a redirect URI outside the application origin', () => {
    assert.throws(
      () =>
        validateRelyingApplicationEnvironment(
          {
            ...validEnvironment,
            APP_B_REDIRECT_URI: 'https://attacker.example/auth/callback',
          },
          names,
        ),
      /APP_B_REDIRECT_URI harus exact callback/,
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
