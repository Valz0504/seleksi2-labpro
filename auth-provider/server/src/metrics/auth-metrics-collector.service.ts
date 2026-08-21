import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqPublisherService } from '../event-processing/rabbitmq-publisher.service';
import { AuthMetricsService } from './auth-metrics.service';
import type { AuthEventMetric } from './auth-metrics.service';

const OUTBOX_STATUSES = ['PENDING', 'PUBLISHED'] as const;
const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'RETRYING',
  'FAILED',
] as const;
const AUTH_EVENT_MAPPING = {
  LoginSucceeded: { operation: 'login', outcome: 'success' },
  LoginFailed: { operation: 'login', outcome: 'failure' },
  PolicyDenied: { operation: 'authorize', outcome: 'denied' },
  AccessTokenIssued: { operation: 'token', outcome: 'issued' },
} as const;

@Injectable()
export class AuthMetricsCollectorService {
  private activeRefresh?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
    private readonly metrics: AuthMetricsService,
  ) {}

  async renderPrometheus(): Promise<string> {
    await this.refresh();
    return this.metrics.renderPrometheus();
  }

  async snapshot() {
    await this.refresh();
    return this.metrics.snapshot();
  }

  async refresh(): Promise<void> {
    if (!this.activeRefresh) {
      this.activeRefresh = Promise.all([
        this.refreshDatabaseMetrics(),
        this.refreshRabbitMqMetrics(),
      ])
        .then(() => undefined)
        .finally(() => {
          this.activeRefresh = undefined;
        });
    }

    await this.activeRefresh;
  }

  private async refreshDatabaseMetrics(): Promise<void> {
    try {
      const [outboxGroups, deliveryGroups, authGroups] = await Promise.all([
        this.prisma.outboxEvent.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.eventDelivery.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.auditLog.groupBy({
          by: ['eventType'],
          where: { eventType: { in: Object.keys(AUTH_EVENT_MAPPING) } },
          _count: { _all: true },
        }),
      ]);
      const outbox = Object.fromEntries(
        OUTBOX_STATUSES.map((status) => [status, 0]),
      ) as Record<(typeof OUTBOX_STATUSES)[number], number>;
      const deliveries = Object.fromEntries(
        DELIVERY_STATUSES.map((status) => [status, 0]),
      ) as Record<(typeof DELIVERY_STATUSES)[number], number>;

      for (const group of outboxGroups) {
        outbox[group.status] = group._count._all;
      }
      for (const group of deliveryGroups) {
        deliveries[group.status] = group._count._all;
      }
      const authCounts = new Map(
        authGroups.map((group) => [group.eventType, group._count._all]),
      );
      const authEvents: AuthEventMetric[] = Object.entries(
        AUTH_EVENT_MAPPING,
      ).map(([eventType, mapping]) => ({
        ...mapping,
        count: authCounts.get(eventType) ?? 0,
      }));

      this.metrics.setDatabaseMetrics(outbox, deliveries, authEvents);
    } catch {
      this.metrics.setDatabaseUnavailable();
    }
  }

  private async refreshRabbitMqMetrics(): Promise<void> {
    try {
      const queues = await this.rabbitMqPublisher.getQueueMetrics();

      this.metrics.setRabbitMqMetrics({
        mainReady: queues.main.messagesReady,
        mainConsumers: queues.main.consumers,
        deadLetterReady: queues.deadLetter.messagesReady,
      });
    } catch {
      this.metrics.setRabbitMqUnavailable();
    }
  }
}
