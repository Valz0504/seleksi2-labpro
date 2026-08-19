import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RabbitMqPublisherService } from '../event-processing/rabbitmq-publisher.service';
import { ShutdownStateService } from '../shutdown/shutdown-state.service';

const DEPENDENCY_TIMEOUT_MS = 2_000;

type DependencyStatus = 'ok' | 'unavailable';

export interface LivenessReport {
  status: 'ok';
  service: 'auth-server';
  timestamp: string;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  service: 'auth-server';
  lifecycle: 'running' | 'draining';
  dependencies: {
    primaryDatabase: DependencyStatus;
    rabbitmq: DependencyStatus;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMqPublisher: RabbitMqPublisherService,
    private readonly shutdownState: ShutdownStateService,
  ) {}

  liveness(): LivenessReport {
    return {
      status: 'ok',
      service: 'auth-server',
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessReport> {
    const [primaryDatabase, rabbitmq] = await Promise.all([
      this.checkDependency(() => this.prisma.$queryRaw`SELECT 1`),
      this.checkDependency(() => this.rabbitMqPublisher.checkReadiness()),
    ]);
    const lifecycle = this.shutdownState.isDraining() ? 'draining' : 'running';

    return {
      status:
        lifecycle === 'running' && primaryDatabase === 'ok' && rabbitmq === 'ok'
          ? 'ready'
          : 'not_ready',
      service: 'auth-server',
      lifecycle,
      dependencies: {
        primaryDatabase,
        rabbitmq,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDependency(
    operation: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Dependency health check timed out')),
            DEPENDENCY_TIMEOUT_MS,
          );
          timeout.unref();
        }),
      ]);

      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
