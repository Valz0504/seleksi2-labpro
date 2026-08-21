import { AuthMetricsService } from './auth-metrics.service';

describe('AuthMetricsService', () => {
  it('renders RED and operational metrics using bounded labels', async () => {
    const service = new AuthMetricsService();

    service.recordHttpRequest('GET', '/admin/users/:userId', 200, 0.025);
    service.recordHttpRequest('POST', '/auth/login', 401, 0.05);
    service.recordOutboxPublish('success', 0.01);
    service.setDatabaseMetrics(
      { PENDING: 1, PUBLISHED: 4 },
      { PENDING: 0, PROCESSING: 0, SUCCEEDED: 8, RETRYING: 1, FAILED: 0 },
      [{ operation: 'login', outcome: 'success', count: 3 }],
    );
    service.setRabbitMqMetrics({
      mainReady: 2,
      mainConsumers: 1,
      deadLetterReady: 0,
    });

    const output = await service.renderPrometheus();

    expect(output).toContain(
      'auth_provider_http_requests_total{method="GET",route="/admin/users/:userId",status_code="200"} 1',
    );
    expect(output).toContain(
      'auth_provider_http_request_errors_total{method="POST",route="/auth/login",status_code="401"} 1',
    );
    expect(output).toContain(
      'auth_provider_rabbitmq_queue_messages_ready{queue="main"} 2',
    );
    expect(output).not.toContain('user@example.com');
  });

  it('provides a safe aggregate snapshot for the admin dashboard', () => {
    const service = new AuthMetricsService();

    service.recordHttpRequest('GET', '/health', 500, 0.2);
    service.setRabbitMqUnavailable();

    expect(service.snapshot()).toMatchObject({
      http: { requests: 1, errors: 1, averageDurationMs: 200 },
      dependencies: { primaryDatabase: 0, rabbitmq: 0 },
    });
  });
});
