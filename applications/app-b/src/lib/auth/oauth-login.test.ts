import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import type { RelyingApplicationConfig } from '../config/environment';
import {
  createOAuthLoginInitiation,
  OAUTH_TRANSACTION_TTL_SECONDS,
  readOAuthLoginTransaction,
} from './oauth-login';

const config: RelyingApplicationConfig = {
  applicationName: 'App B',
  clientId: 'app-b',
  clientSecret: 'test-only-client-secret',
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
};
const issuedAt = new Date('2026-08-16T00:00:00.000Z');

describe('App B OAuth login initiation', () => {
  it('creates a complete authorization request without exposing the client secret', () => {
    const initiation = createOAuthLoginInitiation(config, issuedAt);
    const authorizationUrl = new URL(initiation.authorizationUrl);

    assert.equal(authorizationUrl.origin, 'http://localhost:3001');
    assert.equal(authorizationUrl.pathname, '/authorize');
    assert.equal(authorizationUrl.searchParams.get('client_id'), 'app-b');
    assert.equal(authorizationUrl.searchParams.get('redirect_uri'), config.redirectUri);
    assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
    assert.match(authorizationUrl.searchParams.get('state') ?? '', /^[A-Za-z0-9_-]{43}$/);
    assert.match(authorizationUrl.searchParams.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);
    assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(initiation.authorizationUrl.includes(config.clientSecret), false);
  });

  it('encrypts and restores the short-lived state and PKCE verifier', () => {
    const initiation = createOAuthLoginInitiation(config, issuedAt);
    const transaction = readOAuthLoginTransaction(initiation.cookieValue, config, issuedAt);

    assert.ok(transaction);
    assert.equal(transaction.state, new URL(initiation.authorizationUrl).searchParams.get('state'));
    assert.match(transaction.codeVerifier, /^[A-Za-z0-9._~-]{43,128}$/);
    assert.equal(initiation.cookieValue.includes(transaction.state), false);
    assert.equal(initiation.cookieValue.includes(transaction.codeVerifier), false);
    assert.equal(
      createHash('sha256').update(transaction.codeVerifier, 'ascii').digest('base64url'),
      new URL(initiation.authorizationUrl).searchParams.get('code_challenge'),
    );
  });

  it('rejects tampered, expired, or differently bound transactions', () => {
    const initiation = createOAuthLoginInitiation(config, issuedAt);
    const replacement = initiation.cookieValue.endsWith('A') ? 'B' : 'A';
    const tampered = `${initiation.cookieValue.slice(0, -1)}${replacement}`;
    const expiredAt = new Date(issuedAt.getTime() + (OAUTH_TRANSACTION_TTL_SECONDS + 1) * 1000);

    assert.equal(readOAuthLoginTransaction(tampered, config, issuedAt), null);
    assert.equal(readOAuthLoginTransaction(initiation.cookieValue, config, expiredAt), null);
    assert.equal(
      readOAuthLoginTransaction(initiation.cookieValue, { ...config, clientId: 'app-a' }, issuedAt),
      null,
    );
  });
});
