import { RevocationRetryService } from './revocation-retry.service';

describe('RevocationRetryService', () => {
  const deliveryService = {
    processDueRetries: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    deliveryService.processDueRetries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('starts immediately and polls without overlapping cycles', async () => {
    let finishCycle: (() => void) | undefined;

    deliveryService.processDueRetries.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCycle = resolve;
        }),
    );
    const service = new RevocationRetryService(
      deliveryService as never,
      {
        getOrThrow: jest.fn().mockReturnValue(true),
      } as never,
    );

    service.onApplicationBootstrap();
    jest.advanceTimersByTime(3_000);
    expect(deliveryService.processDueRetries).toHaveBeenCalledTimes(1);

    finishCycle?.();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1_000);
    expect(deliveryService.processDueRetries).toHaveBeenCalledTimes(2);

    finishCycle?.();
    await service.onModuleDestroy();
  });

  it('does not start when the worker consumer is disabled', () => {
    const service = new RevocationRetryService(
      deliveryService as never,
      {
        getOrThrow: jest.fn().mockReturnValue(false),
      } as never,
    );

    service.onApplicationBootstrap();
    jest.advanceTimersByTime(1_000);

    expect(deliveryService.processDueRetries).not.toHaveBeenCalled();
  });
});
