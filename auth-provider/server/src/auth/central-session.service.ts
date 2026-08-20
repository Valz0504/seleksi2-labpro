import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/opaque-token';
import { Prisma } from '../generated/prisma/client';
import {
  AuthenticatedLoginResult,
  RequestContext,
  SessionUser,
} from './auth.types';

type AuthenticationMethod = 'password' | 'password_totp';

@Injectable()
export class CentralSessionService {
  constructor(private readonly configService: ConfigService) {}

  async issue(
    transaction: Prisma.TransactionClient,
    user: SessionUser,
    context: RequestContext,
    authenticationMethod: AuthenticationMethod,
  ): Promise<AuthenticatedLoginResult> {
    const sessionToken = generateOpaqueToken();
    const now = new Date();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'SSO_SESSION_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const session = await transaction.ssoSession.create({
      data: {
        userId: user.id,
        sessionTokenHash: hashOpaqueToken(sessionToken),
        expiresAt,
        lastActivityAt: now,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        eventType: 'LoginSucceeded',
        actorId: user.id,
        userId: user.id,
        sessionId: session.id,
        result: 'SUCCESS',
        metadata: { authenticationMethod },
        ipAddress: context.ipAddress,
      },
    });

    return {
      status: 'authenticated',
      sessionToken,
      user,
      session,
    };
  }
}
