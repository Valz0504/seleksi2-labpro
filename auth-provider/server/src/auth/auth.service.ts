import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/opaque-token';
import { verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$XDyNdawOPXncbz5b8iOaqg$OyX7SkbwX0qefYtwDIdiOtu9qTpwjpZp9ggu78Jn6ZY';

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface SessionDetails {
  id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: Date;
  expiresAt: Date;
}

export interface LoginResult {
  sessionToken: string;
  user: SessionUser;
  session: SessionDetails;
}

export interface CurrentSession {
  user: SessionUser;
  session: SessionDetails & {
    lastActivityAt: Date | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    context: RequestContext,
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
        role: true,
      },
    });
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      throw this.invalidCredentialsException();
    }

    const sessionToken = generateOpaqueToken();
    const now = new Date();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'SSO_SESSION_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const session = await this.prisma.ssoSession.create({
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

    return {
      sessionToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      session,
    };
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
            role: true,
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

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
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

  async logout(sessionToken: string): Promise<void> {
    const session = await this.prisma.ssoSession.findUnique({
      where: { sessionTokenHash: hashOpaqueToken(sessionToken) },
      select: { id: true },
    });

    if (!session) {
      return;
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.ssoSession.updateMany({
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
      }),
      this.prisma.accessToken.updateMany({
        where: {
          ssoSessionId: session.id,
          status: 'ACTIVE',
          revokedAt: null,
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      }),
    ]);
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
