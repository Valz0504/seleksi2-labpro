import { cookies } from 'next/headers';
import { buildInternalAuthServerUrl } from './auth-server-url';

export interface AdminSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER';
  };
  session: {
    id: string;
    status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    createdAt: string;
    expiresAt: string;
    lastActivityAt: string | null;
  };
}

export interface AdminOverview {
  users: number | null;
  groups: number | null;
  applications: number | null;
}

async function getCookieHeader(): Promise<string> {
  return (await cookies()).toString();
}

export async function getCurrentAdminSession(): Promise<AdminSession | null> {
  try {
    const response = await fetch(buildInternalAuthServerUrl('/auth/session'), {
      headers: { cookie: await getCookieHeader() },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminSession;
  } catch {
    return null;
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const cookieHeader = await getCookieHeader();
  const [users, groups, applications] = await Promise.all([
    getCollectionCount('/admin/users', cookieHeader),
    getCollectionCount('/admin/groups', cookieHeader),
    getCollectionCount('/admin/applications', cookieHeader),
  ]);

  return { users, groups, applications };
}

async function getCollectionCount(path: string, cookieHeader: string): Promise<number | null> {
  try {
    const response = await fetch(buildInternalAuthServerUrl(path), {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;

    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}
