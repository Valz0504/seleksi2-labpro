import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export type MessageOutcome = 'ack' | 'dead_letter' | 'requeue';
export type DeliveryOutcome = 'error' | 'failed' | 'retry' | 'success';

@Injectable()
export class WorkerMetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter({
    name: 'sync_worker_http_requests_total',
    help: 'Total HTTP requests handled by the Sync Worker.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly httpErrors = new Counter({
    name: 'sync_worker_http_request_errors_total',
    help: 'Total Sync Worker HTTP responses with a 4xx or 5xx status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'sync_worker_http_request_duration_seconds',
    help: 'Sync Worker HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly messages = new Counter({
    name: 'sync_worker_messages_total',
    help: 'Total RabbitMQ messages settled by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  private readonly messageDuration = new Histogram({
    name: 'sync_worker_message_processing_duration_seconds',
    help: 'RabbitMQ message processing duration in seconds.',
    labelNames: ['outcome'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly deliveryAttempts = new Counter({
    name: 'sync_worker_delivery_attempts_total',
    help: 'Total application delivery attempts and terminal failures.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });
  private readonly deliveryDuration = new Histogram({
    name: 'sync_worker_delivery_attempt_duration_seconds',
    help: 'Application delivery attempt duration in seconds.',
    labelNames: ['outcome'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly messagesInFlight = new Gauge({
    name: 'sync_worker_messages_in_flight',
    help: 'Current RabbitMQ messages being processed by this worker.',
    registers: [this.registry],
  });
  private readonly deliveryRecords = new Gauge({
    name: 'sync_worker_delivery_records',
    help: 'Current number of durable delivery records by status.',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly queueMessagesReady = new Gauge({
    name: 'sync_worker_rabbitmq_queue_messages_ready',
    help: 'Current number of ready RabbitMQ messages.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  private readonly queueConsumers = new Gauge({
    name: 'sync_worker_rabbitmq_queue_consumers',
    help: 'Current number of RabbitMQ consumers.',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });
  private readonly dependencyUp = new Gauge({
    name: 'sync_worker_dependency_up',
    help: 'Whether a Sync Worker dependency is currently reachable.',
    labelNames: ['dependency'] as const,
    registers: [this.registry],
  });

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
    if (statusCode >= 400) {
      this.httpErrors.inc(labels);
    }
  }

  recordMessage(outcome: MessageOutcome, durationSeconds: number): void {
    this.messages.inc({ outcome });
    this.messageDuration.observe({ outcome }, durationSeconds);
  }

  recordDelivery(outcome: DeliveryOutcome, durationSeconds: number): void {
    this.deliveryAttempts.inc({ outcome });
    this.deliveryDuration.observe({ outcome }, durationSeconds);
  }

  recordTerminalFailure(): void {
    this.deliveryAttempts.inc({ outcome: 'failed' });
  }

  setDatabaseMetrics(deliveries: Record<string, number>): void {
    for (const [status, count] of Object.entries(deliveries)) {
      this.deliveryRecords.set({ status }, count);
    }
    this.dependencyUp.set({ dependency: 'primary_database' }, 1);
  }

  setDatabaseUnavailable(): void {
    this.dependencyUp.set({ dependency: 'primary_database' }, 0);
  }

  setRabbitMqMetrics(input: {
    mainReady: number;
    mainConsumers: number;
    deadLetterReady: number;
    inFlight: number;
  }): void {
    this.queueMessagesReady.set({ queue: 'main' }, input.mainReady);
    this.queueMessagesReady.set(
      { queue: 'dead_letter' },
      input.deadLetterReady,
    );
    this.queueConsumers.set({ queue: 'main' }, input.mainConsumers);
    this.messagesInFlight.set(input.inFlight);
    this.dependencyUp.set({ dependency: 'rabbitmq' }, 1);
  }

  setRabbitMqUnavailable(inFlight: number): void {
    this.messagesInFlight.set(inFlight);
    this.dependencyUp.set({ dependency: 'rabbitmq' }, 0);
  }

  prometheusContentType(): string {
    return this.registry.contentType;
  }

  renderPrometheus(): Promise<string> {
    return this.registry.metrics();
  }
}
