import { Controller, Get, Header, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthMetricsCollectorService } from './auth-metrics-collector.service';
import { AuthMetricsService } from './auth-metrics.service';

@Controller('metrics')
@ApiTags('System')
export class MetricsController {
  constructor(
    private readonly collector: AuthMetricsCollectorService,
    private readonly metrics: AuthMetricsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Expose Auth Provider Prometheus metrics' })
  @ApiProduces('text/plain')
  @ApiOkResponse({ description: 'Prometheus text exposition format.' })
  async scrape(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.metrics.prometheusContentType());
    return this.collector.renderPrometheus();
  }
}
