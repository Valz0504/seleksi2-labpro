import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { UserInfoError } from './userinfo.error';
import { UserInfoService } from './userinfo.service';

describe('UserInfoService', () => {
  const rawAccessToken = 't'.repeat(43);
  const userId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const transaction = {
    accessToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    applicationGroupPolicy: {
      findFirst: jest.fn(),
    },
    ssoSession: {
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
  };
  let userInfoService: UserInfoService;

  function activeToken() {
    return {
      id: '44444444-4444-4444-8444-444444444444',
      userId,
      applicationId,
      ssoSessionId: sessionId,
      scopes: ['profile'],
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 900_000),
      revokedAt: null,
      user: {
        id: userId,
        name: 'Active User',
        email: 'active@example.com',
        status: 'ACTIVE',
        userGroups: [
          { group: { name: 'app-a-users' } },
          { group: { name: 'students' } },
        ],
      },
      application: {
        id: applicationId,
        clientId: 'app-a',
        status: 'ACTIVE',
      },
      ssoSession: {
        id: sessionId,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 3_600_000),
        revokedAt: null,
      },
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    transaction.accessToken.findUnique.mockResolvedValue(activeToken());
    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
    });
    transaction.ssoSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserInfoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    userInfoService = module.get(UserInfoService);
  });

  it('returns profile, groups, session reference, and the token audience', async () => {
    const result = await userInfoService.getProfile(`Bearer ${rawAccessToken}`);
    const lookupCalls = transaction.accessToken.findUnique.mock
      .calls as unknown as Array<[{ where: { tokenHash: string } }]>;
    const tokenHash = lookupCalls[0]?.[0].where.tokenHash;

    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).not.toBe(rawAccessToken);
    expect(result).toEqual({
      sub: userId,
      name: 'Active User',
      email: 'active@example.com',
      groups: ['app-a-users', 'students'],
      aud: 'app-a',
      clientId: 'app-a',
      centralSessionId: sessionId,
      scope: 'profile',
    });
  });

  it('rejects malformed bearer credentials without querying the database', async () => {
    await expect(
      userInfoService.getProfile('Basic not-a-bearer-token'),
    ).rejects.toBeInstanceOf(UserInfoError);
    await expect(
      userInfoService.getProfile(`Bearer ${'short'}`),
    ).rejects.toBeInstanceOf(UserInfoError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks an elapsed active access token as expired', async () => {
    transaction.accessToken.findUnique.mockResolvedValue({
      ...activeToken(),
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(
      userInfoService.getProfile(`Bearer ${rawAccessToken}`),
    ).rejects.toBeInstanceOf(UserInfoError);
    expect(transaction.accessToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
    expect(transaction.applicationGroupPolicy.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked token', { status: 'REVOKED', revokedAt: new Date() }],
    ['inactive user', { user: { ...activeToken().user, status: 'INACTIVE' } }],
    [
      'inactive application',
      {
        application: {
          ...activeToken().application,
          status: 'INACTIVE',
        },
      },
    ],
    [
      'revoked central session',
      {
        ssoSession: {
          ...activeToken().ssoSession,
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      },
    ],
  ])('rejects a token with %s', async (_name, override) => {
    transaction.accessToken.findUnique.mockResolvedValue({
      ...activeToken(),
      ...override,
    });

    await expect(
      userInfoService.getProfile(`Bearer ${rawAccessToken}`),
    ).rejects.toBeInstanceOf(UserInfoError);
    expect(transaction.applicationGroupPolicy.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a token when the current group policy no longer allows access', async () => {
    transaction.applicationGroupPolicy.findFirst.mockResolvedValue(null);

    await expect(
      userInfoService.getProfile(`Bearer ${rawAccessToken}`),
    ).rejects.toBeInstanceOf(UserInfoError);
    expect(transaction.accessToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent token or central-session revocation', async () => {
    transaction.accessToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      userInfoService.getProfile(`Bearer ${rawAccessToken}`),
    ).rejects.toBeInstanceOf(UserInfoError);

    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.ssoSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      userInfoService.getProfile(`Bearer ${rawAccessToken}`),
    ).rejects.toBeInstanceOf(UserInfoError);
  });
});
