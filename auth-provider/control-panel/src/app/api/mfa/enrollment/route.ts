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

  if (!isRecord(body) || (body.action !== 'start' && body.action !== 'confirm')) {
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

  const endpoint = body.action === 'start' ? '/auth/mfa/enroll/start' : '/auth/mfa/enroll/confirm';

  try {
    const response = await fetch(buildInternalAuthServerUrl(endpoint), {
      method: 'POST',
      headers: {
        cookie: (await cookies()).toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body.action === 'start' ? {} : { code: body.code }),
      cache: 'no-store',
    });
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: {
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
