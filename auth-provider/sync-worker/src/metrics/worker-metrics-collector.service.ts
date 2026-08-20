import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqConsumerService } from '../event-processing/rabbitmq-consumer.service';
import { WorkerMetricsService } from './worker-metrics.service';

const DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'RETRYING',
  'FAILED',
] as const;

@Injectable()
export class WorkerMetricsCollectorService {
  private activeRefresh?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumer: RabbitMqConsumerService,
    private readonly metrics: WorkerMetricsService,
  ) {}

  async renderPrometheus(): Promise<string> {
    await this.refresh();
    return this.metrics.renderPrometheus();
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
      const groups = await this.prisma.eventDelivery.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      const deliveries = Object.fromEntries(
        DELIVERY_STATUSES.map((status) => [status, 0]),
      ) as Record<(typeof DELIVERY_STATUSES)[number], number>;

      for (const group of groups) {
        deliveries[group.status] = group._count._all;
      }

      this.metrics.setDatabaseMetrics(deliveries);
    } catch {
      this.metrics.setDatabaseUnavailable();
    }
  }

  private async refreshRabbitMqMetrics(): Promise<void> {
    const inFlight = this.consumer.inFlightCount();

    try {
      const queues = await this.consumer.getQueueMetrics();

      this.metrics.setRabbitMqMetrics({
        mainReady: queues.main.messagesReady,
        mainConsumers: queues.main.consumers,
        deadLetterReady: queues.deadLetter.messagesReady,
        inFlight,
      });
    } catch {
      this.metrics.setRabbitMqUnavailable(inFlight);
    }
  }
}
