import type { OAuthUserInfo } from './oauth-callback';
import { canRevokeLocalSession, classifyLocalSession } from './local-session-state';
import {
  generateLocalSessionToken,
  hashLocalSessionToken,
  isLocalSessionToken,
} from './session-token';
import { getLocalDatabase } from '../database/client';

export interface IssuedLocalSession {
  token: string;
  id: string;
  expiresAt: Date;
}

export interface ActiveLocalSession {
  state: 'ACTIVE';
  profile: {
    externalUserId: string;
    name: string;
    email: string;
    groups: string[];
    syncedAt: Date;
  };
  session: {
    id: string;
    centralSessionId: string;
    status: 'ACTIVE';
    createdAt: Date;
    expiresAt: Date;
    lastActivityAt: Date;
  };
}

export type LocalSessionResolution =
  ActiveLocalSession | { state: 'EXPIRED' | 'REVOKED' | 'INVALID' };

export type LocalSessionRevocationResult = 'REVOKED' | 'NO_CHANGE';

function readCachedGroups(value: unknown): string[] {
  return Array.isArray(value) && value.every((group): group is string => typeof group === 'string')
    ? value
    : [];
}

export async function resolveLocalSession(
  token: string,
  now = new Date(),
): Promise<LocalSessionResolution> {
  if (!isLocalSessionToken(token)) {
    return { state: 'INVALID' };
  }

  const database = getLocalDatabase();
  const sessionTokenHash = hashLocalSessionToken(token);

  return database.$transaction<LocalSessionResolution>(async (transaction) => {
    const session = await transaction.localSession.findUnique({
      where: { sessionTokenHash },
      select: {
        id: true,
        centralSessionId: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        lastActivityAt: true,
        revokedAt: true,
        profile: {
          select: {
            externalUserId: true,
            name: true,
            email: true,
            groups: true,
            syncedAt: true,
          },
        },
      },
    });

    if (!session) {
      return { state: 'INVALID' };
    }

    const lifecycleState = classifyLocalSession(session, now);

    if (lifecycleState === 'EXPIRED') {
      const expiredSession = await transaction.localSession.updateMany({
        where: {
          id: session.id,
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { lte: now },
        },
        data: { status: 'EXPIRED' },
      });

      if (expiredSession.count === 1) {
        await transaction.activityLog.create({
          data: {
            eventType: 'LocalSessionExpired',
            result: 'SUCCESS',
            message: 'Local session ditandai kedaluwarsa saat diperiksa',
            externalUserId: session.profile.externalUserId,
            localSessionId: session.id,
          },
        });
      }

      return { state: 'EXPIRED' };
    }

    if (lifecycleState === 'REVOKED') {
      return { state: 'REVOKED' };
    }

    const activeSession = await transaction.localSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { lastActivityAt: now },
    });

    if (activeSession.count !== 1) {
      const currentSession = await transaction.localSession.findUnique({
        where: { id: session.id },
        select: { status: true, expiresAt: true, revokedAt: true },
      });

      if (!currentSession) {
        return { state: 'INVALID' };
      }

      const currentState = classifyLocalSession(currentSession, now);

      return currentState === 'ACTIVE' ? { state: 'INVALID' } : { state: currentState };
    }

    return {
      state: 'ACTIVE',
      profile: {
        externalUserId: session.profile.externalUserId,
        name: session.profile.name,
        email: session.profile.email,
        groups: readCachedGroups(session.profile.groups),
        syncedAt: session.profile.syncedAt,
      },
      session: {
        id: session.id,
        centralSessionId: session.centralSessionId,
        status: 'ACTIVE',
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastActivityAt: now,
      },
    };
  });
}

export async function issueLocalSession(
  profile: OAuthUserInfo,
  ttlSeconds: number,
  requestId: string,
  now = new Date(),
): Promise<IssuedLocalSession> {
  const database = getLocalDatabase();
  const token = generateLocalSessionToken();
  const sessionTokenHash = hashLocalSessionToken(token);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const localSession = await database.$transaction(async (transaction) => {
    await transaction.profileCache.upsert({
      where: { externalUserId: profile.externalUserId },
      create: {
        externalUserId: profile.externalUserId,
        name: profile.name,
        email: profile.email,
        groups: profile.groups,
        syncedAt: now,
      },
      update: {
        name: profile.name,
        email: profile.email,
        groups: profile.groups,
        syncedAt: now,
      },
    });

    const session = await transaction.localSession.create({
      data: {
        sessionTokenHash,
        externalUserId: profile.externalUserId,
        centralSessionId: profile.centralSessionId,
        expiresAt,
        lastActivityAt: now,
      },
      select: { id: true },
    });

    await transaction.activityLog.createMany({
      data: [
        {
          eventType: 'AuthorizationCodeReceived',
          result: 'SUCCESS',
          message: 'Authorization code diterima dan divalidasi oleh callback',
          externalUserId: profile.externalUserId,
          localSessionId: session.id,
          requestId,
        },
        {
          eventType: 'UserInfoFetched',
          result: 'SUCCESS',
          message: 'Profil user berhasil diperoleh dari Auth Provider',
          externalUserId: profile.externalUserId,
          localSessionId: session.id,
          requestId,
        },
        {
          eventType: 'LocalSessionCreated',
          result: 'SUCCESS',
          message: 'Local session aktif berhasil dibuat',
          externalUserId: profile.externalUserId,
          localSessionId: session.id,
          requestId,
        },
      ],
    });

    return session;
  });

  return { token, id: localSession.id, expiresAt };
}

export async function revokeLocalSession(
  token: string,
  requestId: string,
  now = new Date(),
): Promise<LocalSessionRevocationResult> {
  if (!isLocalSessionToken(token)) {
    return 'NO_CHANGE';
  }

  const database = getLocalDatabase();
  const sessionTokenHash = hashLocalSessionToken(token);

  return database.$transaction<LocalSessionRevocationResult>(async (transaction) => {
    const session = await transaction.localSession.findUnique({
      where: { sessionTokenHash },
      select: {
        id: true,
        externalUserId: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session || !canRevokeLocalSession(session, now)) {
      return 'NO_CHANGE';
    }

    const revokedSession = await transaction.localSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokeReason: 'local_logout',
      },
    });

    if (revokedSession.count !== 1) {
      return 'NO_CHANGE';
    }

    await transaction.activityLog.create({
      data: {
        eventType: 'LocalLogout',
        result: 'SUCCESS',
        message: 'Local session dicabut melalui logout aplikasi',
        externalUserId: session.externalUserId,
        localSessionId: session.id,
        requestId,
      },
    });

    return 'REVOKED';
  });
}

export async function recordCallbackFailure(requestId: string, reason: string): Promise<void> {
  try {
    await getLocalDatabase().activityLog.create({
      data: {
        eventType: 'OAuthCallbackFailed',
        result: 'FAILURE',
        message: 'Callback login tidak dapat diselesaikan',
        requestId,
        metadata: { reason },
      },
    });
  } catch {
    // Callback tetap harus menghasilkan error aman ketika penyimpanan log sedang gagal.
  }
}
