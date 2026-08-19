import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, Message } from 'amqplib';
import {
  REVOCATION_MESSAGING,
  WORKER_RUNTIME,
} from './event-processing.constants';
import {
  NonRetryableEventError,
  safeErrorMessage,
} from './event-processing.errors';
import { RevocationDeliveryService } from './revocation-delivery.service';
import { parseRevocationMessage } from './revocation-message';

@Injectable()
export class RabbitMqConsumerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqConsumerService.name);
  private readonly enabled: boolean;
  private readonly activeDeliveries = new Set<Promise<void>>();
  private connection?: ChannelModel;
  private channel?: Channel;
  private connecting?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;
  private destroyed = false;

  constructor(
    private readonly deliveryService: RevocationDeliveryService,
    private readonly configService: ConfigService,
  ) {
    this.enabled = configService.getOrThrow<boolean>(
      'SYNC_WORKER_CONSUMER_ENABLED',
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('RabbitMQ revocation consumer is disabled');
      return;
    }

    this.triggerConnection();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    await this.connecting?.catch(() => undefined);
    await Promise.allSettled(this.activeDeliveries);
    await this.closeConnection();
  }

  async processMessage(channel: Channel, message: Message): Promise<void> {
    try {
      const event = parseRevocationMessage(message);
      await this.deliveryService.process(event);

      channel.ack(message);
      this.logger.log(`Event ${event.eventId} processed and acknowledged`);
    } catch (error) {
      if (error instanceof NonRetryableEventError) {
        channel.nack(message, false, false);
        this.logger.warn(
          `Rejected non-retryable RabbitMQ message: ${safeErrorMessage(error)}`,
        );
        return;
      }

      channel.nack(message, false, true);
      this.logger.error(
        `RabbitMQ message processing failed and was requeued: ${safeErrorMessage(error)}`,
      );
    }
  }

  private triggerConnection(): void {
    if (this.destroyed || this.connection || this.connecting) {
      return;
    }

    this.connecting = this.connect();
    void this.connecting
      .catch((error: unknown) => {
        this.logger.warn(
          `RabbitMQ consumer connection failed: ${safeErrorMessage(error)}`,
        );
        this.scheduleReconnect();
      })
      .finally(() => {
        this.connecting = undefined;
      });
  }

  private async connect(): Promise<void> {
    const rabbitMqUrl = this.configService.getOrThrow<string>('RABBITMQ_URL');
    const connectionUrl = new URL(rabbitMqUrl);

    if (!connectionUrl.searchParams.has('heartbeat')) {
      connectionUrl.searchParams.set(
        'heartbeat',
        String(WORKER_RUNTIME.heartbeatSeconds),
      );
    }

    const connection = await amqp.connect(connectionUrl.toString(), {
      timeout: WORKER_RUNTIME.connectionTimeoutMs,
    });

    connection.on('error', (error: unknown) => {
      this.logger.warn(
        `RabbitMQ consumer connection error: ${safeErrorMessage(error)}`,
      );
    });
    connection.on('close', () => {
      if (this.connection === connection) {
        this.connection = undefined;
        this.channel = undefined;
        this.scheduleReconnect();
      }
    });

    try {
      const channel = await connection.createChannel();

      channel.on('error', (error: unknown) => {
        this.logger.warn(
          `RabbitMQ consumer channel error: ${safeErrorMessage(error)}`,
        );
      });
      channel.on('close', () => {
        if (this.channel === channel) {
          this.channel = undefined;
          void connection.close().catch(() => undefined);
        }
      });
      await this.assertTopology(channel);
      await channel.prefetch(WORKER_RUNTIME.prefetchCount);
      await channel.consume(
        REVOCATION_MESSAGING.queue,
        (message) => {
          if (!message) {
            return;
          }

          const processing = this.processMessage(channel, message);

          this.activeDeliveries.add(processing);
          void processing
            .catch((error: unknown) => {
              this.logger.error(
                `RabbitMQ message settlement failed: ${safeErrorMessage(error)}`,
              );
            })
            .finally(() => {
              this.activeDeliveries.delete(processing);
            });
        },
        { noAck: false },
      );

      if (this.destroyed) {
        await channel.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
        return;
      }

      this.connection = connection;
      this.channel = channel;
      this.logger.log(
        `Consuming ${REVOCATION_MESSAGING.queue} with prefetch ${WORKER_RUNTIME.prefetchCount}`,
      );
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(
      REVOCATION_MESSAGING.deadLetterExchange,
      REVOCATION_MESSAGING.exchangeType,
      { durable: true },
    );
    await channel.assertQueue(REVOCATION_MESSAGING.deadLetterQueue, {
      durable: true,
    });
    await channel.bindQueue(
      REVOCATION_MESSAGING.deadLetterQueue,
      REVOCATION_MESSAGING.deadLetterExchange,
      REVOCATION_MESSAGING.deadLetterRoutingKey,
    );
    await channel.assertExchange(
      REVOCATION_MESSAGING.exchange,
      REVOCATION_MESSAGING.exchangeType,
      { durable: true },
    );
    await channel.assertQueue(REVOCATION_MESSAGING.queue, {
      durable: true,
      deadLetterExchange: REVOCATION_MESSAGING.deadLetterExchange,
      deadLetterRoutingKey: REVOCATION_MESSAGING.deadLetterRoutingKey,
    });
    await channel.bindQueue(
      REVOCATION_MESSAGING.queue,
      REVOCATION_MESSAGING.exchange,
      REVOCATION_MESSAGING.routingKey,
    );
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.triggerConnection();
    }, WORKER_RUNTIME.reconnectDelayMs);
    this.reconnectTimer.unref();
  }

  private async closeConnection(): Promise<void> {
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
