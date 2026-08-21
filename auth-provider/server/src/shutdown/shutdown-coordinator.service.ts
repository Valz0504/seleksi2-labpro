import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'node:http';
import { PrismaService } from '../database/prisma.service';
import { OutboxPublisherService } from '../event-processing/outbox-publisher.service';
import { RabbitMqPublisherService } from '../event-processing/rabbitmq-publisher.service';
import { ShutdownStateService } from './shutdown-state.service';

@Injectable()
export class ShutdownCoordinatorService implements OnModuleDestroy {
  private readonly logger = new Logger(ShutdownCoordinatorService.name);
  private readonly timeoutMs: number;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly state: ShutdownStateService,
    private readonly outboxPublisher: OutboxPublisherService,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
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
    this.state.beginDraining();
    this.stopAcceptingConnections();
    this.outboxPublisher.stopPolling();
    this.logger.log(
      `Graceful shutdown started; waiting up to ${this.timeoutMs}ms for active work`,
    );

    const drained = await this.waitWithinTimeout(
      Promise.all([
        this.state.waitForIdle(),
        this.outboxPublisher.waitForIdle(),
      ]),
    );

    if (!drained) {
      this.logger.warn(
        `Shutdown timeout reached with ${this.state.activeRequests()} active HTTP request(s); unfinished outbox work will recover through its lease`,
      );
    }

    await this.rabbitMqPublisher.close();
    await this.prisma.$disconnect();
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
