import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RevocationEvent } from '@seleksi/shared';
import { PrismaService } from '../database/prisma.service';
import {
  RabbitMqPublishError,
  RabbitMqPublisherService,
  safePublishErrorMessage,
} from './rabbitmq-publisher.service';

@Injectable()
export class OutboxPublisherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private timer?: NodeJS.Timeout;
  private activeCycle?: Promise<number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
    configService: ConfigService,
  ) {
    this.enabled = configService.getOrThrow<boolean>(
      'OUTBOX_PUBLISHER_ENABLED',
    );
    this.intervalMs = configService.getOrThrow<number>(
      'OUTBOX_PUBLISH_INTERVAL_MS',
    );
    this.batchSize = configService.getOrThrow<number>(
      'OUTBOX_PUBLISH_BATCH_SIZE',
    );
    this.leaseMs = configService.getOrThrow<number>('OUTBOX_PUBLISH_LEASE_MS');
    this.retryBaseMs = configService.getOrThrow<number>(
      'OUTBOX_PUBLISH_RETRY_BASE_MS',
    );
    this.retryMaxMs = configService.getOrThrow<number>(
      'OUTBOX_PUBLISH_RETRY_MAX_MS',
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Outbox publisher is disabled');
      return;
    }

    this.timer = setInterval(() => {
      this.triggerCycle();
    }, this.intervalMs);
    this.timer.unref();
    this.triggerCycle();
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async waitForIdle(): Promise<void> {
    await this.activeCycle?.catch(() => undefined);
  }

  async publishPendingBatch(): Promise<number> {
    const eligibleAt = new Date();
    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { nextPublishAttemptAt: null },
          { nextPublishAttemptAt: { lte: eligibleAt } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: this.batchSize,
      select: {
        id: true,
        payload: true,
        publishAttemptCount: true,
      },
    });
    let publishedCount = 0;

    for (const candidate of candidates) {
      const attemptStartedAt = new Date();
      const attemptNumber = candidate.publishAttemptCount + 1;
      const leaseExpiresAt = new Date(
        attemptStartedAt.getTime() + this.leaseMs,
      );
      const claim = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
          publishAttemptCount: candidate.publishAttemptCount,
          OR: [
            { nextPublishAttemptAt: null },
            { nextPublishAttemptAt: { lte: attemptStartedAt } },
          ],
        },
        data: {
          publishAttemptCount: { increment: 1 },
          lastPublishAttemptAt: attemptStartedAt,
          nextPublishAttemptAt: leaseExpiresAt,
          lastError: null,
        },
      });

      if (claim.count !== 1) {
        continue;
      }

      try {
        const event = candidate.payload as unknown as RevocationEvent;

        if (
          typeof event !== 'object' ||
          event === null ||
          event.eventId !== candidate.id
        ) {
          throw new Error('Outbox row id does not match payload eventId');
        }

        await this.rabbitMqPublisher.publish(event);

        const published = await this.prisma.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: 'PENDING',
            publishAttemptCount: attemptNumber,
          },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            nextPublishAttemptAt: null,
            lastError: null,
          },
        });

        publishedCount += published.count;
      } catch (error) {
        const failedAt = new Date();
        const retryAt = new Date(
          failedAt.getTime() + this.retryDelayMs(attemptNumber),
        );
        const safeError = safePublishErrorMessage(error);

        await this.prisma.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: 'PENDING',
            publishAttemptCount: attemptNumber,
          },
          data: {
            nextPublishAttemptAt: retryAt,
            lastError: safeError,
          },
        });
        this.logger.warn(
          `Outbox event ${candidate.id} publish failed; retry scheduled: ${safeError}`,
        );

        if (error instanceof RabbitMqPublishError) {
          break;
        }
      }
    }

    return publishedCount;
  }

  private triggerCycle(): void {
    if (this.activeCycle) {
      return;
    }

    const cycle = this.publishPendingBatch();

    this.activeCycle = cycle;
    void cycle
      .catch((error: unknown) => {
        this.logger.error(
          `Outbox publisher cycle failed: ${safePublishErrorMessage(error)}`,
        );
      })
      .finally(() => {
        if (this.activeCycle === cycle) {
          this.activeCycle = undefined;
        }
      });
  }

  private retryDelayMs(attemptNumber: number): number {
    const exponent = Math.min(Math.max(attemptNumber - 1, 0), 30);

    return Math.min(this.retryBaseMs * 2 ** exponent, this.retryMaxMs);
  }
}
