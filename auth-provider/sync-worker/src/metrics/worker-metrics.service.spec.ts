import { WorkerMetricsService } from './worker-metrics.service';

describe('WorkerMetricsService', () => {
  it('renders HTTP, message, delivery, queue, and dependency metrics', async () => {
    const service = new WorkerMetricsService();

    service.recordHttpRequest('GET', '/metrics', 200, 0.01);
    service.recordMessage('ack', 0.1);
    service.recordDelivery('success', 0.08);
    service.setDatabaseMetrics({ SUCCEEDED: 5, RETRYING: 1 });
    service.setRabbitMqMetrics({
      mainReady: 2,
      mainConsumers: 1,
      deadLetterReady: 3,
      inFlight: 1,
    });

    const output = await service.renderPrometheus();

    expect(output).toContain('sync_worker_messages_total{outcome="ack"} 1');
    expect(output).toContain(
      'sync_worker_delivery_attempts_total{outcome="success"} 1',
    );
    expect(output).toContain(
      'sync_worker_rabbitmq_queue_messages_ready{queue="dead_letter"} 3',
    );
    expect(output).toContain('sync_worker_messages_in_flight 1');
    expect(output).not.toContain('userId');
  });
});
