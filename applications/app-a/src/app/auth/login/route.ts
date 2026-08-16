import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  createOAuthLoginInitiation,
  OAUTH_TRANSACTION_TTL_SECONDS,
} from '@/src/lib/auth/oauth-login';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';

export const runtime = 'nodejs';

function invalidOriginResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'INVALID_LOGIN_ORIGIN',
        message: 'Permintaan login tidak berasal dari aplikasi yang valid',
        requestId: randomUUID(),
      },
    },
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  );
}

export function POST(request: Request): NextResponse {
  const config = getRelyingApplicationConfig();
  const expectedOrigin = new URL(config.launchUrl).origin;

  if (
    request.headers.get('origin') !== expectedOrigin ||
    new URL(request.url).origin !== expectedOrigin
  ) {
    return invalidOriginResponse();
  }

  const initiation = createOAuthLoginInitiation(config);
  const response = NextResponse.redirect(initiation.authorizationUrl, 303);
  response.cookies.set({
    name: config.oauthTransactionCookieName,
    value: initiation.cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.oauthTransactionCookieSecure,
    path: '/auth/callback',
    maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
    priority: 'high',
  });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
