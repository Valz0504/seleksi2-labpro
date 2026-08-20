import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CentralSessionService } from '../auth/central-session.service';
import {
  AuthenticatedLoginResult,
  RequestContext,
  SessionUser,
} from '../auth/auth.types';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/opaque-token';
import { PrismaService } from '../database/prisma.service';
import { MfaSecretCryptoService } from './mfa-secret-crypto.service';
import { TotpService } from './totp.service';

export type MfaLoginIntent = 'API' | 'OAUTH' | 'ADMIN';

export interface StartedMfaChallenge {
  challengeToken: string;
  expiresAt: Date;
}

export interface CompletedMfaChallenge extends AuthenticatedLoginResult {
  intent: MfaLoginIntent;
  returnTo: string | null;
}

class MfaChallengeRaceError extends Error {}

@Injectable()
export class MfaChallengeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly secretCryptoService: MfaSecretCryptoService,
    private readonly totpService: TotpService,
    private readonly centralSessionService: CentralSessionService,
  ) {}

  async start(
    userId: string,
    intent: MfaLoginIntent,
    returnTo: string | null,
  ): Promise<StartedMfaChallenge> {
    const challengeToken = generateOpaqueToken();
    const now = new Date();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'MFA_CHALLENGE_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.mfaLoginChallenge.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      await transaction.mfaLoginChallenge.create({
        data: {
          tokenHash: hashOpaqueToken(challengeToken),
          userId,
          intent,
          returnTo,
          expiresAt,
        },
      });
    });

    return { challengeToken, expiresAt };
  }

  async complete(
    challengeToken: string,
    code: string,
    allowedIntents: readonly MfaLoginIntent[],
    context: RequestContext,
  ): Promise<CompletedMfaChallenge> {
    const now = new Date();
    const maxAttempts = this.configService.getOrThrow<number>(
      'MFA_CHALLENGE_MAX_ATTEMPTS',
    );
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { tokenHash: hashOpaqueToken(challengeToken) },
      select: {
        id: true,
        userId: true,
        intent: true,
        returnTo: true,
        attemptCount: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            mfaTotp: {
              select: {
                secretCiphertext: true,
                secretIv: true,
                secretAuthTag: true,
                enabledAt: true,
                lastUsedTimeStep: true,
              },
            },
          },
        },
      },
    });

    if (
      !challenge ||
      challenge.usedAt !== null ||
      challenge.expiresAt <= now ||
      challenge.attemptCount >= maxAttempts ||
      !allowedIntents.includes(challenge.intent) ||
      challenge.user.status !== 'ACTIVE' ||
      (challenge.intent === 'ADMIN' && challenge.user.role !== 'ADMIN') ||
      challenge.user.mfaTotp?.enabledAt == null
    ) {
      await this.recordFailure(challenge, now, maxAttempts, context);
      throw this.invalidMfaException();
    }

    const mfa = challenge.user.mfaTotp;
    let acceptedTimeStep: bigint | null = null;

    try {
      const secret = this.secretCryptoService.decrypt(
        {
          ciphertext: Buffer.from(mfa.secretCiphertext),
          iv: Buffer.from(mfa.secretIv),
          authTag: Buffer.from(mfa.secretAuthTag),
        },
        challenge.userId,
      );
      acceptedTimeStep = this.totpService.validateToken(
        secret,
        code,
        now.getTime(),
      );
    } catch {
      acceptedTimeStep = null;
    }

    if (
      acceptedTimeStep === null ||
      (mfa.lastUsedTimeStep !== null &&
        acceptedTimeStep <= mfa.lastUsedTimeStep)
    ) {
      await this.recordFailure(challenge, now, maxAttempts, context);
      throw this.invalidMfaException();
    }

    const user: SessionUser = {
      id: challenge.user.id,
      name: challenge.user.name,
      email: challenge.user.email,
      role: challenge.user.role,
    };

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const claimedChallenge = await transaction.mfaLoginChallenge.updateMany(
          {
            where: {
              id: challenge.id,
              usedAt: null,
              expiresAt: { gt: now },
              attemptCount: { lt: maxAttempts },
              user: {
                status: 'ACTIVE',
                ...(challenge.intent === 'ADMIN' ? { role: 'ADMIN' } : {}),
              },
            },
            data: { usedAt: now },
          },
        );
        const advancedTimeStep = await transaction.userMfaTotp.updateMany({
          where: {
            userId: challenge.userId,
            enabledAt: { not: null },
            OR: [
              { lastUsedTimeStep: null },
              { lastUsedTimeStep: { lt: acceptedTimeStep } },
            ],
          },
          data: { lastUsedTimeStep: acceptedTimeStep },
        });

        if (claimedChallenge.count !== 1 || advancedTimeStep.count !== 1) {
          throw new MfaChallengeRaceError();
        }

        const session = await this.centralSessionService.issue(
          transaction,
          user,
          context,
          'password_totp',
        );

        await transaction.auditLog.create({
          data: {
            eventType: 'mfa_success',
            actorId: user.id,
            userId: user.id,
            sessionId: session.session.id,
            result: 'SUCCESS',
            metadata: { factor: 'totp' },
            ipAddress: context.ipAddress,
          },
        });

        return {
          ...session,
          intent: challenge.intent,
          returnTo: challenge.returnTo,
        };
      });
    } catch (error: unknown) {
      if (!(error instanceof MfaChallengeRaceError)) {
        throw error;
      }

      await this.recordFailure(challenge, now, maxAttempts, context);
      throw this.invalidMfaException();
    }
  }

  private async recordFailure(
    challenge: {
      id: string;
      userId: string;
      usedAt: Date | null;
      expiresAt: Date;
    } | null,
    now: Date,
    maxAttempts: number,
    context: RequestContext,
  ): Promise<void> {
    if (!challenge) {
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      if (challenge.usedAt === null && challenge.expiresAt > now) {
        await transaction.mfaLoginChallenge.updateMany({
          where: {
            id: challenge.id,
            usedAt: null,
            attemptCount: { lt: maxAttempts },
          },
          data: { attemptCount: { increment: 1 } },
        });
      }

      await transaction.auditLog.create({
        data: {
          eventType: 'mfa_failed',
          userId: challenge.userId,
          result: 'FAILED',
          metadata: { reason: 'verification_rejected' },
          ipAddress: context.ipAddress,
        },
      });
    });
  }

  private invalidMfaException(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'MFA_VERIFICATION_FAILED',
        message: 'Kode MFA tidak valid atau challenge telah berakhir',
      },
    });
  }
}
