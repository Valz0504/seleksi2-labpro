import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };
  const rabbitMqPublisher = {
    checkReadiness: jest.fn(),
  };
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ result: 1 }]);
    rabbitMqPublisher.checkReadiness.mockResolvedValue(undefined);
    service = new HealthService(prisma as never, rabbitMqPublisher as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports liveness without checking external dependencies', () => {
    expect(service.liveness()).toMatchObject({
      status: 'ok',
      service: 'auth-server',
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(rabbitMqPublisher.checkReadiness).not.toHaveBeenCalled();
  });

  it('reports ready when the database and RabbitMQ both respond', async () => {
    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ready',
      dependencies: {
        primaryDatabase: 'ok',
        rabbitmq: 'ok',
      },
    });
  });

  it('reports each failed dependency without exposing its error', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database connection URL'));
    rabbitMqPublisher.checkReadiness.mockRejectedValue(
      new Error('RabbitMQ credential'),
    );

    const report = await service.readiness();

    expect(report).toMatchObject({
      status: 'not_ready',
      dependencies: {
        primaryDatabase: 'unavailable',
        rabbitmq: 'unavailable',
      },
    });
    expect(JSON.stringify(report)).not.toContain('database connection URL');
    expect(JSON.stringify(report)).not.toContain('RabbitMQ credential');
  });

  it('marks slow dependencies unavailable after a bounded wait', async () => {
    jest.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => undefined));
    rabbitMqPublisher.checkReadiness.mockReturnValue(
      new Promise(() => undefined),
    );

    const reportPromise = service.readiness();

    await jest.advanceTimersByTimeAsync(2_000);

    await expect(reportPromise).resolves.toMatchObject({
      status: 'not_ready',
      dependencies: {
        primaryDatabase: 'unavailable',
        rabbitmq: 'unavailable',
      },
    });
  });
});
