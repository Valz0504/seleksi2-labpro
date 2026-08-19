import type { RevocationEvent } from '@seleksi/shared';
import { OutboxEventService } from '../event-processing/outbox-event.service';
import { AdminRevocationService } from './admin-revocation.service';

describe('AdminRevocationService', () => {
  const transaction = {
    applicationGroupPolicy: { findFirst: jest.fn() },
    ssoSession: { updateManyAndReturn: jest.fn() },
    accessToken: { updateMany: jest.fn() },
    outboxEvent: { createMany: jest.fn() },
  };
  const now = new Date('2026-08-17T06:00:00.000Z');
  let service: AdminRevocationService;

  const outboxPayloads = (): RevocationEvent[] => {
    const calls = transaction.outboxEvent.createMany.mock
      .calls as unknown as Array<
      [{ data: Array<{ payload: RevocationEvent }> }]
    >;

    return calls.flatMap(([input]) => input.data.map(({ payload }) => payload));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.ssoSession.updateManyAndReturn.mockResolvedValue([]);
    transaction.accessToken.updateMany.mockResolvedValue({ count: 1 });
    transaction.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    service = new AdminRevocationService(new OutboxEventService());
  });

  it('emits SessionRevoked only for sessions changed by deactivation', async () => {
    const callOrder: string[] = [];
    transaction.ssoSession.updateManyAndReturn.mockImplementation(() => {
      callOrder.push('session');
      return Promise.resolve([
        {
          id: '22222222-2222-4222-8222-222222222222',
          userId: '11111111-1111-4111-8111-111111111111',
        },
      ]);
    });
    transaction.accessToken.updateMany.mockImplementation(() => {
      callOrder.push('token');
      return Promise.resolve({ count: 1 });
    });
    transaction.outboxEvent.createMany.mockImplementation(() => {
      callOrder.push('event');
      return Promise.resolve({ count: 1 });
    });

    await service.revokeUsersForDeactivation(
      transaction as never,
      [
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ],
      now,
    );

    expect(callOrder).toEqual(['session', 'token', 'event']);
    expect(transaction.ssoSession.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['11111111-1111-4111-8111-111111111111'] },
        }) as unknown,
        data: expect.objectContaining({
          status: 'REVOKED',
          revokeReason: 'user_deactivated',
        }) as unknown,
        select: { id: true, userId: true },
      }),
    );
    expect(outboxPayloads()).toEqual([
      expect.objectContaining({
        eventType: 'SessionRevoked',
        userId: '11111111-1111-4111-8111-111111111111',
        centralSessionId: '22222222-2222-4222-8222-222222222222',
        applicationId: null,
        reason: 'user_deactivated',
        metadata: { source: 'admin_user_deactivation' },
      }),
    ]);
  });

  it('emits one PasswordChanged event even when there is no active session', async () => {
    await service.revokeUsersForPasswordChange(
      transaction as never,
      [
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111',
      ],
      now,
    );

    expect(outboxPayloads()).toEqual([
      expect.objectContaining({
        eventType: 'PasswordChanged',
        userId: '11111111-1111-4111-8111-111111111111',
        centralSessionId: null,
        applicationId: null,
        reason: 'password_changed',
        metadata: { source: 'admin_password_change' },
      }),
    ]);
  });

  it('emits an AccessPolicyChanged event for every lost user/application pair', async () => {
    transaction.applicationGroupPolicy.findFirst
      .mockResolvedValueOnce({ id: 'remaining-policy' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const revoked = await service.revokeUsersWhoLostAccess(
      transaction as never,
      [
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
      ],
      [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
      now,
    );

    expect(revoked).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(outboxPayloads()).toEqual([
      expect.objectContaining({
        eventType: 'AccessPolicyChanged',
        userId: '11111111-1111-4111-8111-111111111111',
        applicationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
      expect.objectContaining({
        eventType: 'AccessPolicyChanged',
        userId: '33333333-3333-4333-8333-333333333333',
        applicationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }),
      expect.objectContaining({
        eventType: 'AccessPolicyChanged',
        userId: '33333333-3333-4333-8333-333333333333',
        applicationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ]);
  });

  it('does not issue database updates or events when no user loses access', async () => {
    transaction.applicationGroupPolicy.findFirst.mockResolvedValue({
      id: 'remaining-policy',
    });

    await expect(
      service.revokeUsersWhoLostAccess(
        transaction as never,
        ['11111111-1111-4111-8111-111111111111'],
        ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        now,
      ),
    ).resolves.toEqual([]);
    expect(transaction.ssoSession.updateManyAndReturn).not.toHaveBeenCalled();
    expect(transaction.accessToken.updateMany).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });
});
