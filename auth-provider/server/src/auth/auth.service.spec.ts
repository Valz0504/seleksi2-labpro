import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    ssoSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    accessToken: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'SSO_SESSION_TTL_SECONDS') {
        return 3600;
      }

      throw new Error(`Unexpected config key: ${name}`);
    }),
  };
  let authService: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.ssoSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.accessToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it('creates a session with a hash instead of the raw cookie token', async () => {
    const passwordHash = await hashPassword('correct-password');
    const createdAt = new Date();

    prisma.user.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Active User',
      email: 'active@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'USER',
    });
    prisma.ssoSession.create.mockImplementation(
      ({ data }: { data: { expiresAt: Date } }) =>
        Promise.resolve({
          id: '22222222-2222-4222-8222-222222222222',
          status: 'ACTIVE',
          createdAt,
          expiresAt: data.expiresAt,
        }),
    );

    const result = await authService.login(
      ' Active@Example.com ',
      'correct-password',
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );
    const createCalls = prisma.ssoSession.create.mock.calls as unknown as Array<
      [{ data: { sessionTokenHash: string } }]
    >;
    const createInput = createCalls[0]?.[0];

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createInput?.data.sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput?.data.sessionTokenHash).not.toBe(result.sessionToken);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'active@example.com' } }),
    );
  });

  it('returns the same generic error when the account does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      authService.login('missing@example.com', 'wrong-password', {}),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Email atau password tidak valid',
        },
      },
    });
    expect(prisma.ssoSession.create).not.toHaveBeenCalled();
  });

  it('marks an elapsed active session as expired', async () => {
    prisma.ssoSession.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - 10_000),
      expiresAt: new Date(Date.now() - 1_000),
      lastActivityAt: null,
      revokedAt: null,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Active User',
        email: 'active@example.com',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    await expect(
      authService.getCurrentSession('expired-session-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.ssoSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
  });

  it('revokes the central session and its active access tokens together', async () => {
    prisma.ssoSession.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
    });

    await authService.logout('valid-session-token');

    const sessionUpdateCalls = prisma.ssoSession.updateMany.mock
      .calls as unknown as Array<
      [{ data: { status?: string; revokeReason?: string } }]
    >;
    const tokenUpdateCalls = prisma.accessToken.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: { ssoSessionId?: string };
          data: { status?: string };
        },
      ]
    >;

    expect(sessionUpdateCalls[0]?.[0].data).toMatchObject({
      status: 'REVOKED',
      revokeReason: 'sso_logout',
    });
    expect(tokenUpdateCalls[0]?.[0]).toMatchObject({
      where: {
        ssoSessionId: '22222222-2222-4222-8222-222222222222',
      },
      data: { status: 'REVOKED' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
