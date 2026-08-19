import { EventEmitter } from 'node:events';
import type { RevocationEvent } from '@seleksi/shared';
import * as amqp from 'amqplib';
import { REVOCATION_MESSAGING } from './event-processing.constants';
import {
  RabbitMqPublisherService,
  safePublishErrorMessage,
} from './rabbitmq-publisher.service';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('RabbitMqPublisherService', () => {
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
  const configService = {
    getOrThrow: jest.fn((name: string): string | number => {
      if (name === 'RABBITMQ_URL') {
        return 'amqp://user:password@localhost:5672';
      }

      return 5_000;
    }),
  };
  let channel: EventEmitter & {
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    checkQueue: jest.Mock;
    publish: jest.Mock;
    close: jest.Mock;
  };
  let connection: EventEmitter & {
    createConfirmChannel: jest.Mock;
    close: jest.Mock;
  };
  let service: RabbitMqPublisherService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockImplementation((name: string) => {
      if (name === 'RABBITMQ_URL') {
        return 'amqp://user:password@localhost:5672';
      }

      return 5_000;
    });
    channel = Object.assign(new EventEmitter(), {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
      checkQueue: jest.fn().mockResolvedValue({
        queue: REVOCATION_MESSAGING.queue,
        messageCount: 0,
        consumerCount: 0,
      }),
      publish: jest.fn().mockImplementation((...arguments_: unknown[]) => {
        const callback = arguments_[4] as (error?: unknown) => void;

        callback();
        return true;
      }),
      close: jest.fn().mockResolvedValue(undefined),
    });
    connection = Object.assign(new EventEmitter(), {
      createConfirmChannel: jest.fn().mockResolvedValue(channel),
      close: jest.fn().mockResolvedValue(undefined),
    });
    jest.mocked(amqp.connect).mockResolvedValue(connection as never);
    service = new RabbitMqPublisherService(configService as never);
  });

  afterEach(async () => {
    await service.close();
  });

  it('asserts durable topology and resolves only on publisher confirm', async () => {
    await expect(service.publish(event)).resolves.toBeUndefined();

    expect(channel.assertExchange).toHaveBeenCalledWith(
      REVOCATION_MESSAGING.exchange,
      'direct',
      { durable: true, autoDelete: false },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      REVOCATION_MESSAGING.queue,
      expect.objectContaining({
        durable: true,
        deadLetterExchange: REVOCATION_MESSAGING.deadLetterExchange,
      }),
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      REVOCATION_MESSAGING.queue,
      REVOCATION_MESSAGING.exchange,
      REVOCATION_MESSAGING.routingKey,
    );

    const publishArguments = channel.publish.mock.calls[0] as [
      string,
      string,
      Buffer,
      Record<string, unknown>,
    ];

    expect(publishArguments[0]).toBe(REVOCATION_MESSAGING.exchange);
    expect(publishArguments[1]).toBe(REVOCATION_MESSAGING.routingKey);
    expect(JSON.parse(publishArguments[2].toString('utf8'))).toEqual(event);
    expect(publishArguments[3]).toMatchObject({
      contentType: 'application/json',
      deliveryMode: 2,
      mandatory: true,
      messageId: event.eventId,
      persistent: true,
      type: event.eventType,
    });
  });

  it('rejects a broker nack and closes the failed connection', async () => {
    channel.publish.mockImplementation((...arguments_: unknown[]) => {
      const callback = arguments_[4] as (error?: unknown) => void;

      callback(new Error('broker nack'));
      return true;
    });

    await expect(service.publish(event)).rejects.toThrow('broker nack');
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('checks the durable queue through the reusable publisher channel', async () => {
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(channel.checkQueue).toHaveBeenCalledWith(REVOCATION_MESSAGING.queue);
    expect(amqp.connect).toHaveBeenCalledTimes(1);

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(amqp.connect).toHaveBeenCalledTimes(1);
  });

  it('resets a failed readiness channel so the next probe can reconnect', async () => {
    channel.checkQueue.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.checkReadiness()).rejects.toThrow(
      'broker unavailable',
    );
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(amqp.connect).toHaveBeenCalledTimes(2);
  });

  it('rejects a mandatory message returned as unroutable', async () => {
    channel.publish.mockImplementation((...arguments_: unknown[]) => {
      const callback = arguments_[4] as (error?: unknown) => void;

      channel.emit('return', {
        properties: { messageId: event.eventId },
      });
      callback();
      return true;
    });

    await expect(service.publish(event)).rejects.toThrow(
      'RabbitMQ returned an unroutable event',
    );
  });

  it('rejects when publisher confirm exceeds its timeout', async () => {
    configService.getOrThrow.mockImplementation((name: string) => {
      if (name === 'RABBITMQ_URL') {
        return 'amqp://user:password@localhost:5672';
      }

      if (name === 'RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS') {
        return 1;
      }

      return 5_000;
    });
    service = new RabbitMqPublisherService(configService as never);
    channel.publish.mockReturnValue(true);

    await expect(service.publish(event)).rejects.toThrow(
      'RabbitMQ publisher confirm timed out',
    );
  });

  it('redacts AMQP credentials from safe error messages', () => {
    expect(
      safePublishErrorMessage(
        new Error('connect failed for amqp://user:secret@localhost:5672'),
      ),
    ).toBe('connect failed for amqp://[redacted]@localhost:5672');
  });

  it('extracts useful details from aggregate connection errors', () => {
    expect(
      safePublishErrorMessage(
        new AggregateError([
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5672'), {
            code: 'ECONNREFUSED',
          }),
        ]),
      ),
    ).toBe('connect ECONNREFUSED 127.0.0.1:5672');
  });
});
