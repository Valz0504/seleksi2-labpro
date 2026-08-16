import 'server-only';

import { cookies } from 'next/headers';
import { buildInternalAuthServerUrl } from './auth-server-url';

export interface PublicSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER';
  };
  session: {
    id: string;
    status: 'ACTIVE';
    createdAt: string;
    expiresAt: string;
    lastActivityAt: string | null;
  };
}

export type PublicSessionLookup =
  { status: 'active'; session: PublicSession } | { status: 'none' } | { status: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isRole(value: unknown): value is PublicSession['user']['role'] {
  return value === 'ADMIN' || value === 'USER';
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || isDateString(value);
}

function readPublicSession(value: unknown): PublicSession | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) {
    return null;
  }

  const { user, session } = value;
  if (
    typeof user.id !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.email !== 'string' ||
    !isRole(user.role) ||
    typeof session.id !== 'string' ||
    session.status !== 'ACTIVE' ||
    !isDateString(session.createdAt) ||
    !isDateString(session.expiresAt) ||
    !isNullableDateString(session.lastActivityAt)
  ) {
    return null;
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    session: {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
    },
  };
}

export async function getPublicSession(): Promise<PublicSessionLookup> {
  try {
    const response = await fetch(buildInternalAuthServerUrl('/auth/session'), {
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
    });

    if (response.status === 401) {
      return { status: 'none' };
    }

    if (!response.ok) {
      return { status: 'unavailable' };
    }

    const session = readPublicSession((await response.json()) as unknown);

    return session ? { status: 'active', session } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
