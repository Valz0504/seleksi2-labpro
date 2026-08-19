import type { RevocationEvent } from '@seleksi/shared';
import { EventDeliveryStatus } from '../generated/prisma/enums';
import { NonRetryableEventError } from './event-processing.errors';
import { RevocationDeliveryService } from './revocation-delivery.service';

interface DeliveryUpdateInput {
  where: {
    status?: EventDeliveryStatus;
    attemptCount?: number;
    lastAttemptAt?: { lte: Date };
  };
  data: {
    status?: EventDeliveryStatus;
    attemptCount?: { increment: number };
    nextRetryAt?: Date | null;
    lastError?: string;
  };
}

describe('RevocationDeliveryService', () => {
  const event: RevocationEvent = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'PasswordChanged',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: null,
    applicationId: null,
    reason: 'password_changed',
    occurredAt: '2026-08-17T08:00:00.000Z',
    metadata: {},
  };
  const targets = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'App A',
      logoutNotificationUrl: 'http://localhost:3002/internal/logout',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'App B',
      logoutNotificationUrl: 'http://localhost:3003/internal/logout',
    },
  ];
  const prisma = {
    outboxEvent: {
      findUnique: jest.fn(),
    },
    application: {
      findMany: jest.fn(),
    },
    eventDelivery: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const internalLogoutClient = {
    deliver: jest.fn(),
  };
  const deadLetterPublisher = {
    publish: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'DELIVERY_RETRY_MAX_ATTEMPTS') {
        return 5;
      }

      return name === 'DELIVERY_RETRY_BASE_MS' ? 1_000 : 60_000;
    }),
  };
  let service: RevocationDeliveryService;

  function deliveryUpdates(): DeliveryUpdateInput[] {
    return prisma.eventDelivery.updateMany.mock.calls.map(
      ([input]: [DeliveryUpdateInput]) => input,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.outboxEvent.findUnique.mockResolvedValue({ payload: event });
    prisma.application.findMany.mockResolvedValue(targets);
    prisma.eventDelivery.createMany.mockResolvedValue({ count: 2 });
    prisma.eventDelivery.findMany.mockResolvedValue(
      targets.map((target, index) => ({
        id: `55555555-5555-4555-8555-55555555555${index}`,
        applicationId: target.id,
        status: EventDeliveryStatus.PENDING,
        attemptCount: 0,
      })),
    );
    prisma.eventDelivery.updateMany.mockResolvedValue({ count: 1 });
    internalLogoutClient.deliver.mockResolvedValue(undefined);
    deadLetterPublisher.publish.mockResolvedValue(undefined);
    service = new RevocationDeliveryService(
      prisma as never,
      internalLogoutClient as never,
      deadLetterPublisher as never,
      configService as never,
    );
  });

  it('creates one independent delivery for every registered application', async () => {
    await expect(service.process(event)).resolves.toBeUndefined();

    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(prisma.eventDelivery.createMany).toHaveBeenCalledWith({
      data: targets.map((target) => ({
        eventId: event.eventId,
        applicationId: target.id,
        status: EventDeliveryStatus.PENDING,
      })),
      skipDuplicates: true,
    });
    expect(internalLogoutClient.deliver).toHaveBeenCalledTimes(2);

    const statusUpdates = prisma.eventDelivery.updateMany.mock.calls.map(
      ([input]: [{ data: { status: EventDeliveryStatus } }]) =>
        input.data.status,
    );
    expect(statusUpdates).toEqual([
      EventDeliveryStatus.PROCESSING,
      EventDeliveryStatus.PROCESSING,
      EventDeliveryStatus.SUCCEEDED,
      EventDeliveryStatus.SUCCEEDED,
    ]);
  });

  it('resolves an access-policy event to its exact application only', async () => {
    const policyEvent: RevocationEvent = {
      ...event,
      eventType: 'AccessPolicyChanged',
      applicationId: targets[1].id,
      reason: 'access_policy_changed',
    };

    prisma.outboxEvent.findUnique.mockResolvedValue({ payload: policyEvent });
    prisma.application.findMany.mockResolvedValue([targets[1]]);
    prisma.eventDelivery.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        applicationId: targets[1].id,
        status: EventDeliveryStatus.PENDING,
        attemptCount: 0,
      },
    ]);

    await expect(service.process(policyEvent)).resolves.toBeUndefined();
    expect(prisma.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: targets[1].id } }),
    );
    expect(internalLogoutClient.deliver).toHaveBeenCalledWith(
      targets[1],
      policyEvent,
    );
  });

  it('persists one failed application without blocking the other', async () => {
    internalLogoutClient.deliver.mockImplementation(
      (target: { id: string }) => {
        if (target.id === targets[0].id) {
          return Promise.reject(new Error('App A unavailable'));
        }

        return Promise.resolve();
      },
    );

    await expect(service.process(event)).resolves.toBeUndefined();

    const persistedStatuses = prisma.eventDelivery.updateMany.mock.calls.map(
      ([input]: [{ data: { status: EventDeliveryStatus } }]) =>
        input.data.status,
    );
    expect(persistedStatuses).toContain(EventDeliveryStatus.RETRYING);
    expect(persistedStatuses).toContain(EventDeliveryStatus.SUCCEEDED);
  });

  it('schedules the first retry using exponential backoff', async () => {
    const now = new Date('2026-08-18T04:00:00.000Z');

    jest.useFakeTimers();
    jest.setSystemTime(now);
    prisma.application.findMany.mockResolvedValue([targets[0]]);
    prisma.eventDelivery.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        applicationId: targets[0].id,
        status: EventDeliveryStatus.PENDING,
        attemptCount: 0,
      },
    ]);
    internalLogoutClient.deliver.mockRejectedValue(
      new Error('application unavailable'),
    );

    try {
      await service.process(event);
    } finally {
      jest.useRealTimers();
    }

    const retryUpdate = deliveryUpdates().find(
      (input) => input.data.status === EventDeliveryStatus.RETRYING,
    );

    expect(retryUpdate?.data).toMatchObject({
      status: EventDeliveryStatus.RETRYING,
      nextRetryAt: new Date('2026-08-18T04:00:01.000Z'),
      lastError: 'application unavailable',
    });
  });

  it('recovers orphaned claims and retries only an eligible delivery', async () => {
    const now = new Date('2026-08-18T04:00:00.000Z');
    const retryDelivery = {
      id: '55555555-5555-4555-8555-555555555555',
      eventId: event.eventId,
      applicationId: targets[0].id,
      status: EventDeliveryStatus.RETRYING,
      attemptCount: 1,
      nextRetryAt: now,
      lastError: 'application unavailable',
      application: targets[0],
      event: { payload: event },
    };

    jest.useFakeTimers();
    jest.setSystemTime(now);
    prisma.eventDelivery.findMany.mockResolvedValue([retryDelivery]);

    try {
      await service.processDueRetries(now);
    } finally {
      jest.useRealTimers();
    }

    expect(deliveryUpdates()[0]).toMatchObject({
      where: {
        status: EventDeliveryStatus.PROCESSING,
        lastAttemptAt: {
          lte: new Date('2026-08-18T03:59:30.000Z'),
        },
      },
      data: {
        status: EventDeliveryStatus.RETRYING,
        nextRetryAt: now,
      },
    });
    expect(internalLogoutClient.deliver).toHaveBeenCalledWith(
      targets[0],
      event,
    );
    const retryClaim = deliveryUpdates().find(
      (input) => input.data.attemptCount?.increment === 1,
    );

    expect(retryClaim).toMatchObject({
      where: {
        status: EventDeliveryStatus.RETRYING,
        attemptCount: 1,
      },
      data: {
        status: EventDeliveryStatus.PROCESSING,
        attemptCount: { increment: 1 },
      },
    });
  });

  it('doubles the backoff after each failed attempt', async () => {
    const now = new Date('2026-08-18T04:00:00.000Z');

    jest.useFakeTimers();
    jest.setSystemTime(now);
    prisma.eventDelivery.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        eventId: event.eventId,
        applicationId: targets[0].id,
        status: EventDeliveryStatus.RETRYING,
        attemptCount: 1,
        nextRetryAt: now,
        lastError: 'first failure',
        application: targets[0],
        event: { payload: event },
      },
    ]);
    internalLogoutClient.deliver.mockRejectedValue(new Error('second failure'));

    try {
      await service.processDueRetries(now);
    } finally {
      jest.useRealTimers();
    }

    expect(
      deliveryUpdates().some(
        (input) =>
          input.data.status === EventDeliveryStatus.RETRYING &&
          input.data.nextRetryAt?.toISOString() ===
            '2026-08-18T04:00:02.000Z' &&
          input.data.lastError === 'second failure',
      ),
    ).toBe(true);
  });

  it('publishes an exhausted target to the DLQ before marking it failed', async () => {
    const now = new Date('2026-08-18T04:00:00.000Z');
    const exhaustedDelivery = {
      id: '55555555-5555-4555-8555-555555555555',
      eventId: event.eventId,
      applicationId: targets[0].id,
      status: EventDeliveryStatus.RETRYING,
      attemptCount: 5,
      nextRetryAt: now,
      lastError: 'HTTP 503',
      application: targets[0],
      event: { payload: event },
    };

    prisma.eventDelivery.findMany.mockResolvedValue([exhaustedDelivery]);

    await service.processDueRetries(now);

    expect(deadLetterPublisher.publish).toHaveBeenCalledWith({
      event,
      deliveryId: exhaustedDelivery.id,
      targetApplicationId: targets[0].id,
      attemptCount: 5,
      lastError: 'HTTP 503',
      failedAt: now.toISOString(),
    });
    const failedUpdate = deliveryUpdates().find(
      (input) => input.data.status === EventDeliveryStatus.FAILED,
    );

    expect(failedUpdate).toMatchObject({
      where: {
        status: EventDeliveryStatus.PROCESSING,
        attemptCount: 5,
      },
      data: {
        status: EventDeliveryStatus.FAILED,
        nextRetryAt: null,
      },
    });
    expect(internalLogoutClient.deliver).not.toHaveBeenCalled();
  });

  it('keeps an exhausted delivery retryable when DLQ publish fails', async () => {
    const now = new Date('2026-08-18T04:00:00.000Z');

    prisma.eventDelivery.findMany.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        eventId: event.eventId,
        applicationId: targets[0].id,
        status: EventDeliveryStatus.RETRYING,
        attemptCount: 5,
        nextRetryAt: now,
        lastError: 'HTTP 503',
        application: targets[0],
        event: { payload: event },
      },
    ]);
    deadLetterPublisher.publish.mockRejectedValue(
      new Error('RabbitMQ unavailable'),
    );

    await service.processDueRetries(now);

    expect(
      deliveryUpdates().some(
        (input) =>
          input.data.status === EventDeliveryStatus.RETRYING &&
          input.data.nextRetryAt?.toISOString() === '2026-08-18T04:00:01.000Z',
      ),
    ).toBe(true);
    expect(
      prisma.eventDelivery.updateMany.mock.calls.some(
        ([input]: [{ data: { status: EventDeliveryStatus } }]) =>
          input.data.status === EventDeliveryStatus.FAILED,
      ),
    ).toBe(false);
  });

  it('does not repeat a delivery whose state is already durable', async () => {
    prisma.eventDelivery.findMany.mockResolvedValue(
      targets.map((target, index) => ({
        id: `55555555-5555-4555-8555-55555555555${index}`,
        applicationId: target.id,
        status: EventDeliveryStatus.SUCCEEDED,
        attemptCount: 1,
      })),
    );

    await expect(service.process(event)).resolves.toBeUndefined();
    expect(internalLogoutClient.deliver).not.toHaveBeenCalled();
    expect(prisma.eventDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a queued payload that differs from the outbox source', async () => {
    prisma.outboxEvent.findUnique.mockResolvedValue({
      payload: { ...event, reason: 'admin_deactivation' },
    });

    await expect(service.process(event)).rejects.toBeInstanceOf(
      NonRetryableEventError,
    );
    expect(prisma.application.findMany).not.toHaveBeenCalled();
  });
});
