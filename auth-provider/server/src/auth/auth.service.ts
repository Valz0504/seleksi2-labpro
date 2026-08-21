import { Injectable, UnauthorizedException } from '@nestjs/common';
import { hashOpaqueToken } from '../common/security/opaque-token';
import { verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { OutboxEventService } from '../event-processing/outbox-event.service';
import { MfaChallengeService } from '../mfa/mfa-challenge.service';
import { CentralSessionService } from './central-session.service';
import { ControlPanelAccessService } from './control-panel-access.service';
import type {
  CurrentSession,
  LoginRequirements,
  LoginResult,
  RequestContext,
  SessionUser,
} from './auth.types';

export type { CurrentSession } from './auth.types';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$XDyNdawOPXncbz5b8iOaqg$OyX7SkbwX0qefYtwDIdiOtu9qTpwjpZp9ggu78Jn6ZY';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxEventService: OutboxEventService,
    private readonly mfaChallengeService: MfaChallengeService,
    private readonly centralSessionService: CentralSessionService,
    private readonly controlPanelAccessService: ControlPanelAccessService,
  ) {}

  async login(
    email: string,
    password: string,
    context: RequestContext,
    requirements: LoginRequirements = {},
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        status: true,
        mfaTotp: { select: { enabledAt: true } },
      },
    });
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    const credentialsAreValid =
      user !== null && passwordMatches && user.status === 'ACTIVE';
    const canAccessControlPanel = credentialsAreValid
      ? await this.controlPanelAccessService.canAccess(user.id)
      : false;

    if (
      !user ||
      !credentialsAreValid ||
      (requirements.requireControlPanelAccess && !canAccessControlPanel)
    ) {
      await this.prisma.auditLog.create({
        data: {
          eventType: 'LoginFailed',
          userId: user?.id,
          result: 'FAILED',
          metadata: { reason: 'invalid_credentials' },
          ipAddress: context.ipAddress,
        },
      });

      throw this.invalidCredentialsException();
    }

    const sessionUser: SessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      canAccessControlPanel,
    };

    if (user.mfaTotp?.enabledAt != null) {
      const intent = requirements.intent ?? { type: 'API' as const };
      const challenge = await this.mfaChallengeService.start(
        user.id,
        intent.type,
        intent.type === 'OAUTH' ? intent.returnTo : null,
      );

      return {
        status: 'mfa_required',
        challengeToken: challenge.challengeToken,
        expiresAt: challenge.expiresAt,
      };
    }

    return this.prisma.$transaction((transaction) =>
      this.centralSessionService.issue(
        transaction,
        sessionUser,
        context,
        'password',
      ),
    );
  }

  completeMfaLogin(
    challengeToken: string,
    code: string,
    allowedIntents: readonly ('API' | 'OAUTH' | 'ADMIN')[],
    context: RequestContext,
  ) {
    return this.mfaChallengeService.complete(
      challengeToken,
      code,
      allowedIntents,
      context,
    );
  }

  async getCurrentSession(sessionToken: string): Promise<CurrentSession> {
    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const now = new Date();
    const session = await this.prisma.ssoSession.findUnique({
      where: { sessionTokenHash },
      select: {
        id: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        lastActivityAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (
      !session ||
      session.status !== 'ACTIVE' ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      if (
        session?.status === 'ACTIVE' &&
        session.revokedAt === null &&
        session.expiresAt <= now
      ) {
        await this.prisma.ssoSession.updateMany({
          where: {
            id: session.id,
            status: 'ACTIVE',
            revokedAt: null,
            expiresAt: { lte: now },
          },
          data: { status: 'EXPIRED' },
        });
      }

      throw this.invalidSessionException();
    }

    const touchedSession = await this.prisma.ssoSession.updateMany({
      where: {
        id: session.id,
        status: 'ACTIVE',
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { lastActivityAt: now },
    });

    if (touchedSession.count !== 1) {
      throw this.invalidSessionException();
    }

    const canAccessControlPanel =
      await this.controlPanelAccessService.canAccess(session.user.id);

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        canAccessControlPanel,
      },
      session: {
        id: session.id,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastActivityAt: now,
      },
    };
  }

  async logout(
    sessionToken: string,
    context: Pick<RequestContext, 'ipAddress'> = {},
  ): Promise<void> {
    const session = await this.prisma.ssoSession.findUnique({
      where: { sessionTokenHash: hashOpaqueToken(sessionToken) },
      select: { id: true, userId: true },
    });

    if (!session) {
      return;
    }

    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const revokedSession = await transaction.ssoSession.updateMany({
        where: {
          id: session.id,
          status: 'ACTIVE',
          revokedAt: null,
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokeReason: 'sso_logout',
        },
      });

      if (revokedSession.count !== 1) {
        return;
      }

      await transaction.accessToken.updateMany({
        where: {
          ssoSessionId: session.id,
          status: 'ACTIVE',
          revokedAt: null,
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });
      await this.outboxEventService.enqueue(transaction, {
        eventType: 'SessionRevoked',
        userId: session.userId,
        centralSessionId: session.id,
        applicationId: null,
        reason: 'sso_logout',
        occurredAt: now,
        metadata: { source: 'auth_logout' },
      });
      await transaction.auditLog.create({
        data: {
          eventType: 'Logout',
          actorId: session.userId,
          userId: session.userId,
          sessionId: session.id,
          result: 'SUCCESS',
          metadata: { reason: 'sso_logout' },
          ipAddress: context.ipAddress,
        },
      });
    });
  }

  private invalidCredentialsException(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau password tidak valid',
      },
    });
  }

  private invalidSessionException(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'INVALID_SESSION',
        message: 'Central session tidak valid atau telah berakhir',
      },
    });
  }
}
