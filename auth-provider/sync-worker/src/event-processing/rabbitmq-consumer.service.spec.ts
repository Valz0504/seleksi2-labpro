import { Logger } from '@nestjs/common';
import type { Channel, Message } from 'amqplib';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';
import { NonRetryableEventError } from './event-processing.errors';
import { REVOCATION_MESSAGING } from './event-processing.constants';

describe('RabbitMqConsumerService', () => {
  const event = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'PasswordChanged',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: null,
    applicationId: null,
    reason: 'password_changed',
    occurredAt: '2026-08-17T08:00:00.000Z',
    metadata: {},
  } as const;
  const message = {
    content: Buffer.from(JSON.stringify(event), 'utf8'),
    properties: {
      contentType: 'application/json',
      messageId: event.eventId,
      type: event.eventType,
    },
  } as Message;
  const channel = {
    ack: jest.fn(),
    nack: jest.fn(),
    cancel: jest.fn(),
    checkQueue: jest.fn(),
    close: jest.fn(),
  };
  const connection = {
    close: jest.fn(),
  };
  const deliveryService = {
    process: jest.fn(),
  };
  const metrics = {
    recordMessage: jest.fn(),
  };
  const config: Record<string, boolean> = {
    SYNC_WORKER_CONSUMER_ENABLED: true,
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => config[name]),
  };
  let service: RabbitMqConsumerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    deliveryService.process.mockResolvedValue(undefined);
    channel.cancel.mockResolvedValue(undefined);
    channel.checkQueue
      .mockResolvedValueOnce({ messageCount: 2, consumerCount: 1 })
      .mockResolvedValueOnce({ messageCount: 3, consumerCount: 0 });
    channel.close.mockResolvedValue(undefined);
    connection.close.mockResolvedValue(undefined);
    service = new RabbitMqConsumerService(
      deliveryService as never,
      metrics as never,
      configService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('acknowledges only after delivery outcomes are durable', async () => {
    let finishProcessing: (() => void) | undefined;

    deliveryService.process.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProcessing = () => resolve(undefined);
        }),
    );

    const processing = service.processMessage(
      channel as unknown as Channel,
      message,
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(channel.ack).not.toHaveBeenCalled();

    finishProcessing?.();
    await processing;

    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(metrics.recordMessage).toHaveBeenCalledWith(
      'ack',
      expect.any(Number),
    );
  });

  it('dead-letters invalid or permanently inconsistent events', async () => {
    deliveryService.process.mockRejectedValue(
      new NonRetryableEventError('Outbox event does not exist'),
    );

    await service.processMessage(channel as unknown as Channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(metrics.recordMessage).toHaveBeenCalledWith(
      'dead_letter',
      expect.any(Number),
    );
  });

  it('requeues infrastructure failures without acknowledging them', async () => {
    deliveryService.process.mockRejectedValue(
      new Error('database unavailable'),
    );

    await service.processMessage(channel as unknown as Channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(metrics.recordMessage).toHaveBeenCalledWith(
      'requeue',
      expect.any(Number),
    );
  });

  it('reads actual main and dead-letter queue state from RabbitMQ', async () => {
    const internals = service as unknown as { channel: Channel };

    internals.channel = channel as unknown as Channel;

    await expect(service.getQueueMetrics()).resolves.toEqual({
      main: { messagesReady: 2, consumers: 1 },
      deadLetter: { messagesReady: 3, consumers: 0 },
    });
    expect(channel.checkQueue).toHaveBeenNthCalledWith(
      1,
      REVOCATION_MESSAGING.queue,
    );
    expect(channel.checkQueue).toHaveBeenNthCalledWith(
      2,
      REVOCATION_MESSAGING.deadLetterQueue,
    );
  });

  it('cancels consumption and lets an in-flight delivery finish before closing', async () => {
    let finishProcessing: (() => void) | undefined;

    deliveryService.process.mockReturnValue(
      new Promise<void>((resolve) => {
        finishProcessing = resolve;
      }),
    );
    const delivery = {
      channel: channel as unknown as Channel,
      message,
      processing: Promise.resolve(),
      settled: false,
      startedAt: process.hrtime.bigint(),
    };
    delivery.processing = service.processMessage(
      channel as unknown as Channel,
      message,
      delivery,
    );
    const internals = service as unknown as {
      activeDeliveries: Set<typeof delivery>;
      channel: Channel;
      connection: typeof connection;
      consumerTag: string;
    };

    internals.activeDeliveries.add(delivery);
    internals.channel = channel as unknown as Channel;
    internals.connection = connection;
    internals.consumerTag = 'consumer-1';

    const shutdown = service.shutdown(1_000);

    await Promise.resolve();
    expect(channel.cancel).toHaveBeenCalledWith('consumer-1');
    expect(channel.close).not.toHaveBeenCalled();

    finishProcessing?.();
    await expect(shutdown).resolves.toEqual({ drained: true, requeued: 0 });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('requeues an unfinished delivery when the shutdown timeout is reached', async () => {
    jest.useFakeTimers();
    let finishProcessing: (() => void) | undefined;

    deliveryService.process.mockReturnValue(
      new Promise<void>((resolve) => {
        finishProcessing = resolve;
      }),
    );
    const delivery = {
      channel: channel as unknown as Channel,
      message,
      processing: Promise.resolve(),
      settled: false,
      startedAt: process.hrtime.bigint(),
    };
    delivery.processing = service.processMessage(
      channel as unknown as Channel,
      message,
      delivery,
    );
    const internals = service as unknown as {
      activeDeliveries: Set<typeof delivery>;
      channel: Channel;
      connection: typeof connection;
      consumerTag: string;
    };

    internals.activeDeliveries.add(delivery);
    internals.channel = channel as unknown as Channel;
    internals.connection = connection;
    internals.consumerTag = 'consumer-1';

    const shutdown = service.shutdown(1_000);

    await jest.advanceTimersByTimeAsync(1_000);
    await expect(shutdown).resolves.toEqual({ drained: false, requeued: 1 });
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);

    finishProcessing?.();
    await delivery.processing;
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledTimes(1);
  });
});
