import { cookies } from 'next/headers';
import { buildInternalAuthServerUrl } from './auth-server-url';

export async function fetchAdminApi(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/admin/')) {
    throw new Error('Admin API path harus diawali /admin/');
  }

  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('cookie', (await cookies()).toString());

  return fetch(buildInternalAuthServerUrl(path), {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function readAdminErrorCode(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as unknown;

  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return null;
  }

  const error = body.error;

  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  return typeof error.code === 'string' ? error.code : null;
}
