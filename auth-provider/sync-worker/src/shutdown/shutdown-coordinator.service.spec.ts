import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

describe('ShutdownCoordinatorService', () => {
  const consumer = {
    shutdown: jest.fn(),
  };
  const retryService = {
    stopPolling: jest.fn(),
    waitForIdle: jest.fn(),
  };
  const prisma = {
    close: jest.fn(),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(1_000),
  };
  const httpServer = {
    listening: true,
    close: jest.fn(),
  };
  const httpAdapterHost = {
    httpAdapter: {
      getHttpServer: jest.fn().mockReturnValue(httpServer),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consumer.shutdown.mockResolvedValue({ drained: true, requeued: 0 });
    retryService.waitForIdle.mockResolvedValue(undefined);
    prisma.close.mockResolvedValue(undefined);
  });

  it('stops schedulers, drains deliveries, and closes the database once', async () => {
    let finishConsumer:
      ((value: { drained: true; requeued: 0 }) => void) | undefined;

    consumer.shutdown.mockReturnValue(
      new Promise((resolve) => {
        finishConsumer = resolve;
      }),
    );
    const service = new ShutdownCoordinatorService(
      consumer as never,
      retryService as never,
      prisma as never,
      httpAdapterHost as never,
      configService as never,
    );
    const firstShutdown = service.onModuleDestroy();
    const secondShutdown = service.onModuleDestroy();

    expect(firstShutdown).toBe(secondShutdown);
    expect(retryService.stopPolling).toHaveBeenCalledTimes(1);
    expect(httpServer.close).toHaveBeenCalledTimes(1);
    expect(consumer.shutdown).toHaveBeenCalledWith(1_000);
    expect(prisma.close).not.toHaveBeenCalled();

    finishConsumer?.({ drained: true, requeued: 0 });
    await firstShutdown;

    expect(prisma.close).toHaveBeenCalledTimes(1);
  });
});
