import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WORKER_RUNTIME } from './event-processing.constants';
import { safeErrorMessage } from './event-processing.errors';
import { RevocationDeliveryService } from './revocation-delivery.service';

@Injectable()
export class RevocationRetryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RevocationRetryService.name);
  private readonly enabled: boolean;
  private timer?: NodeJS.Timeout;
  private activeCycle?: Promise<void>;

  constructor(
    private readonly deliveryService: RevocationDeliveryService,
    configService: ConfigService,
  ) {
    this.enabled = configService.getOrThrow<boolean>(
      'SYNC_WORKER_CONSUMER_ENABLED',
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(
      () => this.triggerCycle(),
      WORKER_RUNTIME.retryPollIntervalMs,
    );
    this.timer.unref();
    this.triggerCycle();
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async waitForIdle(): Promise<void> {
    await this.activeCycle?.catch(() => undefined);
  }

  private triggerCycle(): void {
    if (this.activeCycle) {
      return;
    }

    const cycle = this.deliveryService.processDueRetries();

    this.activeCycle = cycle;
    void cycle
      .catch((error: unknown) => {
        this.logger.error(`Retry cycle failed: ${safeErrorMessage(error)}`);
      })
      .finally(() => {
        if (this.activeCycle === cycle) {
          this.activeCycle = undefined;
        }
      });
  }
}
