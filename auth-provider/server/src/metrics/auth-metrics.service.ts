import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export type OutboxPublishOutcome = 'failure' | 'success';

export interface AuthEventMetric {
  operation: 'authorize' | 'login' | 'token';
  outcome: 'denied' | 'failure' | 'issued' | 'success';
  count: number;
}

interface OperationalMetrics {
  dependencies: {
    primaryDatabase: 0 | 1;
    rabbitmq: 0 | 1;
  };
  outbox: Record<'PENDING' | 'PUBLISHED', number>;
  deliveries: Record<
    'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'RETRYING' | 'FAILED',
    number
  >;
  queues: {
    mainReady: number;
    mainConsumers: number;
    deadLetterReady: number;
  };
}

@Injectable()
export class AuthMetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter({
    name: 'auth_provider_http_requests_total',
    help: 'Total HTTP requests handled by the Auth Provider.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly httpErrors = new Counter({
    name: 'auth_provider_http_request_errors_total',
    help: 'Total Auth Provider HTTP responses with a 4xx or 5xx status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'auth_provider_http_request_duration_seconds',
    help: 'Auth Provider HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly authEvents = new Gauge({
    name: 'auth_provider_auth_events_total',
    help: 'Total authentication and authorization outcomes.',
    labelNames: ['operation', 'outcome'] as const,
    registers: [this.registry],
  });
  private readonly outboxPublishAttempts = new Counter({
    name: 'auth_provider_outbox_publish_attempts_total',
    help: 'Total attempted outbox publishes grouped by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  private readonly outboxPublishDuration = new Histogram({
    name: 'auth_provider_outbox_publish_duration_seconds',
    help: 'Outbox publish attempt duration in seconds.',
    labelNames: ['outcome'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly outboxEvents = new Gauge({
    name: 'auth_provider_outbox_events',
    help: 'Current number of outbox events by status.',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly eventDeliveries = new Gauge({
    name: 'auth_provider_event_deliveries',
    help: 'Current number of event delivery records by status.',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly queueMessagesReady = new Gauge({
    name: 'auth_provider_rabbitmq_queue_messages_ready',
    help: 'Current number of ready RabbitMQ messages.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  private readonly queueConsumers = new Gauge({
    name: 'auth_provider_rabbitmq_queue_consumers',
    help: 'Current number of RabbitMQ consumers.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  private readonly dependencyUp = new Gauge({
    name: 'auth_provider_dependency_up',
    help: 'Whether an Auth Provider dependency is currently reachable.',
    labelNames: ['dependency'] as const,
    registers: [this.registry],
  });

  private httpRequestTotal = 0;
  private httpErrorTotal = 0;
  private httpDurationSeconds = 0;
  private readonly authEventTotals = new Map<string, number>();
  private readonly outboxPublishTotals: Record<OutboxPublishOutcome, number> = {
    failure: 0,
    success: 0,
  };
  private operational: OperationalMetrics = {
    dependencies: { primaryDatabase: 0, rabbitmq: 0 },
    outbox: { PENDING: 0, PUBLISHED: 0 },
    deliveries: {
      PENDING: 0,
      PROCESSING: 0,
      SUCCEEDED: 0,
      RETRYING: 0,
      FAILED: 0,
    },
    queues: { mainReady: 0, mainConsumers: 0, deadLetterReady: 0 },
  };

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };

    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
    this.httpRequestTotal += 1;
    this.httpDurationSeconds += durationSeconds;

    if (statusCode >= 400) {
      this.httpErrors.inc(labels);
      this.httpErrorTotal += 1;
    }
  }

  recordOutboxPublish(
    outcome: OutboxPublishOutcome,
    durationSeconds: number,
  ): void {
    this.outboxPublishAttempts.inc({ outcome });
    this.outboxPublishDuration.observe({ outcome }, durationSeconds);
    this.outboxPublishTotals[outcome] += 1;
  }

  setDatabaseMetrics(
    outbox: OperationalMetrics['outbox'],
    deliveries: OperationalMetrics['deliveries'],
    authEvents: AuthEventMetric[],
  ): void {
    this.operational = {
      ...this.operational,
      dependencies: {
        ...this.operational.dependencies,
        primaryDatabase: 1,
      },
      outbox: { ...outbox },
      deliveries: { ...deliveries },
    };

    for (const [status, count] of Object.entries(outbox)) {
      this.outboxEvents.set({ status }, count);
    }
    for (const [status, count] of Object.entries(deliveries)) {
      this.eventDeliveries.set({ status }, count);
    }
    this.authEvents.reset();
    this.authEventTotals.clear();
    for (const event of authEvents) {
      this.authEvents.set(
        { operation: event.operation, outcome: event.outcome },
        event.count,
      );
      this.authEventTotals.set(
        `${event.operation}:${event.outcome}`,
        event.count,
      );
    }
    this.dependencyUp.set({ dependency: 'primary_database' }, 1);
  }

  setDatabaseUnavailable(): void {
    this.operational.dependencies.primaryDatabase = 0;
    this.dependencyUp.set({ dependency: 'primary_database' }, 0);
  }

  setRabbitMqMetrics(input: {
    mainReady: number;
    mainConsumers: number;
    deadLetterReady: number;
  }): void {
    this.operational = {
      ...this.operational,
      dependencies: { ...this.operational.dependencies, rabbitmq: 1 },
      queues: { ...input },
    };
    this.queueMessagesReady.set({ queue: 'main' }, input.mainReady);
    this.queueMessagesReady.set(
      { queue: 'dead_letter' },
      input.deadLetterReady,
    );
    this.queueConsumers.set({ queue: 'main' }, input.mainConsumers);
    this.dependencyUp.set({ dependency: 'rabbitmq' }, 1);
  }

  setRabbitMqUnavailable(): void {
    this.operational.dependencies.rabbitmq = 0;
    this.dependencyUp.set({ dependency: 'rabbitmq' }, 0);
  }

  prometheusContentType(): string {
    return this.registry.contentType;
  }

  renderPrometheus(): Promise<string> {
    return this.registry.metrics();
  }

  snapshot() {
    return {
      generatedAt: new Date().toISOString(),
      http: {
        requests: this.httpRequestTotal,
        errors: this.httpErrorTotal,
        averageDurationMs:
          this.httpRequestTotal === 0
            ? 0
            : (this.httpDurationSeconds / this.httpRequestTotal) * 1_000,
      },
      auth: Object.fromEntries(this.authEventTotals),
      outboxPublish: { ...this.outboxPublishTotals },
      ...structuredClone(this.operational),
    };
  }
}
