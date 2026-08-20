import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { OutboxEventService } from '../event-processing/outbox-event.service';
import { MfaChallengeService } from '../mfa/mfa-challenge.service';
import { AuthService } from './auth.service';
import { CentralSessionService } from './central-session.service';

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
    auditLog: {
      create: jest.fn(),
    },
    outboxEvent: {
      createMany: jest.fn(),
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
  const mfaChallengeService = {
    start: jest.fn(),
    complete: jest.fn(),
  };
  let authService: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.ssoSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.accessToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.create.mockResolvedValue({});
    prisma.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        CentralSessionService,
        OutboxEventService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: MfaChallengeService, useValue: mfaChallengeService },
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

    expect(result.status).toBe('authenticated');
    if (result.status !== 'authenticated') {
      throw new Error('Expected an authenticated login result');
    }

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createInput?.data.sessionTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput?.data.sessionTokenHash).not.toBe(result.sessionToken);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'active@example.com' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'LoginSucceeded',
        actorId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
        result: 'SUCCESS',
        metadata: { authenticationMethod: 'password' },
        ipAddress: '127.0.0.1',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates only a short-lived challenge when the account has active MFA', async () => {
    const passwordHash = await hashPassword('correct-password');
    const expiresAt = new Date(Date.now() + 300_000);

    prisma.user.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'MFA User',
      email: 'mfa@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'USER',
      mfaTotp: { enabledAt: new Date() },
    });
    mfaChallengeService.start.mockResolvedValue({
      challengeToken: 'pending-token',
      expiresAt,
    });

    await expect(
      authService.login(
        'mfa@example.com',
        'correct-password',
        {},
        {
          intent: { type: 'OAUTH', returnTo: '/authorize?client_id=app-a' },
        },
      ),
    ).resolves.toEqual({
      status: 'mfa_required',
      challengeToken: 'pending-token',
      expiresAt,
    });
    expect(mfaChallengeService.start).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'OAUTH',
      '/authorize?client_id=app-a',
    );
    expect(prisma.ssoSession.create).not.toHaveBeenCalled();
    const auditEventTypes = (
      prisma.auditLog.create.mock.calls as unknown as Array<
        [{ data: { eventType: string } }]
      >
    ).map(([input]) => input.data.eventType);

    expect(auditEventTypes).not.toContain('LoginSucceeded');
  });

  it('returns a generic error and safely audits a failed login', async () => {
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
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'LoginFailed',
        userId: undefined,
        result: 'FAILED',
        metadata: { reason: 'invalid_credentials' },
        ipAddress: undefined,
      },
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      'wrong-password',
    );
  });

  it('does not create an admin session for a valid non-admin account', async () => {
    const passwordHash = await hashPassword('correct-password');

    prisma.user.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Regular User',
      email: 'user@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'USER',
    });

    await expect(
      authService.login(
        'user@example.com',
        'correct-password',
        {},
        {
          requiredRole: 'ADMIN',
        },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.ssoSession.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'LoginFailed',
        userId: '11111111-1111-4111-8111-111111111111',
        result: 'FAILED',
        metadata: { reason: 'invalid_credentials' },
        ipAddress: undefined,
      },
    });
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
      userId: '11111111-1111-4111-8111-111111111111',
    });

    await authService.logout('valid-session-token', {
      ipAddress: '127.0.0.1',
    });

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
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'Logout',
        actorId: '11111111-1111-4111-8111-111111111111',
        userId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
        result: 'SUCCESS',
        metadata: { reason: 'sso_logout' },
        ipAddress: '127.0.0.1',
      },
    });
    const outboxCalls = prisma.outboxEvent.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            id: string;
            eventType: string;
            userId: string;
            centralSessionId: string | null;
            applicationId: string | null;
            payload: {
              eventId: string;
              eventType: string;
              userId: string;
              centralSessionId: string | null;
              applicationId: string | null;
              reason: string;
              occurredAt: string;
              metadata: Record<string, unknown>;
            };
          }>;
        },
      ]
    >;
    const outboxRow = outboxCalls[0]?.[0].data[0];

    expect(outboxRow?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof outboxRow?.payload.occurredAt).toBe('string');
    expect(outboxRow).toMatchObject({
      id: outboxRow?.id,
      eventType: 'SessionRevoked',
      userId: '11111111-1111-4111-8111-111111111111',
      centralSessionId: '22222222-2222-4222-8222-222222222222',
      applicationId: null,
      payload: {
        eventId: outboxRow?.id,
        eventType: 'SessionRevoked',
        userId: '11111111-1111-4111-8111-111111111111',
        centralSessionId: '22222222-2222-4222-8222-222222222222',
        applicationId: null,
        reason: 'sso_logout',
        occurredAt: outboxRow?.payload.occurredAt,
        metadata: { source: 'auth_logout' },
      },
    });
    expect(outboxRow?.payload.eventId).toBe(outboxRow?.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate logout audit when the session is already revoked', async () => {
    prisma.ssoSession.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    prisma.ssoSession.updateMany.mockResolvedValue({ count: 0 });

    await authService.logout('already-revoked-session-token');

    expect(prisma.accessToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it('propagates an outbox failure from the logout transaction', async () => {
    prisma.ssoSession.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    prisma.outboxEvent.createMany.mockRejectedValue(
      new Error('outbox unavailable'),
    );

    await expect(authService.logout('valid-session-token')).rejects.toThrow(
      'outbox unavailable',
    );
    expect(prisma.ssoSession.updateMany).toHaveBeenCalled();
    expect(prisma.accessToken.updateMany).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
