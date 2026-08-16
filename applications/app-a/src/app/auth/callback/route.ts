import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import {
  exchangeAuthorizationCode,
  fetchUserInfo,
  readAuthorizationCode,
} from '@/src/lib/auth/oauth-callback';
import { issueLocalSession, recordCallbackFailure } from '@/src/lib/auth/local-session';
import { readOAuthLoginTransaction } from '@/src/lib/auth/oauth-login';
import type { RelyingApplicationConfig } from '@/src/lib/config/environment';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';

export const runtime = 'nodejs';

function expireOAuthTransactionCookie(
  response: NextResponse,
  config: RelyingApplicationConfig,
): void {
  response.cookies.set({
    name: config.oauthTransactionCookieName,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.oauthTransactionCookieSecure,
    path: '/auth/callback',
    maxAge: 0,
    expires: new Date(0),
    priority: 'high',
  });
}

function finalizeResponse(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

async function callbackFailureResponse(
  config: RelyingApplicationConfig,
  requestId: string,
  reason: string,
  recordFailure = true,
): Promise<NextResponse> {
  if (recordFailure) {
    await recordCallbackFailure(requestId, reason);
  }

  const destination = new URL(config.launchUrl);
  destination.searchParams.set('login_error', 'oauth_callback_failed');
  destination.searchParams.set('request_id', requestId);
  const response = NextResponse.redirect(destination, 303);
  expireOAuthTransactionCookie(response, config);

  return finalizeResponse(response);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getRelyingApplicationConfig();
  const requestId = randomUUID();

  if (request.nextUrl.origin !== new URL(config.launchUrl).origin) {
    return callbackFailureResponse(config, requestId, 'invalid_callback_origin', false);
  }

  const transactionCookie = request.cookies.get(config.oauthTransactionCookieName)?.value;
  const transaction = transactionCookie
    ? readOAuthLoginTransaction(transactionCookie, config)
    : null;

  if (!transaction) {
    return callbackFailureResponse(config, requestId, 'missing_or_invalid_transaction', false);
  }

  const authorizationCode = readAuthorizationCode(request.nextUrl.searchParams, transaction.state);

  if (!authorizationCode) {
    return callbackFailureResponse(config, requestId, 'invalid_state_or_authorization_response');
  }

  try {
    const token = await exchangeAuthorizationCode(
      authorizationCode,
      transaction.codeVerifier,
      config,
    );
    const profile = await fetchUserInfo(token.accessToken, config);
    const localSession = await issueLocalSession(profile, config.localSessionTtlSeconds, requestId);
    const response = NextResponse.redirect(config.launchUrl, 303);

    expireOAuthTransactionCookie(response, config);
    response.cookies.set({
      name: config.localSessionCookieName,
      value: localSession.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.localSessionCookieSecure,
      path: '/',
      maxAge: config.localSessionTtlSeconds,
      expires: localSession.expiresAt,
      priority: 'high',
    });

    return finalizeResponse(response);
  } catch {
    return callbackFailureResponse(config, requestId, 'provider_or_persistence_failure');
  }
}
