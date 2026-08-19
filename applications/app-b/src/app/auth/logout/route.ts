import { randomUUID } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { clearLocalSessionCookie } from '@/src/lib/auth/local-session-cookie';
import { revokeLocalSession } from '@/src/lib/auth/local-session';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';

export const runtime = 'nodejs';

function applicationRedirect(
  notice: 'logged_out' | 'local_logout_failed',
  requestId?: string,
): NextResponse {
  const config = getRelyingApplicationConfig();
  const destination = new URL(config.launchUrl);

  if (notice === 'logged_out') {
    destination.searchParams.set('session_notice', notice);
  } else {
    destination.searchParams.set('logout_error', notice);
  }

  if (requestId) {
    destination.searchParams.set('request_id', requestId);
  }

  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}

function invalidOriginResponse(requestId: string): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'INVALID_LOGOUT_ORIGIN',
        message: 'Permintaan logout tidak berasal dari aplikasi yang valid',
        requestId,
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const config = getRelyingApplicationConfig();
  const expectedOrigin = new URL(config.launchUrl).origin;

  if (
    request.headers.get('origin') !== expectedOrigin ||
    new URL(request.url).origin !== expectedOrigin
  ) {
    return invalidOriginResponse(requestId);
  }

  const token = request.cookies.get(config.localSessionCookieName)?.value;

  try {
    if (token) {
      await revokeLocalSession(token, requestId);
    }

    const response = applicationRedirect('logged_out');
    clearLocalSessionCookie(response, config);

    return response;
  } catch {
    return applicationRedirect('local_logout_failed', requestId);
  }
}
