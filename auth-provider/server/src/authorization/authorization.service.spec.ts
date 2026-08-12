import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, type CurrentSession } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { AuthorizationRequestError } from './authorization-request.error';
import {
  AuthorizationService,
  type AuthorizationRequestInput,
} from './authorization.service';

describe('AuthorizationService', () => {
  const redirectUri = 'http://localhost:3002/auth/callback';
  const validRequest: AuthorizationRequestInput = {
    clientId: 'app-a',
    redirectUri,
    responseType: 'code',
    state: 'random-state-with-enough-entropy',
    codeChallenge: 'A'.repeat(43),
    codeChallengeMethod: 'S256',
  };
  const currentSession: CurrentSession = {
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Active User',
      email: 'active@example.com',
      role: 'USER',
    },
    session: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ACTIVE',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
      lastActivityAt: new Date(),
    },
  };
  const prisma = {
    application: {
      findUnique: jest.fn(),
    },
    applicationGroupPolicy: {
      findFirst: jest.fn(),
    },
    authorizationCode: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const authService = {
    getCurrentSession: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'AUTHORIZATION_CODE_TTL_SECONDS') {
        return 300;
      }

      throw new Error(`Unexpected config key: ${name}`);
    }),
  };
  let authorizationService: AuthorizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.application.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'ACTIVE',
      redirectUris: [{ id: '44444444-4444-4444-8444-444444444444' }],
    });
    prisma.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
    });
    prisma.authorizationCode.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);
    authService.getCurrentSession.mockResolvedValue(currentSession);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authorizationService = module.get(AuthorizationService);
  });

  it('issues a short-lived code while storing only its hash', async () => {
    const result = await authorizationService.authorize(
      validRequest,
      'valid-session-token',
      { ipAddress: '127.0.0.1' },
    );
    const callbackUrl = new URL(result.redirectUrl);
    const rawCode = callbackUrl.searchParams.get('code');
    const createCalls = prisma.authorizationCode.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            codeHash: string;
            codeChallenge: string;
            redirectUri: string;
            expiresAt: Date;
          };
        },
      ]
    >;
    const createData = createCalls[0]?.[0].data;

    expect(rawCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callbackUrl.searchParams.get('state')).toBe(validRequest.state);
    expect(createData).toMatchObject({
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
      codeChallenge: validRequest.codeChallenge,
      redirectUri,
    });
    expect(createData?.codeHash).not.toBe(rawCode);
    expect(createData?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('never redirects when client and exact redirect URI cannot be proven', async () => {
    prisma.application.findUnique.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      status: 'ACTIVE',
      redirectUris: [],
    });

    const error = await authorizationService
      .authorize(
        {
          ...validRequest,
          redirectUri: `${redirectUri}.attacker.example`,
        },
        'valid-session-token',
        {},
      )
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(AuthorizationRequestError);
    expect((error as AuthorizationRequestError).redirectUrl).toBeNull();
    expect(authService.getCurrentSession).not.toHaveBeenCalled();
    expect(prisma.authorizationCode.create).not.toHaveBeenCalled();
  });

  it('returns login_required only through a previously trusted callback', async () => {
    const error = await authorizationService
      .authorize(validRequest, null, {})
      .catch((caughtError: unknown) => caughtError);
    const authorizationError = error as AuthorizationRequestError;
    const errorRedirectUrl = new URL(authorizationError.redirectUrl ?? '');

    expect(authorizationError.code).toBe('login_required');
    expect(errorRedirectUrl.origin + errorRedirectUrl.pathname).toBe(
      redirectUri,
    );
    expect(errorRedirectUrl.searchParams.get('state')).toBe(validRequest.state);
  });

  it('rejects malformed PKCE before reading the central session', async () => {
    const error = await authorizationService
      .authorize(
        { ...validRequest, codeChallenge: 'too-short' },
        'valid-session-token',
        {},
      )
      .catch((caughtError: unknown) => caughtError);

    expect((error as AuthorizationRequestError).code).toBe('invalid_request');
    expect(authService.getCurrentSession).not.toHaveBeenCalled();
  });

  it('records PolicyDenied and does not issue a code without an allow policy', async () => {
    prisma.applicationGroupPolicy.findFirst.mockResolvedValue(null);

    const error = await authorizationService
      .authorize(validRequest, 'valid-session-token', {})
      .catch((caughtError: unknown) => caughtError);

    expect((error as AuthorizationRequestError).code).toBe('access_denied');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'PolicyDenied',
          result: 'DENIED',
        }) as unknown,
      }),
    );
    expect(prisma.authorizationCode.create).not.toHaveBeenCalled();
  });
});
