import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/opaque-token';
import { PrismaService } from '../database/prisma.service';
import { AuthService, type CurrentSession } from '../auth/auth.service';
import { AuthorizationRequestError } from './authorization-request.error';

const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface AuthorizationRequestInput {
  clientId: unknown;
  redirectUri: unknown;
  responseType: unknown;
  state: unknown;
  codeChallenge: unknown;
  codeChallengeMethod: unknown;
}

interface AuthorizationRequestContext {
  ipAddress?: string;
}

export interface AuthorizationResult {
  redirectUrl: string;
}

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async authorize(
    input: AuthorizationRequestInput,
    sessionToken: string | null,
    context: AuthorizationRequestContext,
  ): Promise<AuthorizationResult> {
    const clientId = this.readBoundedString(input.clientId, 255);
    const redirectUri = this.readBoundedString(input.redirectUri, 2048);

    if (
      !clientId ||
      !redirectUri ||
      !this.isSupportedRedirectUri(redirectUri)
    ) {
      throw this.untrustedRequestError();
    }

    const application = await this.prisma.application.findUnique({
      where: { clientId },
      select: {
        id: true,
        status: true,
        redirectUris: {
          where: { redirectUri },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!application || application.redirectUris.length !== 1) {
      throw this.untrustedRequestError();
    }

    const state = this.readBoundedString(input.state, 512);
    const trustedErrorOptions = { redirectUri, state: state ?? undefined };

    if (application.status !== 'ACTIVE') {
      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'unauthorized_client',
        message: 'Aplikasi tidak dapat memulai authorization flow',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (input.responseType !== 'code') {
      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'unsupported_response_type',
        message: 'response_type harus bernilai code',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (!state || state.length < 16) {
      throw new AuthorizationRequestError({
        redirectUri,
        code: 'invalid_request',
        message: 'state harus berupa nilai acak dengan minimal 16 karakter',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (
      input.codeChallengeMethod !== 'S256' ||
      typeof input.codeChallenge !== 'string' ||
      !PKCE_S256_CHALLENGE_PATTERN.test(input.codeChallenge)
    ) {
      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'invalid_request',
        message: 'PKCE S256 tidak valid',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (!sessionToken) {
      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'login_required',
        message: 'Central session diperlukan',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }

    let currentSession: CurrentSession;

    try {
      currentSession = await this.authService.getCurrentSession(sessionToken);
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }

      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'login_required',
        message: 'Central session tidak valid atau telah berakhir',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }

    const matchingPolicy = await this.prisma.applicationGroupPolicy.findFirst({
      where: {
        applicationId: application.id,
        effect: 'ALLOW',
        group: {
          userGroups: {
            some: { userId: currentSession.user.id },
          },
        },
      },
      select: { id: true },
    });

    if (!matchingPolicy) {
      await this.prisma.auditLog.create({
        data: {
          eventType: 'PolicyDenied',
          actorId: currentSession.user.id,
          userId: currentSession.user.id,
          applicationId: application.id,
          sessionId: currentSession.session.id,
          result: 'DENIED',
          metadata: {
            clientId,
            reason: 'missing_group_policy',
          },
          ipAddress: context.ipAddress,
        },
      });

      throw new AuthorizationRequestError({
        ...trustedErrorOptions,
        code: 'access_denied',
        message: 'User tidak memiliki akses ke aplikasi',
        statusCode: HttpStatus.FORBIDDEN,
      });
    }

    const authorizationCode = generateOpaqueToken();
    const now = new Date();
    const ttlSeconds = this.configService.getOrThrow<number>(
      'AUTHORIZATION_CODE_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.prisma.$transaction([
      this.prisma.authorizationCode.create({
        data: {
          codeHash: hashOpaqueToken(authorizationCode),
          userId: currentSession.user.id,
          applicationId: application.id,
          ssoSessionId: currentSession.session.id,
          redirectUri,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: 'S256',
          expiresAt,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          eventType: 'AuthorizationCodeIssued',
          actorId: currentSession.user.id,
          userId: currentSession.user.id,
          applicationId: application.id,
          sessionId: currentSession.session.id,
          result: 'SUCCESS',
          metadata: { clientId },
          ipAddress: context.ipAddress,
        },
      }),
    ]);

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', authorizationCode);
    callbackUrl.searchParams.set('state', state);

    return { redirectUrl: callbackUrl.toString() };
  }

  private readBoundedString(value: unknown, maxLength: number): string | null {
    return typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maxLength
      ? value
      : null;
  }

  private isSupportedRedirectUri(value: string): boolean {
    try {
      const redirectUri = new URL(value);

      return (
        (redirectUri.protocol === 'http:' ||
          redirectUri.protocol === 'https:') &&
        redirectUri.username === '' &&
        redirectUri.password === '' &&
        redirectUri.hash === ''
      );
    } catch {
      return false;
    }
  }

  private untrustedRequestError(): AuthorizationRequestError {
    return new AuthorizationRequestError({
      code: 'invalid_request',
      message: 'Authorization request tidak valid',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }
}
