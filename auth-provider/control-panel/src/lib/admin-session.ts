import { cookies } from 'next/headers';
import { fetchAdminApi } from './admin-api';
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

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: 'ADMIN' | 'USER';
  createdAt: string;
  updatedAt: string;
  userGroups: Array<{
    id: string;
    createdAt: string;
    group: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userGroups: Array<{
    id: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      status: 'ACTIVE' | 'INACTIVE';
    };
  }>;
  policies: Array<{
    id: string;
    effect: 'ALLOW';
    createdAt: string;
    application: {
      id: string;
      name: string;
      clientId: string;
      status: 'ACTIVE' | 'INACTIVE';
    };
  }>;
}

export interface AdminApplication {
  id: string;
  name: string;
  clientId: string;
  status: 'ACTIVE' | 'INACTIVE';
  launchUrl: string | null;
  logoutNotificationUrl: string;
  createdAt: string;
  updatedAt: string;
  redirectUris: Array<{
    id: string;
    redirectUri: string;
    createdAt: string;
  }>;
  groupPolicies: Array<{
    id: string;
    effect: 'ALLOW';
    createdAt: string;
    group: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
}

export type AdminUserLookup =
  { status: 'success'; user: AdminUser } | { status: 'not_found' } | { status: 'error' };

export type AdminGroupLookup =
  { status: 'success'; group: AdminGroup } | { status: 'not_found' } | { status: 'error' };

export type AdminApplicationLookup =
  | { status: 'success'; application: AdminApplication }
  | { status: 'not_found' }
  | { status: 'error' };

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
  const [users, groups, applications] = await Promise.all([
    getCollectionCount('/admin/users'),
    getCollectionCount('/admin/groups'),
    getCollectionCount('/admin/applications'),
  ]);

  return { users, groups, applications };
}

export async function getAdminUsers(): Promise<AdminUser[] | null> {
  try {
    const response = await fetchAdminApi('/admin/users');

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;

    return Array.isArray(body) ? (body as AdminUser[]) : null;
  } catch {
    return null;
  }
}

export async function getAdminGroups(): Promise<AdminGroup[] | null> {
  try {
    const response = await fetchAdminApi('/admin/groups');

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;

    return Array.isArray(body) ? (body as AdminGroup[]) : null;
  } catch {
    return null;
  }
}

export async function getAdminApplications(): Promise<AdminApplication[] | null> {
  try {
    const response = await fetchAdminApi('/admin/applications');

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;

    return Array.isArray(body) ? (body as AdminApplication[]) : null;
  } catch {
    return null;
  }
}

export async function getAdminApplication(applicationId: string): Promise<AdminApplicationLookup> {
  try {
    const response = await fetchAdminApi(
      `/admin/applications/${encodeURIComponent(applicationId)}`,
    );

    if (response.status === 404) {
      return { status: 'not_found' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    const body = (await response.json()) as unknown;

    if (typeof body !== 'object' || body === null || !('id' in body)) {
      return { status: 'error' };
    }

    return { status: 'success', application: body as AdminApplication };
  } catch {
    return { status: 'error' };
  }
}

export async function getAdminGroup(groupId: string): Promise<AdminGroupLookup> {
  try {
    const response = await fetchAdminApi(`/admin/groups/${encodeURIComponent(groupId)}`);

    if (response.status === 404) {
      return { status: 'not_found' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    const body = (await response.json()) as unknown;

    if (typeof body !== 'object' || body === null || !('id' in body)) {
      return { status: 'error' };
    }

    return { status: 'success', group: body as AdminGroup };
  } catch {
    return { status: 'error' };
  }
}

export async function getAdminUser(userId: string): Promise<AdminUserLookup> {
  try {
    const response = await fetchAdminApi(`/admin/users/${encodeURIComponent(userId)}`);

    if (response.status === 404) {
      return { status: 'not_found' };
    }

    if (!response.ok) {
      return { status: 'error' };
    }

    const body = (await response.json()) as unknown;

    if (typeof body !== 'object' || body === null || !('id' in body)) {
      return { status: 'error' };
    }

    return { status: 'success', user: body as AdminUser };
  } catch {
    return { status: 'error' };
  }
}

async function getCollectionCount(path: string): Promise<number | null> {
  try {
    const response = await fetchAdminApi(path);

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as unknown;

    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}
