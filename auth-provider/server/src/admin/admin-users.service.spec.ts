import { verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { OutboxEventService } from '../event-processing/outbox-event.service';
import type { AdminActor } from './admin-request';
import { AdminRevocationService } from './admin-revocation.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  const actor: AdminActor = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ipAddress: '127.0.0.1',
  };
  const userId = '11111111-1111-4111-8111-111111111111';
  const userRecord = {
    id: userId,
    name: 'Managed User',
    email: 'managed@example.com',
    status: 'ACTIVE',
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
    userGroups: [],
  };
  const transaction = {
    user: { create: jest.fn(), update: jest.fn() },
    ssoSession: { updateManyAndReturn: jest.fn() },
    accessToken: { updateMany: jest.fn() },
    mfaLoginChallenge: { updateMany: jest.fn() },
    outboxEvent: { createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: AdminUsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.user.create.mockResolvedValue(userRecord);
    transaction.user.update.mockResolvedValue(userRecord);
    transaction.ssoSession.updateManyAndReturn.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        userId,
      },
    ]);
    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.mfaLoginChallenge.updateMany.mockResolvedValue({ count: 1 });
    transaction.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    transaction.auditLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    service = new AdminUsersService(
      prisma as unknown as PrismaService,
      new AdminRevocationService(new OutboxEventService()),
    );
  });

  it('normalizes email and persists an Argon2 hash instead of a plaintext password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await service.createUser(
      {
        name: ' Managed User ',
        email: ' Managed@Example.com ',
        password: 'strong-password',
      },
      actor,
    );

    const createCalls = transaction.user.create.mock.calls as unknown as Array<
      [{ data: { name: string; email: string; passwordHash: string } }]
    >;
    const createInput = createCalls[0][0];

    expect(createInput.data).toMatchObject({
      name: 'Managed User',
      email: 'managed@example.com',
    });
    expect(createInput.data.passwordHash).not.toBe('strong-password');
    await expect(
      verifyPassword(createInput.data.passwordHash, 'strong-password'),
    ).resolves.toBe(true);
    expect(
      JSON.stringify(transaction.auditLog.create.mock.calls),
    ).not.toContain('strong-password');
  });

  it('revokes all central sessions and tokens when an admin changes a password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId });

    await service.updatePassword(
      userId,
      { password: 'new-strong-password' },
      actor,
    );

    const passwordUpdateCalls = transaction.user.update.mock
      .calls as unknown as Array<[{ data: { passwordHash: string } }]>;
    const passwordUpdate = passwordUpdateCalls[0][0];

    expect(passwordUpdate.data.passwordHash).not.toBe('new-strong-password');
    const sessionUpdateCalls = transaction.ssoSession.updateManyAndReturn.mock
      .calls as unknown as Array<
      [
        {
          where: { userId: { in: string[] } };
          data: { status: string; revokeReason: string };
        },
      ]
    >;
    expect(sessionUpdateCalls[0]?.[0]).toMatchObject({
      where: { userId: { in: [userId] } },
      data: { status: 'REVOKED', revokeReason: 'password_changed' },
    });
    expect(transaction.accessToken.updateMany).toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: 'PasswordChanged',
          userId,
          centralSessionId: null,
          applicationId: null,
          payload: expect.objectContaining({
            eventType: 'PasswordChanged',
            userId,
            reason: 'password_changed',
          }) as unknown,
        }),
      ],
    });
    const auditCalls = transaction.auditLog.create.mock
      .calls as unknown as Array<[{ data: { eventType: string } }]>;
    expect(auditCalls[0]?.[0].data.eventType).toBe('PasswordChanged');
  });

  it('revokes security state when an active user is deactivated', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId, status: 'ACTIVE' });
    transaction.user.update.mockResolvedValue({
      ...userRecord,
      status: 'INACTIVE',
    });

    await service.updateStatus(userId, { status: 'INACTIVE' }, actor);

    const deactivateSessionCalls = transaction.ssoSession.updateManyAndReturn
      .mock.calls as unknown as Array<
      [{ data: { status: string; revokeReason: string } }]
    >;
    expect(deactivateSessionCalls[0]?.[0].data).toMatchObject({
      status: 'REVOKED',
      revokeReason: 'user_deactivated',
    });
    expect(transaction.accessToken.updateMany).toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: 'SessionRevoked',
          userId,
          centralSessionId: '22222222-2222-4222-8222-222222222222',
          applicationId: null,
          payload: expect.objectContaining({
            eventType: 'SessionRevoked',
            reason: 'user_deactivated',
          }) as unknown,
        }),
      ],
    });
  });

  it('propagates an outbox failure from the password-change transaction', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    transaction.outboxEvent.createMany.mockRejectedValue(
      new Error('outbox unavailable'),
    );

    await expect(
      service.updatePassword(
        userId,
        { password: 'new-strong-password' },
        actor,
      ),
    ).rejects.toThrow('outbox unavailable');
    expect(transaction.user.update).toHaveBeenCalled();
    expect(transaction.ssoSession.updateManyAndReturn).toHaveBeenCalled();
    expect(transaction.accessToken.updateMany).toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
