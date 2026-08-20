import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fingerprintRevocationEvent,
  parseRevocationEvent,
  type RevocationEvent,
} from '@seleksi/shared';
import { EventDeliveryStatus } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import {
  DeadLetterPublisherService,
  type RevocationDeadLetter,
} from './dead-letter-publisher.service';
import { WORKER_RUNTIME } from './event-processing.constants';
import {
  NonRetryableEventError,
  safeErrorMessage,
} from './event-processing.errors';
import {
  InternalLogoutClientService,
  type LogoutNotificationTarget,
} from './internal-logout-client.service';
import {
  type DeliveryOutcome,
  WorkerMetricsService,
} from '../metrics/worker-metrics.service';

@Injectable()
export class RevocationDeliveryService {
  private readonly logger = new Logger(RevocationDeliveryService.name);
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly internalLogoutClient: InternalLogoutClientService,
    private readonly deadLetterPublisher: DeadLetterPublisherService,
    private readonly metrics: WorkerMetricsService,
    configService: ConfigService,
  ) {
    this.maxAttempts = configService.getOrThrow<number>(
      'DELIVERY_RETRY_MAX_ATTEMPTS',
    );
    this.retryBaseMs = configService.getOrThrow<number>(
      'DELIVERY_RETRY_BASE_MS',
    );
    this.retryMaxMs = configService.getOrThrow<number>('DELIVERY_RETRY_MAX_MS');
  }

  async process(event: RevocationEvent): Promise<void> {
    await this.assertStoredEvent(event);
    const targets = await this.resolveTargets(event);

    if (targets.length === 0) {
      return;
    }

    await this.prisma.eventDelivery.createMany({
      data: targets.map((target) => ({
        eventId: event.eventId,
        applicationId: target.id,
        status: EventDeliveryStatus.PENDING,
      })),
      skipDuplicates: true,
    });

    const deliveries = await this.prisma.eventDelivery.findMany({
      where: {
        eventId: event.eventId,
        applicationId: { in: targets.map((target) => target.id) },
      },
      select: {
        id: true,
        applicationId: true,
        status: true,
        attemptCount: true,
      },
    });
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const settled = await Promise.allSettled(
      deliveries.map((delivery) =>
        this.deliver(
          delivery,
          targetById.get(delivery.applicationId) as LogoutNotificationTarget,
          event,
        ),
      ),
    );
    const infrastructureFailure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (infrastructureFailure) {
      throw infrastructureFailure.reason;
    }
  }

  async processDueRetries(now = new Date()): Promise<void> {
    await this.recoverOrphanedDeliveries(now);

    const candidates = await this.prisma.eventDelivery.findMany({
      where: {
        status: EventDeliveryStatus.RETRYING,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
      take: WORKER_RUNTIME.retryBatchSize,
      select: {
        id: true,
        eventId: true,
        applicationId: true,
        status: true,
        attemptCount: true,
        nextRetryAt: true,
        lastError: true,
        application: {
          select: { id: true, logoutNotificationUrl: true },
        },
        event: { select: { payload: true } },
      },
    });
    const settled = await Promise.allSettled(
      candidates.map(async (delivery) => {
        const event = parseRevocationEvent(delivery.event.payload);

        if (event.eventId !== delivery.eventId) {
          throw new Error('Delivery event does not match its outbox record');
        }

        if (delivery.attemptCount >= this.maxAttempts) {
          await this.moveToDeadLetter(delivery, event, now);
          return;
        }

        await this.deliver(delivery, delivery.application, event);
      }),
    );
    const infrastructureFailure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (infrastructureFailure) {
      throw infrastructureFailure.reason;
    }
  }

  private async assertStoredEvent(event: RevocationEvent): Promise<void> {
    const stored = await this.prisma.outboxEvent.findUnique({
      where: { id: event.eventId },
      select: { payload: true },
    });

    if (!stored) {
      throw new NonRetryableEventError('Outbox event does not exist');
    }

    try {
      const storedEvent = parseRevocationEvent(stored.payload);

      if (
        fingerprintRevocationEvent(storedEvent) !==
        fingerprintRevocationEvent(event)
      ) {
        throw new Error();
      }
    } catch {
      throw new NonRetryableEventError(
        'Queued event does not match its outbox record',
      );
    }
  }

  private async resolveTargets(
    event: RevocationEvent,
  ): Promise<LogoutNotificationTarget[]> {
    const targets = await this.prisma.application.findMany({
      where: event.applicationId ? { id: event.applicationId } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        logoutNotificationUrl: true,
      },
    });

    if (event.applicationId && targets.length !== 1) {
      throw new NonRetryableEventError(
        'Target application for revocation event does not exist',
      );
    }

    return targets;
  }

  private async deliver(
    delivery: {
      id: string;
      status: EventDeliveryStatus;
      attemptCount: number;
      nextRetryAt?: Date | null;
    },
    target: LogoutNotificationTarget,
    event: RevocationEvent,
  ): Promise<void> {
    if (
      delivery.status !== EventDeliveryStatus.PENDING &&
      delivery.status !== EventDeliveryStatus.RETRYING
    ) {
      return;
    }

    const attemptedAt = new Date();
    const attemptNumber = delivery.attemptCount + 1;
    const retryEligibility =
      delivery.status === EventDeliveryStatus.RETRYING
        ? {
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: attemptedAt } }],
          }
        : {};
    const claim = await this.prisma.eventDelivery.updateMany({
      where: {
        id: delivery.id,
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        ...retryEligibility,
      },
      data: {
        status: EventDeliveryStatus.PROCESSING,
        attemptCount: { increment: 1 },
        lastAttemptAt: attemptedAt,
        nextRetryAt: null,
        lastError: null,
      },
    });

    if (claim.count !== 1) {
      return;
    }

    const startedAt = process.hrtime.bigint();
    let outcome: DeliveryOutcome = 'error';

    try {
      try {
        await this.internalLogoutClient.deliver(target, event);
      } catch (error) {
        const failedAt = new Date();
        const safeError = safeErrorMessage(error);
        const exhausted = attemptNumber >= this.maxAttempts;
        const nextRetryAt = exhausted
          ? failedAt
          : new Date(failedAt.getTime() + this.retryDelayMs(attemptNumber));
        const retrying = await this.prisma.eventDelivery.updateMany({
          where: {
            id: delivery.id,
            status: EventDeliveryStatus.PROCESSING,
            attemptCount: attemptNumber,
          },
          data: {
            status: EventDeliveryStatus.RETRYING,
            nextRetryAt,
            lastError: safeError,
          },
        });

        if (retrying.count !== 1) {
          throw new Error('Failed request outcome could not be persisted');
        }

        const nextAction = exhausted
          ? 'has exhausted its attempts and is waiting for dead-letter publishing'
          : `will retry at ${nextRetryAt.toISOString()}`;

        outcome = 'retry';
        this.logger.warn(
          `Delivery ${delivery.id} to application ${target.id} ${nextAction}: ${safeError}`,
        );
        return;
      }

      const succeeded = await this.prisma.eventDelivery.updateMany({
        where: {
          id: delivery.id,
          status: EventDeliveryStatus.PROCESSING,
          attemptCount: attemptNumber,
        },
        data: {
          status: EventDeliveryStatus.SUCCEEDED,
          processedAt: new Date(),
          nextRetryAt: null,
          lastError: null,
        },
      });

      if (succeeded.count !== 1) {
        throw new Error('Claimed event delivery could not be marked succeeded');
      }

      outcome = 'success';
    } finally {
      this.metrics.recordDelivery(outcome, this.elapsedSeconds(startedAt));
    }
  }

  private async recoverOrphanedDeliveries(now: Date): Promise<void> {
    const staleBefore = new Date(
      now.getTime() - WORKER_RUNTIME.processingLeaseMs,
    );

    await this.prisma.eventDelivery.updateMany({
      where: {
        status: EventDeliveryStatus.PROCESSING,
        lastAttemptAt: { lte: staleBefore },
      },
      data: {
        status: EventDeliveryStatus.RETRYING,
        nextRetryAt: now,
      },
    });
  }

  private async moveToDeadLetter(
    delivery: {
      id: string;
      eventId: string;
      applicationId: string;
      status: EventDeliveryStatus;
      attemptCount: number;
      lastError: string | null;
    },
    event: RevocationEvent,
    now: Date,
  ): Promise<void> {
    const claim = await this.prisma.eventDelivery.updateMany({
      where: {
        id: delivery.id,
        status: EventDeliveryStatus.RETRYING,
        attemptCount: delivery.attemptCount,
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        status: EventDeliveryStatus.PROCESSING,
        lastAttemptAt: now,
        nextRetryAt: null,
      },
    });

    if (claim.count !== 1) {
      return;
    }

    const message: RevocationDeadLetter = {
      event,
      deliveryId: delivery.id,
      targetApplicationId: delivery.applicationId,
      attemptCount: delivery.attemptCount,
      lastError: delivery.lastError ?? 'Delivery attempts exhausted',
      failedAt: now.toISOString(),
    };

    try {
      await this.deadLetterPublisher.publish(message);
    } catch (error) {
      const retryAt = new Date(now.getTime() + this.retryBaseMs);
      const released = await this.prisma.eventDelivery.updateMany({
        where: {
          id: delivery.id,
          status: EventDeliveryStatus.PROCESSING,
          attemptCount: delivery.attemptCount,
        },
        data: {
          status: EventDeliveryStatus.RETRYING,
          nextRetryAt: retryAt,
        },
      });

      if (released.count !== 1) {
        throw new Error('Dead-letter publish failure could not be persisted');
      }

      this.logger.warn(
        `Dead-letter publish for delivery ${delivery.id} will retry at ${retryAt.toISOString()}: ${safeErrorMessage(error)}`,
      );
      return;
    }

    const failed = await this.prisma.eventDelivery.updateMany({
      where: {
        id: delivery.id,
        status: EventDeliveryStatus.PROCESSING,
        attemptCount: delivery.attemptCount,
      },
      data: {
        status: EventDeliveryStatus.FAILED,
        nextRetryAt: null,
      },
    });

    if (failed.count !== 1) {
      throw new Error('Dead-lettered delivery could not be marked failed');
    }

    this.metrics.recordTerminalFailure();
    this.logger.error(
      `Delivery ${delivery.id} to application ${delivery.applicationId} moved to the dead-letter queue after ${delivery.attemptCount} attempts`,
    );
  }

  private retryDelayMs(attemptNumber: number): number {
    const exponent = Math.min(Math.max(attemptNumber - 1, 0), 30);

    return Math.min(this.retryBaseMs * 2 ** exponent, this.retryMaxMs);
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
