import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class AdminRevocationService {
  async revokeUsers(
    transaction: Prisma.TransactionClient,
    userIds: string[],
    reason: string,
    now: Date,
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return;
    }

    await transaction.ssoSession.updateMany({
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
  }

  async revokeUsersWhoLostAccess(
    transaction: Prisma.TransactionClient,
    candidateUserIds: string[],
    applicationIds: string[],
    now: Date,
  ): Promise<string[]> {
    const uniqueUserIds = [...new Set(candidateUserIds)];
    const uniqueApplicationIds = [...new Set(applicationIds)];
    const usersWhoLostAccess = new Set<string>();

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
          usersWhoLostAccess.add(userId);
          break;
        }
      }
    }

    const revokedUserIds = [...usersWhoLostAccess];
    await this.revokeUsers(
      transaction,
      revokedUserIds,
      'access_policy_changed',
      now,
    );

    return revokedUserIds;
  }
}
