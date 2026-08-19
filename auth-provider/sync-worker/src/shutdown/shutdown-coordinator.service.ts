import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'node:http';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqConsumerService } from '../event-processing/rabbitmq-consumer.service';
import { RevocationRetryService } from '../event-processing/revocation-retry.service';

@Injectable()
export class ShutdownCoordinatorService implements OnModuleDestroy {
  private readonly logger = new Logger(ShutdownCoordinatorService.name);
  private readonly timeoutMs: number;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly consumer: RabbitMqConsumerService,
    private readonly retryService: RevocationRetryService,
    private readonly prisma: PrismaService,
    private readonly httpAdapterHost: HttpAdapterHost,
    configService: ConfigService,
  ) {
    this.timeoutMs = configService.getOrThrow<number>('SHUTDOWN_TIMEOUT_MS');
  }

  onModuleDestroy(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.shutdown();
    }

    return this.shutdownPromise;
  }

  private async shutdown(): Promise<void> {
    this.stopAcceptingConnections();
    this.retryService.stopPolling();
    this.logger.log(
      `Graceful shutdown started; waiting up to ${this.timeoutMs}ms for active deliveries`,
    );

    try {
      const [consumerResult, retryDrained] = await Promise.all([
        this.consumer.shutdown(this.timeoutMs),
        this.waitWithinTimeout(this.retryService.waitForIdle()),
      ]);

      if (!consumerResult.drained) {
        this.logger.warn(
          `Shutdown timeout reached; ${consumerResult.requeued} in-flight RabbitMQ message(s) were requeued`,
        );
      }
      if (!retryDrained) {
        this.logger.warn(
          'Shutdown timeout reached while a scheduled retry cycle was active; durable delivery state will be retried after restart',
        );
      }
    } finally {
      await this.prisma.close();
    }

    this.logger.log('Graceful shutdown completed');
  }

  private stopAcceptingConnections(): void {
    const server = this.httpAdapterHost.httpAdapter?.getHttpServer() as
      Server | undefined;

    if (!server?.listening) {
      return;
    }

    try {
      server.close();
    } catch {
      this.logger.warn('HTTP listener could not be closed cleanly');
    }
  }

  private async waitWithinTimeout(work: Promise<unknown>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      work.then(() => false),
      new Promise<true>((resolve) => {
        timer = setTimeout(() => resolve(true), this.timeoutMs);
        timer.unref();
      }),
    ]);

    if (timer) {
      clearTimeout(timer);
    }

    return !timedOut;
  }
}
