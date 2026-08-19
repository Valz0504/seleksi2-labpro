import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../common/security/opaque-token';
import { verifySecret } from '../common/security/secret';
import { PrismaService } from '../database/prisma.service';
import { TokenRequestError } from './token-request.error';

const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const DEFAULT_SCOPES = ['profile'] as const;
const DUMMY_CLIENT_SECRET_HASH = '0'.repeat(64);

export interface TokenRequestInput {
  grantType: unknown;
  code: unknown;
  redirectUri: unknown;
  codeVerifier: unknown;
}

interface TokenRequestContext {
  ipAddress?: string;
}

export interface TokenResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async exchange(
    input: TokenRequestInput,
    authorizationHeader: string | undefined,
    context: TokenRequestContext,
  ): Promise<TokenResult> {
    if (input.grantType !== 'authorization_code') {
      throw new TokenRequestError(
        'unsupported_grant_type',
        'grant_type harus bernilai authorization_code',
      );
    }

    const code = this.readBoundedString(input.code, 512);
    const redirectUri = this.readBoundedString(input.redirectUri, 2048);
    const codeVerifier = this.readBoundedString(input.codeVerifier, 128);

    if (
      !code ||
      !redirectUri ||
      !codeVerifier ||
      !PKCE_VERIFIER_PATTERN.test(codeVerifier)
    ) {
      throw new TokenRequestError(
        'invalid_request',
        'Token request tidak valid',
      );
    }

    const clientCredentials = this.parseBasicCredentials(authorizationHeader);

    if (!clientCredentials) {
      throw this.invalidClientError();
    }

    const application = await this.prisma.application.findUnique({
      where: { clientId: clientCredentials.clientId },
      select: {
        id: true,
        status: true,
        clientSecretHash: true,
      },
    });
    const clientSecretMatches = verifySecret(
      clientCredentials.clientSecret,
      application?.clientSecretHash ?? DUMMY_CLIENT_SECRET_HASH,
    );

    if (
      !application ||
      application.status !== 'ACTIVE' ||
      !application.clientSecretHash ||
      !clientSecretMatches
    ) {
      throw this.invalidClientError();
    }

    const accessToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(accessToken);
    const codeHash = hashOpaqueToken(code);
    const now = new Date();
    const expiresIn = this.configService.getOrThrow<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + expiresIn * 1000);

    await this.prisma.$transaction(async (transaction) => {
      const authorizationCode = await transaction.authorizationCode.findUnique({
        where: { codeHash },
        select: {
          id: true,
          userId: true,
          applicationId: true,
          ssoSessionId: true,
          redirectUri: true,
          codeChallenge: true,
          codeChallengeMethod: true,
          expiresAt: true,
          usedAt: true,
          user: { select: { status: true } },
          application: { select: { status: true } },
          ssoSession: {
            select: {
              status: true,
              expiresAt: true,
              revokedAt: true,
            },
          },
        },
      });

      if (
        !authorizationCode ||
        authorizationCode.applicationId !== application.id ||
        authorizationCode.redirectUri !== redirectUri ||
        authorizationCode.codeChallengeMethod !== 'S256' ||
        authorizationCode.usedAt !== null ||
        authorizationCode.expiresAt <= now ||
        authorizationCode.user.status !== 'ACTIVE' ||
        authorizationCode.application.status !== 'ACTIVE' ||
        authorizationCode.ssoSession.status !== 'ACTIVE' ||
        authorizationCode.ssoSession.revokedAt !== null ||
        authorizationCode.ssoSession.expiresAt <= now ||
        !this.verifyPkce(codeVerifier, authorizationCode.codeChallenge)
      ) {
        throw this.invalidGrantError();
      }

      const activeSession = await transaction.ssoSession.updateMany({
        where: {
          id: authorizationCode.ssoSessionId,
          status: 'ACTIVE',
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { lastActivityAt: now },
      });

      if (activeSession.count !== 1) {
        throw this.invalidGrantError();
      }

      const claimedCode = await transaction.authorizationCode.updateMany({
        where: {
          id: authorizationCode.id,
          applicationId: application.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claimedCode.count !== 1) {
        throw this.invalidGrantError();
      }

      await transaction.accessToken.create({
        data: {
          tokenHash,
          userId: authorizationCode.userId,
          applicationId: application.id,
          ssoSessionId: authorizationCode.ssoSessionId,
          scopes: [...DEFAULT_SCOPES],
          expiresAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          eventType: 'AccessTokenIssued',
          actorId: authorizationCode.userId,
          userId: authorizationCode.userId,
          applicationId: application.id,
          sessionId: authorizationCode.ssoSessionId,
          result: 'SUCCESS',
          metadata: {
            clientId: clientCredentials.clientId,
            scopes: [...DEFAULT_SCOPES],
          },
          ipAddress: context.ipAddress,
        },
      });
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      scope: DEFAULT_SCOPES.join(' '),
    };
  }

  private parseBasicCredentials(
    authorizationHeader: string | undefined,
  ): { clientId: string; clientSecret: string } | null {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(
      authorizationHeader ?? '',
    );

    if (!match?.[1]) {
      return null;
    }

    const decodedCredentials = Buffer.from(match[1], 'base64').toString('utf8');
    const separatorIndex = decodedCredentials.indexOf(':');

    if (
      separatorIndex <= 0 ||
      separatorIndex === decodedCredentials.length - 1
    ) {
      return null;
    }

    return {
      clientId: decodedCredentials.slice(0, separatorIndex),
      clientSecret: decodedCredentials.slice(separatorIndex + 1),
    };
  }

  private verifyPkce(codeVerifier: string, expectedChallenge: string): boolean {
    const actualChallenge = createHash('sha256')
      .update(codeVerifier, 'ascii')
      .digest('base64url');
    const actualChallengeBuffer = Buffer.from(actualChallenge, 'ascii');
    const expectedChallengeBuffer = Buffer.from(expectedChallenge, 'ascii');

    return (
      actualChallengeBuffer.length === expectedChallengeBuffer.length &&
      timingSafeEqual(actualChallengeBuffer, expectedChallengeBuffer)
    );
  }

  private readBoundedString(value: unknown, maxLength: number): string | null {
    return typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maxLength
      ? value
      : null;
  }

  private invalidClientError(): TokenRequestError {
    return new TokenRequestError(
      'invalid_client',
      'Client authentication gagal',
      HttpStatus.UNAUTHORIZED,
    );
  }

  private invalidGrantError(): TokenRequestError {
    return new TokenRequestError(
      'invalid_grant',
      'Authorization code tidak valid atau telah berakhir',
    );
  }
}
