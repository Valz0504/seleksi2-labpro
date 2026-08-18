import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RevocationEvent } from '@seleksi/shared';
import * as amqp from 'amqplib';
import type { ConfirmChannel } from 'amqplib';
import {
  REVOCATION_MESSAGING,
  WORKER_RUNTIME,
} from './event-processing.constants';
import { safeErrorMessage } from './event-processing.errors';

export interface RevocationDeadLetter {
  event: RevocationEvent;
  deliveryId: string;
  targetApplicationId: string;
  attemptCount: number;
  lastError: string;
  failedAt: string;
}

@Injectable()
export class DeadLetterPublisherService {
  constructor(private readonly configService: ConfigService) {}

  async publish(message: RevocationDeadLetter): Promise<void> {
    const connectionUrl = new URL(
      this.configService.getOrThrow<string>('RABBITMQ_URL'),
    );
    connectionUrl.searchParams.set(
      'heartbeat',
      connectionUrl.searchParams.get('heartbeat') ??
        String(WORKER_RUNTIME.heartbeatSeconds),
    );

    let connection: Awaited<ReturnType<typeof amqp.connect>> | undefined;
    let channel: ConfirmChannel | undefined;

    try {
      connection = await amqp.connect(connectionUrl.toString(), {
        timeout: WORKER_RUNTIME.connectionTimeoutMs,
      });
      channel = await connection.createConfirmChannel();
      await channel.assertQueue(REVOCATION_MESSAGING.deadLetterQueue, {
        durable: true,
      });
      await this.sendConfirmed(channel, message);
    } catch (error) {
      throw new Error(safeErrorMessage(error), { cause: error });
    } finally {
      await channel?.close().catch(() => undefined);
      await connection?.close().catch(() => undefined);
    }
  }

  private sendConfirmed(
    channel: ConfirmChannel,
    message: RevocationDeadLetter,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Dead-letter publisher confirm timed out')),
        WORKER_RUNTIME.deadLetterConfirmTimeoutMs,
      );

      timeout.unref();

      try {
        channel.sendToQueue(
          REVOCATION_MESSAGING.deadLetterQueue,
          Buffer.from(JSON.stringify(message), 'utf8'),
          {
            appId: 'sync-worker',
            contentEncoding: 'utf-8',
            contentType: 'application/json',
            correlationId: message.event.eventId,
            deliveryMode: 2,
            messageId: message.deliveryId,
            persistent: true,
            timestamp: Math.floor(new Date(message.failedAt).getTime() / 1_000),
            type: 'RevocationDeliveryFailed',
          },
          (error) => {
            clearTimeout(timeout);

            if (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error(safeErrorMessage(error)),
              );
              return;
            }

            resolve();
          },
        );
      } catch (error) {
        clearTimeout(timeout);
        reject(
          error instanceof Error ? error : new Error(safeErrorMessage(error)),
        );
      }
    });
  }
}
