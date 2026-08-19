import { type NextRequest, NextResponse } from 'next/server';
import { clearLocalSessionCookie } from '@/src/lib/auth/local-session-cookie';
import { resolveLocalSession } from '@/src/lib/auth/local-session';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';

export const runtime = 'nodejs';

function redirectToApplication(notice?: 'expired' | 'revoked' | 'invalid'): NextResponse {
  const config = getRelyingApplicationConfig();
  const destination = new URL(config.launchUrl);

  if (notice) {
    destination.searchParams.set('session_notice', notice);
  }

  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');

  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getRelyingApplicationConfig();
  const token = request.cookies.get(config.localSessionCookieName)?.value;

  if (!token) {
    return redirectToApplication();
  }

  try {
    const resolution = await resolveLocalSession(token);

    if (resolution.state === 'ACTIVE') {
      return redirectToApplication();
    }

    const notice =
      resolution.state === 'EXPIRED'
        ? 'expired'
        : resolution.state === 'REVOKED'
          ? 'revoked'
          : 'invalid';
    const response = redirectToApplication(notice);
    clearLocalSessionCookie(response, config);

    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'LOCAL_SESSION_UNAVAILABLE',
          message: 'Local session belum dapat diperiksa. Silakan coba kembali.',
        },
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      },
    );
  }
}
