import { Injectable, Logger } from '@nestjs/common';
import {
  fingerprintRevocationEvent,
  parseRevocationEvent,
  type RevocationEvent,
} from '@seleksi/shared';
import { EventDeliveryStatus } from '../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import {
  NonRetryableEventError,
  safeErrorMessage,
} from './event-processing.errors';
import {
  InternalLogoutClientService,
  type LogoutNotificationTarget,
} from './internal-logout-client.service';

@Injectable()
export class RevocationDeliveryService {
  private readonly logger = new Logger(RevocationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internalLogoutClient: InternalLogoutClientService,
  ) {}

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
    },
    target: LogoutNotificationTarget,
    event: RevocationEvent,
  ): Promise<void> {
    if (delivery.status !== EventDeliveryStatus.PENDING) {
      return;
    }

    const attemptedAt = new Date();
    const attemptNumber = delivery.attemptCount + 1;
    const claim = await this.prisma.eventDelivery.updateMany({
      where: {
        id: delivery.id,
        status: EventDeliveryStatus.PENDING,
        attemptCount: delivery.attemptCount,
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

    try {
      await this.internalLogoutClient.deliver(target, event);
    } catch (error) {
      const safeError = safeErrorMessage(error);
      const retrying = await this.prisma.eventDelivery.updateMany({
        where: {
          id: delivery.id,
          status: EventDeliveryStatus.PROCESSING,
          attemptCount: attemptNumber,
        },
        data: {
          status: EventDeliveryStatus.RETRYING,
          nextRetryAt: null,
          lastError: safeError,
        },
      });

      if (retrying.count !== 1) {
        throw new Error('Failed request outcome could not be persisted');
      }

      this.logger.warn(
        `Delivery ${delivery.id} to application ${target.id} is waiting for retry: ${safeError}`,
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
  }
}
