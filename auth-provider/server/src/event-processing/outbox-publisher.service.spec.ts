import { Logger } from '@nestjs/common';
import type { RevocationEvent } from '@seleksi/shared';
import { OutboxPublisherService } from './outbox-publisher.service';
import {
  RabbitMqPublishError,
  RabbitMqPublisherService,
} from './rabbitmq-publisher.service';

describe('OutboxPublisherService', () => {
  type UpdateInput = {
    where?: Record<string, unknown>;
    data: Record<string, unknown> & {
      nextPublishAttemptAt?: Date | null;
      lastError?: string | null;
    };
  };
  const event: RevocationEvent = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'SessionRevoked',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: '33333333-3333-4333-8333-333333333333',
    applicationId: null,
    reason: 'sso_logout',
    occurredAt: '2026-08-17T08:00:00.000Z',
    metadata: {},
  };
  const prisma = {
    outboxEvent: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const rabbitMqPublisher = {
    publish: jest.fn(),
  };
  const configuration: Record<string, boolean | number> = {
    OUTBOX_PUBLISHER_ENABLED: true,
    OUTBOX_PUBLISH_INTERVAL_MS: 1_000,
    OUTBOX_PUBLISH_BATCH_SIZE: 50,
    OUTBOX_PUBLISH_LEASE_MS: 30_000,
    OUTBOX_PUBLISH_RETRY_BASE_MS: 1_000,
    OUTBOX_PUBLISH_RETRY_MAX_MS: 60_000,
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => configuration[name]),
  };
  const updateInputs = (): UpdateInput[] =>
    (
      prisma.outboxEvent.updateMany.mock.calls as unknown as Array<
        [UpdateInput]
      >
    ).map(([input]) => input);
  let service: OutboxPublisherService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: event.eventId,
        payload: event,
        publishAttemptCount: 0,
      },
    ]);
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    rabbitMqPublisher.publish.mockResolvedValue(undefined);
    service = new OutboxPublisherService(
      prisma as never,
      rabbitMqPublisher as unknown as RabbitMqPublisherService,
      configService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('claims an eligible event and marks it published only after broker confirm', async () => {
    let confirmPublish: (() => void) | undefined;

    rabbitMqPublisher.publish.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          confirmPublish = resolve;
        }),
    );

    const publishing = service.publishPendingBatch();

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(rabbitMqPublisher.publish).toHaveBeenCalledWith(event);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);

    confirmPublish?.();

    await expect(publishing).resolves.toBe(1);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(2);
    expect(updateInputs()[1]).toMatchObject({
      where: {
        id: event.eventId,
        status: 'PENDING',
        publishAttemptCount: 1,
      },
      data: {
        status: 'PUBLISHED',
        nextPublishAttemptAt: null,
        lastError: null,
      },
    });
  });

  it('skips publishing when another instance already claimed the row', async () => {
    prisma.outboxEvent.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.publishPendingBatch()).resolves.toBe(0);
    expect(rabbitMqPublisher.publish).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the event pending and schedules exponential backoff on broker failure', async () => {
    rabbitMqPublisher.publish.mockRejectedValue(
      new RabbitMqPublishError(
        new Error('connect ECONNREFUSED amqp://user:secret@localhost:5672'),
      ),
    );

    await expect(service.publishPendingBatch()).resolves.toBe(0);

    const failureUpdate = updateInputs()[1];

    expect(failureUpdate?.data.status).toBeUndefined();
    expect(failureUpdate?.data.nextPublishAttemptAt).toBeInstanceOf(Date);
    expect(failureUpdate?.data.lastError).toContain('ECONNREFUSED');
    expect(failureUpdate?.data.lastError).not.toContain('user:secret');
  });

  it('does not publish a malformed or mismatched outbox payload', async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        payload: event,
        publishAttemptCount: 0,
      },
    ]);

    await expect(service.publishPendingBatch()).resolves.toBe(0);
    expect(rabbitMqPublisher.publish).not.toHaveBeenCalled();
    expect(updateInputs()[1]).toMatchObject({
      data: {
        lastError: 'Outbox row id does not match payload eventId',
      },
    });
  });
});
