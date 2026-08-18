import type { RevocationEvent } from '@seleksi/shared';
import { EventDeliveryStatus } from '../generated/prisma/enums';
import { NonRetryableEventError } from './event-processing.errors';
import { RevocationDeliveryService } from './revocation-delivery.service';

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
  let service: RevocationDeliveryService;

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
    service = new RevocationDeliveryService(
      prisma as never,
      internalLogoutClient as never,
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
