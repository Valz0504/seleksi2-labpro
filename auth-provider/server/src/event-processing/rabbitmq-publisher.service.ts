import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RevocationEvent } from '@seleksi/shared';
import * as amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel, Message } from 'amqplib';
import { REVOCATION_MESSAGING } from './event-processing.constants';

const MAX_SAFE_ERROR_LENGTH = 500;

export function safePublishErrorMessage(error: unknown): string {
  let message = 'Unknown RabbitMQ publish error';

  if (error instanceof AggregateError) {
    const details = error.errors
      .map((nestedError) => safePublishErrorMessage(nestedError))
      .filter((detail) => detail !== 'Unknown RabbitMQ publish error');

    message = details.length > 0 ? details.join('; ') : error.name;
  } else if (error instanceof Error) {
    const errorCode =
      'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;

    message = error.message.trim() || errorCode || error.name;
  }

  return message
    .replace(/(amqps?:\/\/)[^@\s]+@/gi, '$1[redacted]@')
    .slice(0, MAX_SAFE_ERROR_LENGTH);
}

export class RabbitMqPublishError extends Error {
  constructor(cause: unknown) {
    super(safePublishErrorMessage(cause), { cause });
    this.name = 'RabbitMqPublishError';
  }
}

export interface RabbitMqQueueMetrics {
  main: {
    messagesReady: number;
    consumers: number;
  };
  deadLetter: {
    messagesReady: number;
  };
}

@Injectable()
export class RabbitMqPublisherService {
  private readonly logger = new Logger(RabbitMqPublisherService.name);
  private readonly confirmTimeoutMs: number;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private connecting?: Promise<ConfirmChannel>;
  private destroyed = false;

  constructor(private readonly configService: ConfigService) {
    this.confirmTimeoutMs = configService.getOrThrow<number>(
      'RABBITMQ_PUBLISH_CONFIRM_TIMEOUT_MS',
    );
  }

  async publish(event: RevocationEvent): Promise<void> {
    try {
      const channel = await this.getChannel();

      await this.publishWithConfirm(channel, event);
    } catch (error) {
      await this.resetConnection();
      throw new RabbitMqPublishError(error);
    }
  }

  async checkReadiness(): Promise<void> {
    try {
      const channel = await this.getChannel();

      await channel.checkQueue(REVOCATION_MESSAGING.queue);
    } catch (error) {
      await this.resetConnection();
      throw new RabbitMqPublishError(error);
    }
  }

  async getQueueMetrics(): Promise<RabbitMqQueueMetrics> {
    try {
      const channel = await this.getChannel();
      const [main, deadLetter] = await Promise.all([
        channel.checkQueue(REVOCATION_MESSAGING.queue),
        channel.checkQueue(REVOCATION_MESSAGING.deadLetterQueue),
      ]);

      return {
        main: {
          messagesReady: main.messageCount,
          consumers: main.consumerCount,
        },
        deadLetter: {
          messagesReady: deadLetter.messageCount,
        },
      };
    } catch (error) {
      await this.resetConnection();
      throw new RabbitMqPublishError(error);
    }
  }

  async close(): Promise<void> {
    this.destroyed = true;

    if (this.connecting) {
      await this.connecting.catch(() => undefined);
    }

    await this.resetConnection();
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.destroyed) {
      throw new Error('RabbitMQ publisher is shutting down');
    }

    if (this.channel) {
      return this.channel;
    }

