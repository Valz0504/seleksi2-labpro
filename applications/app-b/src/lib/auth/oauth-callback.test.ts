import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RelyingApplicationConfig } from '../config/environment';
import { exchangeAuthorizationCode, fetchUserInfo, readAuthorizationCode } from './oauth-callback';

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

describe('App B OAuth callback', () => {
  it('accepts one exact state and authorization code', () => {
    const state = 's'.repeat(43);
    const code = 'c'.repeat(43);

    assert.equal(readAuthorizationCode(new URLSearchParams({ state, code }), state), code);
    assert.equal(
      readAuthorizationCode(new URLSearchParams({ state: 'x'.repeat(43), code }), state),
      null,
    );
    assert.equal(
      readAuthorizationCode(
        new URLSearchParams(`state=${state}&state=${state}&code=${code}`),
        state,
      ),
      null,
    );
  });

  it('exchanges the code through the back channel with Basic auth and PKCE', async () => {
    const accessToken = 't'.repeat(43);
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 900,
          scope: 'profile',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await exchangeAuthorizationCode(
      'c'.repeat(43),
      'v'.repeat(64),
      config,
      fetchMock,
    );
    const headers = new Headers(capturedInit?.headers);
    const body = capturedInit?.body;

    assert.equal(capturedUrl, config.tokenUrl);
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(
      headers.get('Authorization'),
      `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    );
    assert.ok(body instanceof URLSearchParams);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), config.redirectUri);
    assert.equal(body.get('code_verifier'), 'v'.repeat(64));
    assert.deepEqual(result, { accessToken, expiresIn: 900 });
  });

  it('accepts audience-bound userinfo and rejects another audience', async () => {
    const payload = {
      sub: '11111111-1111-4111-8111-111111111111',
      name: 'Example User',
      email: 'user@example.com',
      groups: ['app-b-users'],
      aud: 'app-b',
      client_id: 'app-b',
      central_session_id: '22222222-2222-4222-8222-222222222222',
      scope: 'profile',
    };
    const fetchUserInfoResponse =
      (body: object): typeof fetch =>
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

    assert.deepEqual(await fetchUserInfo('t'.repeat(43), config, fetchUserInfoResponse(payload)), {
      externalUserId: payload.sub,
      name: payload.name,
      email: payload.email,
      groups: payload.groups,
      centralSessionId: payload.central_session_id,
    });
    await assert.rejects(
      fetchUserInfo('t'.repeat(43), config, fetchUserInfoResponse({ ...payload, aud: 'app-a' })),
      /invalid user information/,
    );
  });
});
