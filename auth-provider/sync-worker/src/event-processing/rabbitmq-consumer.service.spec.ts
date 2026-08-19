import { Logger } from '@nestjs/common';
import type { Channel, Message } from 'amqplib';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';
import { NonRetryableEventError } from './event-processing.errors';

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
  };
  const deliveryService = {
    process: jest.fn(),
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
    service = new RabbitMqConsumerService(
      deliveryService as never,
      configService as never,
    );
  });

  afterEach(() => {
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
  });

  it('dead-letters invalid or permanently inconsistent events', async () => {
    deliveryService.process.mockRejectedValue(
      new NonRetryableEventError('Outbox event does not exist'),
    );

    await service.processMessage(channel as unknown as Channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('requeues infrastructure failures without acknowledging them', async () => {
    deliveryService.process.mockRejectedValue(
      new Error('database unavailable'),
    );

    await service.processMessage(channel as unknown as Channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