    if (!this.connecting) {
      this.connecting = this.connect();
    }

    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async connect(): Promise<ConfirmChannel> {
    const rabbitMqUrl = this.configService.getOrThrow<string>('RABBITMQ_URL');
    const timeout = this.configService.getOrThrow<number>(
      'RABBITMQ_CONNECTION_TIMEOUT_MS',
    );
    const heartbeat = this.configService.getOrThrow<number>(
      'RABBITMQ_HEARTBEAT_SECONDS',
    );
    const connectionUrl = new URL(rabbitMqUrl);

    if (!connectionUrl.searchParams.has('heartbeat')) {
      connectionUrl.searchParams.set('heartbeat', String(heartbeat));
    }

    const connection = await amqp.connect(connectionUrl.toString(), {
      timeout,
    });

    connection.on('error', (error: unknown) => {
      this.logger.warn(
        `RabbitMQ connection error: ${safePublishErrorMessage(error)}`,
      );
    });
    connection.on('close', () => {
      this.clearReferences(connection);
    });

    try {
      const channel = await connection.createConfirmChannel();

      channel.on('error', (error: unknown) => {
        this.logger.warn(
          `RabbitMQ channel error: ${safePublishErrorMessage(error)}`,
        );
      });
      channel.on('close', () => {
        this.clearReferences(connection, channel);
      });
      await this.assertTopology(channel);

      this.connection = connection;
      this.channel = channel;

      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(
      REVOCATION_MESSAGING.deadLetterExchange,
      REVOCATION_MESSAGING.exchangeType,
      { durable: true, autoDelete: false },
    );
    await channel.assertQueue(REVOCATION_MESSAGING.deadLetterQueue, {
      durable: true,
      autoDelete: false,
    });
    await channel.bindQueue(
      REVOCATION_MESSAGING.deadLetterQueue,
      REVOCATION_MESSAGING.deadLetterExchange,
      REVOCATION_MESSAGING.deadLetterRoutingKey,
    );
    await channel.assertExchange(
      REVOCATION_MESSAGING.exchange,
      REVOCATION_MESSAGING.exchangeType,
      { durable: true, autoDelete: false },
    );
    await channel.assertQueue(REVOCATION_MESSAGING.queue, {
      durable: true,
      autoDelete: false,
      deadLetterExchange: REVOCATION_MESSAGING.deadLetterExchange,
      deadLetterRoutingKey: REVOCATION_MESSAGING.deadLetterRoutingKey,
    });
    await channel.bindQueue(
      REVOCATION_MESSAGING.queue,
      REVOCATION_MESSAGING.exchange,
      REVOCATION_MESSAGING.routingKey,
    );
  }

  private publishWithConfirm(
    channel: ConfirmChannel,
    event: RevocationEvent,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let returnedMessage: Message | undefined;
      const onReturn = (message: Message) => {
        if (message.properties.messageId === event.eventId) {
          returnedMessage = message;
        }
      };
      const removeReturnListener = () => {
        channel.removeListener('return', onReturn);
      };
      const confirmTimeout = setTimeout(() => {
        removeReturnListener();
        reject(new Error('RabbitMQ publisher confirm timed out'));
      }, this.confirmTimeoutMs);

      confirmTimeout.unref();

      channel.on('return', onReturn);

      try {
        channel.publish(
          REVOCATION_MESSAGING.exchange,
          REVOCATION_MESSAGING.routingKey,
          Buffer.from(JSON.stringify(event), 'utf8'),
          {
            appId: 'auth-provider-server',
            contentEncoding: 'utf-8',
            contentType: 'application/json',
            deliveryMode: 2,
            mandatory: true,
            messageId: event.eventId,
            persistent: true,
            timestamp: Math.floor(new Date(event.occurredAt).getTime() / 1_000),
            type: event.eventType,
          },
          (error: unknown) => {
            clearTimeout(confirmTimeout);
            removeReturnListener();

            if (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error(safePublishErrorMessage(error)),
              );
              return;
            }

            if (returnedMessage) {
              reject(new Error('RabbitMQ returned an unroutable event'));
              return;
            }

            resolve();
          },
        );
      } catch (error) {
        clearTimeout(confirmTimeout);
        removeReturnListener();
        reject(
          error instanceof Error
            ? error
            : new Error(safePublishErrorMessage(error)),
        );
      }
    });
  }

  private clearReferences(
    connection: ChannelModel,
    channel?: ConfirmChannel,
  ): void {
    if (channel) {
      if (this.channel !== channel) {
        return;
      }

      this.channel = undefined;

      if (this.connection === connection) {
        this.connection = undefined;
        void connection.close().catch(() => undefined);
      }

      return;
    }

    if (this.connection === connection) {
      this.connection = undefined;
      this.channel = undefined;
    }
  }

  private async resetConnection(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;

    this.channel = undefined;
    this.connection = undefined;

    if (channel) {
      await channel.close().catch(() => undefined);
    }

    if (connection) {
      await connection.close().catch(() => undefined);
    }
  }
}
