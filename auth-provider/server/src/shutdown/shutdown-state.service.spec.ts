import { ShutdownStateService } from './shutdown-state.service';

describe('ShutdownStateService', () => {
  it('waits for active requests and rejects new ones after draining starts', async () => {
    const service = new ShutdownStateService();
    const completeFirst = service.beginRequest();
    const completeSecond = service.beginRequest();
    const idle = service.waitForIdle();
    let resolved = false;

    void idle.then(() => {
      resolved = true;
    });
    service.beginDraining();

    expect(service.isDraining()).toBe(true);
    expect(service.beginRequest()).toBeUndefined();
    expect(service.activeRequests()).toBe(2);

    completeFirst?.();
    completeFirst?.();
    await Promise.resolve();
    expect(resolved).toBe(false);

    completeSecond?.();
    await expect(idle).resolves.toBeUndefined();
    expect(service.activeRequests()).toBe(0);
  });
});
