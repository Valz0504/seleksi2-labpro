import { Injectable } from '@nestjs/common';
import { OutboxEventService } from '../event-processing/outbox-event.service';
import { Prisma } from '../generated/prisma/client';

interface RevokedSession {
  id: string;
  userId: string;
}

interface LostApplicationAccess {
  userId: string;
  applicationId: string;
}

@Injectable()
export class AdminRevocationService {
  constructor(private readonly outboxEventService: OutboxEventService) {}

  async revokeUsersForDeactivation(
    transaction: Prisma.TransactionClient,
    userIds: string[],
    now: Date,
  ): Promise<void> {
    const revokedSessions = await this.revokeSecurityState(
      transaction,
      userIds,
      'user_deactivated',
      now,
    );

    await this.outboxEventService.enqueueMany(
      transaction,
      revokedSessions.map((session) => ({
        eventType: 'SessionRevoked',
        userId: session.userId,
        centralSessionId: session.id,
        applicationId: null,
        reason: 'user_deactivated',
        occurredAt: now,
        metadata: { source: 'admin_user_deactivation' },
      })),
    );
  }

  async revokeUsersForPasswordChange(
    transaction: Prisma.TransactionClient,
    userIds: string[],
    now: Date,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return;
    }

    await this.revokeSecurityState(
      transaction,
      uniqueUserIds,
      'password_changed',
      now,
    );
    await this.outboxEventService.enqueueMany(
      transaction,
      uniqueUserIds.map((userId) => ({
        eventType: 'PasswordChanged',
        userId,
        centralSessionId: null,
        applicationId: null,
        reason: 'password_changed',
        occurredAt: now,
        metadata: { source: 'admin_password_change' },
      })),
    );
  }

  async revokeUsersWhoLostAccess(
    transaction: Prisma.TransactionClient,
    candidateUserIds: string[],
    applicationIds: string[],
    now: Date,
  ): Promise<string[]> {
    const uniqueUserIds = [...new Set(candidateUserIds)];
    const uniqueApplicationIds = [...new Set(applicationIds)];
    const lostAccess: LostApplicationAccess[] = [];

    for (const userId of uniqueUserIds) {
      for (const applicationId of uniqueApplicationIds) {
        const remainingPolicy =
          await transaction.applicationGroupPolicy.findFirst({
            where: {
              applicationId,
              effect: 'ALLOW',
              group: {
                userGroups: {
                  some: { userId },
                },
              },
            },
            select: { id: true },
          });

        if (!remainingPolicy) {
          lostAccess.push({ userId, applicationId });
        }
      }
    }

    const revokedUserIds = [...new Set(lostAccess.map(({ userId }) => userId))];
    await this.revokeSecurityState(
      transaction,
      revokedUserIds,
      'access_policy_changed',
      now,
    );
    await this.outboxEventService.enqueueMany(
      transaction,
      lostAccess.map(({ userId, applicationId }) => ({
        eventType: 'AccessPolicyChanged',
        userId,
        centralSessionId: null,
        applicationId,
        reason: 'access_policy_changed',
        occurredAt: now,
        metadata: { source: 'admin_access_change' },
      })),
    );

    return revokedUserIds;
  }

  private async revokeSecurityState(
    transaction: Prisma.TransactionClient,
    userIds: string[],
    reason: string,
    now: Date,
  ): Promise<RevokedSession[]> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return [];
    }

    const revokedSessions = await transaction.ssoSession.updateManyAndReturn({
      where: {
        userId: { in: uniqueUserIds },
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokeReason: reason,
      },
      select: { id: true, userId: true },
    });
    await transaction.accessToken.updateMany({
      where: {
        userId: { in: uniqueUserIds },
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: {
        status: 'REVOKED',
        revokedAt: now,
      },
    });
    await transaction.mfaLoginChallenge.updateMany({
      where: {
        userId: { in: uniqueUserIds },
        usedAt: null,
      },
      data: { usedAt: now },
    });

    return revokedSessions;
  }
}
