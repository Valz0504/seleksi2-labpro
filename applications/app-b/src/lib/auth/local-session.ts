import type { OAuthUserInfo } from './oauth-callback';
import { generateLocalSessionToken, hashLocalSessionToken } from './session-token';
import { getLocalDatabase } from '../database/client';

export interface IssuedLocalSession {
  token: string;
  id: string;
  expiresAt: Date;
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
