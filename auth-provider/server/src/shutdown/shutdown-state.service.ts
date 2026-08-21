import { Injectable } from '@nestjs/common';

@Injectable()
export class ShutdownStateService {
  private draining = false;
  private activeRequestCount = 0;
  private readonly idleWaiters = new Set<() => void>();

  beginDraining(): void {
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  beginRequest(): (() => void) | undefined {
    if (this.draining) {
      return undefined;
    }

    this.activeRequestCount += 1;
    let completed = false;

    return () => {
      if (completed) {
        return;
      }

      completed = true;
      this.activeRequestCount -= 1;

      if (this.activeRequestCount === 0) {
        for (const resolve of this.idleWaiters) {
          resolve();
        }
        this.idleWaiters.clear();
      }
    };
  }

  waitForIdle(): Promise<void> {
    if (this.activeRequestCount === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  activeRequests(): number {
    return this.activeRequestCount;
  }
}
