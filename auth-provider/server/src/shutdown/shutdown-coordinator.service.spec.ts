import { Logger } from '@nestjs/common';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

describe('ShutdownCoordinatorService', () => {
  const state = {
    beginDraining: jest.fn(),
    waitForIdle: jest.fn(),
    activeRequests: jest.fn(),
  };
  const outboxPublisher = {
    stopPolling: jest.fn(),
    waitForIdle: jest.fn(),
  };
  const rabbitMqPublisher = {
    close: jest.fn(),
  };
  const prisma = {
    $disconnect: jest.fn(),
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
    state.waitForIdle.mockResolvedValue(undefined);
    state.activeRequests.mockReturnValue(0);
    outboxPublisher.waitForIdle.mockResolvedValue(undefined);
    rabbitMqPublisher.close.mockResolvedValue(undefined);
    prisma.$disconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const createService = () =>
    new ShutdownCoordinatorService(
      state as never,
      outboxPublisher as never,
      rabbitMqPublisher as never,
      prisma as never,
      httpAdapterHost as never,
      configService as never,
    );

  it('drains active HTTP and outbox work before closing dependencies', async () => {
    let finishHttp: (() => void) | undefined;
    let finishOutbox: (() => void) | undefined;

    state.waitForIdle.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHttp = resolve;
      }),
    );
    outboxPublisher.waitForIdle.mockReturnValue(
      new Promise<void>((resolve) => {
        finishOutbox = resolve;
      }),
    );
    const shutdown = createService().onModuleDestroy();

    expect(state.beginDraining).toHaveBeenCalledTimes(1);
    expect(httpServer.close).toHaveBeenCalledTimes(1);
    expect(outboxPublisher.stopPolling).toHaveBeenCalledTimes(1);
    expect(rabbitMqPublisher.close).not.toHaveBeenCalled();

    finishHttp?.();
    finishOutbox?.();
    await shutdown;

    expect(rabbitMqPublisher.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(rabbitMqPublisher.close.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$disconnect.mock.invocationCallOrder[0],
    );
  });

  it('uses a bounded wait and remains idempotent', async () => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    state.waitForIdle.mockReturnValue(new Promise(() => undefined));
    outboxPublisher.waitForIdle.mockReturnValue(new Promise(() => undefined));
    state.activeRequests.mockReturnValue(1);
    const service = createService();
    const firstShutdown = service.onModuleDestroy();
    const secondShutdown = service.onModuleDestroy();

    expect(firstShutdown).toBe(secondShutdown);
    await jest.advanceTimersByTimeAsync(1_000);
    await firstShutdown;

    expect(rabbitMqPublisher.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
