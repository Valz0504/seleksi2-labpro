import { Injectable } from '@nestjs/common';
import { hashOpaqueToken } from '../common/security/opaque-token';
import { PrismaService } from '../database/prisma.service';
import { UserInfoError } from './userinfo.error';

const OPAQUE_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REQUIRED_SCOPE = 'profile';

export interface UserInfoResult {
  sub: string;
  name: string;
  email: string;
  groups: string[];
  aud: string;
  clientId: string;
  centralSessionId: string;
  scope: string;
}

@Injectable()
export class UserInfoService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(
    authorizationHeader: string | undefined,
  ): Promise<UserInfoResult> {
    const accessToken = this.parseBearerToken(authorizationHeader);

    if (!accessToken) {
      throw new UserInfoError();
    }

    const tokenHash = hashOpaqueToken(accessToken);
    const now = new Date();

    const profile = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.accessToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          applicationId: true,
          ssoSessionId: true,
          scopes: true,
          status: true,
          expiresAt: true,
          revokedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              userGroups: {
                select: { group: { select: { name: true } } },
                orderBy: { group: { name: 'asc' } },
              },
            },
          },
          application: {
            select: {
              id: true,
              clientId: true,
              status: true,
            },
          },
          ssoSession: {
            select: {
              id: true,
              status: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
        },
      });

      if (!token) {
        throw new UserInfoError();
      }

      const scopes = this.readScopes(token.scopes);

      if (
        token.status !== 'ACTIVE' ||
        token.revokedAt !== null ||
        token.expiresAt <= now ||
        token.user.status !== 'ACTIVE' ||
        token.application.status !== 'ACTIVE' ||
        token.ssoSession.status !== 'ACTIVE' ||
        token.ssoSession.revokedAt !== null ||
        token.ssoSession.expiresAt <= now ||
        !scopes.includes(REQUIRED_SCOPE)
      ) {
        const elapsedActiveToken =
          token.status === 'ACTIVE' &&
          token.revokedAt === null &&
          token.expiresAt <= now;

        if (elapsedActiveToken) {
          await transaction.accessToken.updateMany({
            where: {
              id: token.id,
              status: 'ACTIVE',
              revokedAt: null,
              expiresAt: { lte: now },
            },
            data: { status: 'EXPIRED' },
          });

          return null;
        }

        throw new UserInfoError();
      }

      const matchingPolicy = await transaction.applicationGroupPolicy.findFirst(
        {
          where: {
            applicationId: token.applicationId,
            effect: 'ALLOW',
            group: {
              userGroups: {
                some: { userId: token.userId },
              },
            },
          },
          select: { id: true },
        },
      );

      if (!matchingPolicy) {
        throw new UserInfoError();
      }

      const activeSession = await transaction.ssoSession.updateMany({
        where: {
          id: token.ssoSessionId,
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { lastActivityAt: now },
      });

      if (activeSession.count !== 1) {
        throw new UserInfoError();
      }

      const activeToken = await transaction.accessToken.updateMany({
        where: {
          id: token.id,
          applicationId: token.applicationId,
          ssoSessionId: token.ssoSessionId,
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: 'ACTIVE' },
      });

      if (activeToken.count !== 1) {
        throw new UserInfoError();
      }

      return {
        sub: token.user.id,
        name: token.user.name,
        email: token.user.email,
        groups: token.user.userGroups.map(({ group }) => group.name),
        aud: token.application.clientId,
        clientId: token.application.clientId,
        centralSessionId: token.ssoSession.id,
        scope: scopes.join(' '),
      };
    });

    if (!profile) {
      throw new UserInfoError();
    }

    return profile;
  }

  private parseBearerToken(
    authorizationHeader: string | undefined,
  ): string | null {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(
      authorizationHeader ?? '',
    );

    return match?.[1] && OPAQUE_ACCESS_TOKEN_PATTERN.test(match[1])
      ? match[1]
      : null;
  }

  private readScopes(value: unknown): string[] {
    return Array.isArray(value) &&
      value.every((scope): scope is string => typeof scope === 'string')
      ? value
      : [];
  }
}
