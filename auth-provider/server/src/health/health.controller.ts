import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { LivenessReport, ReadinessReport } from './health.service';

const LIVENESS_SCHEMA = {
  example: {
    status: 'ok',
    service: 'auth-server',
    timestamp: '2026-08-19T08:00:00.000Z',
  },
};

const READINESS_SCHEMA = {
  example: {
    status: 'ready',
    service: 'auth-server',
    dependencies: {
      primaryDatabase: 'ok',
      rabbitmq: 'ok',
    },
    timestamp: '2026-08-19T08:00:00.000Z',
  },
};

@Controller('health')
@ApiTags('System')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check Auth Provider process health' })
  @ApiOkResponse({
    description: 'Compatibility health endpoint with liveness semantics.',
    schema: LIVENESS_SCHEMA,
  })
  health(): LivenessReport {
    return this.healthService.liveness();
  }

  @Get('live')
  @ApiOperation({ summary: 'Check Auth Provider liveness' })
  @ApiOkResponse({
    description: 'The process and HTTP event loop are responding.',
    schema: LIVENESS_SCHEMA,
  })
  liveness(): LivenessReport {
    return this.healthService.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check Auth Provider readiness' })
  @ApiOkResponse({
    description: 'All required Auth Provider dependencies are available.',
    schema: READINESS_SCHEMA,
  })
  @ApiServiceUnavailableResponse({
    description: 'At least one required dependency is unavailable.',
    schema: {
      example: {
        ...READINESS_SCHEMA.example,
        status: 'not_ready',
        dependencies: {
          primaryDatabase: 'ok',
          rabbitmq: 'unavailable',
        },
      },
    },
  })
  async readiness(): Promise<ReadinessReport> {
    const report = await this.healthService.readiness();

    if (report.status === 'not_ready') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
