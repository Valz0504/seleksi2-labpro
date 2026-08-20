import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
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
import { WorkerMetricsService } from '../metrics/worker-metrics.service';

interface ActiveDelivery {
  channel: Channel;
  message: Message;
  processing: Promise<void>;
  settled: boolean;
  startedAt: bigint;
}

export interface ConsumerShutdownResult {
  drained: boolean;
  requeued: number;
}

export interface RabbitMqQueueMetrics {
  main: { messagesReady: number; consumers: number };
  deadLetter: { messagesReady: number; consumers: number };
}

@Injectable()
export class RabbitMqConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RabbitMqConsumerService.name);
  private readonly enabled: boolean;
  private readonly activeDeliveries = new Set<ActiveDelivery>();
  private connection?: ChannelModel;
  private channel?: Channel;
  private connecting?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;
  private consumerTag?: string;
  private destroyed = false;
  private shutdownPromise?: Promise<ConsumerShutdownResult>;

  constructor(
    private readonly deliveryService: RevocationDeliveryService,
    private readonly metrics: WorkerMetricsService,
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

  shutdown(timeoutMs: number): Promise<ConsumerShutdownResult> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.performShutdown(timeoutMs);
    }

    return this.shutdownPromise;
  }

  async getQueueMetrics(): Promise<RabbitMqQueueMetrics> {
    const channel = this.channel;

    if (!channel) {
      throw new Error('RabbitMQ consumer is not connected');
    }

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
        consumers: deadLetter.consumerCount,
      },
    };
  }

  inFlightCount(): number {
    return this.activeDeliveries.size;
  }

  private async performShutdown(
    timeoutMs: number,
  ): Promise<ConsumerShutdownResult> {
    this.destroyed = true;
    const deadline = Date.now() + timeoutMs;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.connecting) {
      await this.waitUntil(
        this.connecting.catch(() => undefined),
        deadline,
      );
    }

    const channel = this.channel;
    const consumerTag = this.consumerTag;

    this.consumerTag = undefined;
    if (channel && consumerTag) {
      await this.waitUntil(
        channel.cancel(consumerTag).catch((error: unknown) => {
          this.logger.warn(
            `Could not cancel RabbitMQ consumer cleanly: ${safeErrorMessage(error)}`,
          );
        }),
        deadline,
      );
    }

    const drained = await this.waitUntil(
      Promise.allSettled(
        [...this.activeDeliveries].map((delivery) => delivery.processing),
      ),
      deadline,
    );
    let requeued = 0;

    if (!drained) {
      for (const delivery of this.activeDeliveries) {
        if (delivery.settled) {
          continue;
        }

        delivery.settled = true;
        try {
          delivery.channel.nack(delivery.message, false, true);
          this.metrics.recordMessage(
            'requeue',
            this.elapsedSeconds(delivery.startedAt),
          );
          requeued += 1;
        } catch (error) {
          this.logger.warn(
            `Could not requeue an in-flight message during shutdown: ${safeErrorMessage(error)}`,
          );
        }
      }
    }

    await this.closeConnection();

    return { drained, requeued };
  }

  async processMessage(
    channel: Channel,
    message: Message,
    activeDelivery?: ActiveDelivery,
  ): Promise<void> {
    const startedAt = activeDelivery?.startedAt ?? process.hrtime.bigint();

    try {
      const event = parseRevocationMessage(message);
      await this.deliveryService.process(event);

      if (this.settle(activeDelivery, () => channel.ack(message))) {
        this.metrics.recordMessage('ack', this.elapsedSeconds(startedAt));
        this.logger.log(`Event ${event.eventId} processed and acknowledged`);
      }
    } catch (error) {
      if (error instanceof NonRetryableEventError) {
        if (
          this.settle(activeDelivery, () => channel.nack(message, false, false))
        ) {
          this.metrics.recordMessage(
            'dead_letter',
            this.elapsedSeconds(startedAt),
          );
          this.logger.warn(
            `Rejected non-retryable RabbitMQ message: ${safeErrorMessage(error)}`,
          );
        }
        return;
      }

      if (
        this.settle(activeDelivery, () => channel.nack(message, false, true))
      ) {
        this.metrics.recordMessage('requeue', this.elapsedSeconds(startedAt));
        this.logger.error(
          `RabbitMQ message processing failed and was requeued: ${safeErrorMessage(error)}`,
        );
      }
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
        this.consumerTag = undefined;
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
          this.consumerTag = undefined;
          void connection.close().catch(() => undefined);
        }
      });
      await this.assertTopology(channel);
      await channel.prefetch(WORKER_RUNTIME.prefetchCount);
      const consumer = await channel.consume(
        REVOCATION_MESSAGING.queue,
        (message) => {
          if (!message) {
            return;
          }

          const delivery = {
            channel,
            message,
            processing: Promise.resolve(),
            settled: false,
            startedAt: process.hrtime.bigint(),
          } satisfies ActiveDelivery;
          const processing = this.processMessage(channel, message, delivery);

          delivery.processing = processing;
          this.activeDeliveries.add(delivery);
          void processing
            .catch((error: unknown) => {
              this.logger.error(
                `RabbitMQ message settlement failed: ${safeErrorMessage(error)}`,
              );
            })
            .finally(() => {
              this.activeDeliveries.delete(delivery);
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
      this.consumerTag = consumer.consumerTag;
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
    this.consumerTag = undefined;

    if (channel) {
      await channel.close().catch(() => undefined);
    }

    if (connection) {
      await connection.close().catch(() => undefined);
    }
  }

  private settle(
    activeDelivery: ActiveDelivery | undefined,
    operation: () => void,
  ): boolean {
    if (activeDelivery?.settled) {
      return false;
    }

    if (activeDelivery) {
      activeDelivery.settled = true;
    }
    operation();
    return true;
  }

  private async waitUntil(
    work: Promise<unknown>,
    deadline: number,
  ): Promise<boolean> {
    const remainingMs = Math.max(deadline - Date.now(), 0);

    if (remainingMs === 0) {
      return false;
    }

    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      work.then(() => false),
      new Promise<true>((resolve) => {
        timer = setTimeout(() => resolve(true), remainingMs);
        timer.unref();
      }),
    ]);

    if (timer) {
      clearTimeout(timer);
    }

    return !timedOut;
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
