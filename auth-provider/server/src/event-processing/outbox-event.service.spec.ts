import type { RevocationEvent } from '@seleksi/shared';
import { OutboxEventService } from './outbox-event.service';

describe('OutboxEventService', () => {
  const transaction = {
    outboxEvent: { createMany: jest.fn() },
  };
  const occurredAt = new Date('2026-08-17T05:00:00.123Z');
  let service: OutboxEventService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    service = new OutboxEventService();
  });

  it('uses one UUID for the row id and payload eventId', async () => {
    const event = await service.enqueue(transaction as never, {
      eventType: 'SessionRevoked',
      userId: '11111111-1111-4111-8111-111111111111',
      centralSessionId: '22222222-2222-4222-8222-222222222222',
      applicationId: null,
      reason: 'sso_logout',
      occurredAt,
      metadata: { source: 'auth_logout' },
    });
    const createCalls = transaction.outboxEvent.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            id: string;
            eventType: string;
            payload: RevocationEvent;
          }>;
        },
      ]
    >;
    const row = createCalls[0]?.[0].data[0];

    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(event.occurredAt).toBe('2026-08-17T05:00:00.123Z');
    expect(row).toMatchObject({
      id: event.eventId,
      eventType: 'SessionRevoked',
      payload: event,
    });
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('publishedAt');
  });

  it('creates multiple contract-shaped events in one database write', async () => {
    transaction.outboxEvent.createMany.mockResolvedValue({ count: 2 });

    const events = await service.enqueueMany(transaction as never, [
      {
        eventType: 'PasswordChanged',
        userId: '11111111-1111-4111-8111-111111111111',
        centralSessionId: null,
        applicationId: null,
        reason: 'password_changed',
        occurredAt,
      },
      {
        eventType: 'AccessPolicyChanged',
        userId: '33333333-3333-4333-8333-333333333333',
        centralSessionId: null,
        applicationId: '44444444-4444-4444-8444-444444444444',
        reason: 'access_policy_changed',
        occurredAt,
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventType: 'PasswordChanged',
      centralSessionId: null,
      applicationId: null,
      metadata: {},
    });
    expect(events[1]).toMatchObject({
      eventType: 'AccessPolicyChanged',
      centralSessionId: null,
      applicationId: '44444444-4444-4444-8444-444444444444',
      metadata: {},
    });
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it('does not issue a write for an empty batch', async () => {
    await expect(
      service.enqueueMany(transaction as never, []),
    ).resolves.toEqual([]);
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });
});
