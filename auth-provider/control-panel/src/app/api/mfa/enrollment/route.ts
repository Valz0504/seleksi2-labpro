import { cookies } from 'next/headers';
import { buildInternalAuthServerUrl } from '@/lib/auth-server-url';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = (await request.json()) as unknown;
  } catch {
    return Response.json(
      { error: { code: 'INVALID_REQUEST', message: 'Permintaan tidak valid' } },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (
    !isRecord(body) ||
    !['start', 'confirm', 'regenerate', 'disable'].includes(
      typeof body.action === 'string' ? body.action : '',
    )
  ) {
    return Response.json(
      { error: { code: 'INVALID_REQUEST', message: 'Permintaan tidak valid' } },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (body.action === 'confirm' && (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code))) {
    return Response.json(
      { error: { code: 'INVALID_REQUEST', message: 'Kode harus terdiri dari enam digit' } },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (
    (body.action === 'regenerate' || body.action === 'disable') &&
    (typeof body.password !== 'string' ||
      body.password.length < 8 ||
      body.password.length > 1024 ||
      typeof body.code !== 'string' ||
      !/^(?:\d{6}|[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2})$/i.test(body.code))
  ) {
    return Response.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Password dan kode MFA harus diisi dengan benar',
        },
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const endpoint =
    body.action === 'start'
      ? '/auth/mfa/enroll/start'
      : body.action === 'confirm'
        ? '/auth/mfa/enroll/confirm'
        : body.action === 'regenerate'
          ? '/auth/mfa/recovery/regenerate'
          : '/auth/mfa';
  const method = body.action === 'disable' ? 'DELETE' : 'POST';
  const requestBody =
    body.action === 'start'
      ? {}
      : body.action === 'confirm'
        ? { code: body.code }
        : { password: body.password, code: body.code };

  try {
    const response = await fetch(buildInternalAuthServerUrl(endpoint), {
      method,
      headers: {
        cookie: (await cookies()).toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });
    const responseBody = await response.text();

    return new Response(response.status === 204 ? null : responseBody, {
      status: response.status,
      headers:
        response.status === 204
          ? NO_STORE_HEADERS
          : {
              ...NO_STORE_HEADERS,
              'Content-Type': response.headers.get('content-type') ?? 'application/json',
            },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'MFA_SERVICE_UNAVAILABLE',
          message: 'Layanan MFA belum dapat dihubungi',
        },
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
