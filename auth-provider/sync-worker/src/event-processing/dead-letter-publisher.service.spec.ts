import type { RevocationEvent } from '@seleksi/shared';
import * as amqp from 'amqplib';
import { REVOCATION_MESSAGING } from './event-processing.constants';
import {
  DeadLetterPublisherService,
  type RevocationDeadLetter,
} from './dead-letter-publisher.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

describe('DeadLetterPublisherService', () => {
  const event: RevocationEvent = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'PasswordChanged',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: null,
    applicationId: null,
    reason: 'password_changed',
    occurredAt: '2026-08-18T04:00:00.000Z',
    metadata: {},
  };
  const message: RevocationDeadLetter = {
    event,
    deliveryId: '33333333-3333-4333-8333-333333333333',
    targetApplicationId: '44444444-4444-4444-8444-444444444444',
    attemptCount: 5,
    lastError: 'Internal logout endpoint returned HTTP 503',
    failedAt: '2026-08-18T04:01:00.000Z',
  };
  const channel = {
    assertQueue: jest.fn().mockResolvedValue({}),
    sendToQueue: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('amqp://worker:secret@localhost:5672'),
  };
  let service: DeadLetterPublisherService;

  beforeEach(() => {
    jest.clearAllMocks();
    channel.assertQueue.mockResolvedValue({});
    channel.sendToQueue.mockImplementation((...arguments_: unknown[]) => {
      const callback = arguments_[3] as (error?: unknown) => void;

      callback();
      return true;
    });
    jest.mocked(amqp.connect).mockResolvedValue(connection as never);
    service = new DeadLetterPublisherService(configService as never);
  });

  it('publishes a persistent delivery-specific message with confirm', async () => {
    await expect(service.publish(message)).resolves.toBeUndefined();

    expect(channel.assertQueue).toHaveBeenCalledWith(
      REVOCATION_MESSAGING.deadLetterQueue,
      { durable: true },
    );
    const [queue, body, options] = channel.sendToQueue.mock.calls[0] as [
      string,
      Buffer,
      Record<string, unknown>,
    ];

    expect(queue).toBe(REVOCATION_MESSAGING.deadLetterQueue);
    expect(JSON.parse(body.toString('utf8'))).toEqual(message);
    expect(options).toMatchObject({
      correlationId: event.eventId,
      deliveryMode: 2,
      messageId: message.deliveryId,
      persistent: true,
      type: 'RevocationDeliveryFailed',
    });
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('rejects broker nacks and sanitizes connection errors', async () => {
    channel.sendToQueue.mockImplementation((...arguments_: unknown[]) => {
      const callback = arguments_[3] as (error?: unknown) => void;

      callback(new Error('broker nack'));
      return true;
    });
    await expect(service.publish(message)).rejects.toThrow('broker nack');

    jest
      .mocked(amqp.connect)
      .mockRejectedValueOnce(
        new Error('connect amqp://worker:secret@localhost:5672 failed'),
      );
    await expect(service.publish(message)).rejects.toThrow(
      'connect amqp://[redacted]@localhost:5672 failed',
    );
  });
});
