import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { hashSecret } from '../common/security/secret';
import { PrismaService } from '../database/prisma.service';
import { TokenRequestError } from './token-request.error';
import { TokenService, type TokenRequestInput } from './token.service';

describe('TokenService', () => {
  const now = Date.now();
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const authorizationCodeId = '44444444-4444-4444-8444-444444444444';
  const clientSecret = 'correct-client-secret';
  const codeVerifier = 'v'.repeat(43);
  const codeChallenge = createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');
  const validRequest: TokenRequestInput = {
    grantType: 'authorization_code',
    code: 'c'.repeat(43),
    redirectUri: 'http://localhost:3002/auth/callback',
    codeVerifier,
  };
  const basicAuthorization = `Basic ${Buffer.from(
    `app-a:${clientSecret}`,
  ).toString('base64')}`;
  const transaction = {
    ssoSession: {
      updateMany: jest.fn(),
    },
    authorizationCode: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    accessToken: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    application: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'ACCESS_TOKEN_TTL_SECONDS') {
        return 900;
      }

      throw new Error(`Unexpected config key: ${name}`);
    }),
  };
  let tokenService: TokenService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      status: 'ACTIVE',
      clientSecretHash: hashSecret(clientSecret),
    });
    transaction.authorizationCode.findUnique.mockResolvedValue({
      id: authorizationCodeId,
      userId,
      applicationId,
      ssoSessionId: sessionId,
      redirectUri: validRequest.redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(now + 300_000),
      usedAt: null,
      user: { status: 'ACTIVE' },
      application: { status: 'ACTIVE' },
      ssoSession: {
        status: 'ACTIVE',
        expiresAt: new Date(now + 3_600_000),
        revokedAt: null,
      },
    });
    transaction.ssoSession.updateMany.mockResolvedValue({ count: 1 });
    transaction.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
    transaction.accessToken.create.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    tokenService = module.get(TokenService);
  });

  it('atomically consumes a code and stores only the access-token hash', async () => {
    const result = await tokenService.exchange(
      validRequest,
      basicAuthorization,
      { ipAddress: '127.0.0.1' },
    );
    const tokenCreateCalls = transaction.accessToken.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            tokenHash: string;
            applicationId: string;
            ssoSessionId: string;
            expiresAt: Date;
          };
        },
      ]
    >;
    const tokenData = tokenCreateCalls[0]?.[0].data;

    expect(result).toMatchObject({
      accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      tokenType: 'Bearer',
      expiresIn: 900,
      scope: 'profile',
    });
    expect(tokenData).toMatchObject({
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
      applicationId,
      ssoSessionId: sessionId,
    });
    expect(tokenData?.tokenHash).not.toBe(result.accessToken);
    expect(transaction.authorizationCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: authorizationCodeId,
          usedAt: null,
        }) as unknown,
        data: { usedAt: expect.any(Date) as Date },
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });

  it('rejects invalid client authentication before looking up the code', async () => {
    const wrongAuthorization = `Basic ${Buffer.from(
      'app-a:wrong-secret',
    ).toString('base64')}`;

    await expect(
      tokenService.exchange(validRequest, wrongAuthorization, {}),
    ).rejects.toMatchObject({ code: 'invalid_client', statusCode: 401 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(transaction.authorizationCode.findUnique).not.toHaveBeenCalled();
  });

  it('does not consume a code when redirect URI or PKCE does not match', async () => {
    await expect(
      tokenService.exchange(
        { ...validRequest, redirectUri: 'http://localhost:3003/auth/callback' },
        basicAuthorization,
        {},
      ),
    ).rejects.toBeInstanceOf(TokenRequestError);
    expect(transaction.authorizationCode.updateMany).not.toHaveBeenCalled();

    jest.clearAllMocks();
    prisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      status: 'ACTIVE',
      clientSecretHash: hashSecret(clientSecret),
    });
    transaction.authorizationCode.findUnique.mockResolvedValue({
      id: authorizationCodeId,
      userId,
      applicationId,
      ssoSessionId: sessionId,
      redirectUri: validRequest.redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(now + 300_000),
      usedAt: null,
      user: { status: 'ACTIVE' },
      application: { status: 'ACTIVE' },
      ssoSession: {
        status: 'ACTIVE',
        expiresAt: new Date(now + 3_600_000),
        revokedAt: null,
      },
    });
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    await expect(
      tokenService.exchange(
        { ...validRequest, codeVerifier: 'x'.repeat(43) },
        basicAuthorization,
        {},
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(transaction.authorizationCode.updateMany).not.toHaveBeenCalled();
  });

  it('does not issue a token when another request already claimed the code', async () => {
    transaction.authorizationCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      tokenService.exchange(validRequest, basicAuthorization, {}),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(transaction.accessToken.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not consume the code when the session is revoked concurrently', async () => {
    transaction.ssoSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      tokenService.exchange(validRequest, basicAuthorization, {}),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(transaction.authorizationCode.updateMany).not.toHaveBeenCalled();
    expect(transaction.accessToken.create).not.toHaveBeenCalled();
  });

  it('rejects a code whose central session has been revoked', async () => {
    transaction.authorizationCode.findUnique.mockResolvedValue({
      id: authorizationCodeId,
      userId,
      applicationId,
      ssoSessionId: sessionId,
      redirectUri: validRequest.redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      expiresAt: new Date(now + 300_000),
      usedAt: null,
      user: { status: 'ACTIVE' },
      application: { status: 'ACTIVE' },
      ssoSession: {
        status: 'REVOKED',
        expiresAt: new Date(now + 3_600_000),
        revokedAt: new Date(),
      },
    });

    await expect(
      tokenService.exchange(validRequest, basicAuthorization, {}),
    ).rejects.toMatchObject({ code: 'invalid_grant' });
    expect(transaction.authorizationCode.updateMany).not.toHaveBeenCalled();
  });
});
