import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { WorkerMetricsCollectorService } from './worker-metrics-collector.service';
import { WorkerMetricsService } from './worker-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly collector: WorkerMetricsCollectorService,
    private readonly metrics: WorkerMetricsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.metrics.prometheusContentType());
    return this.collector.renderPrometheus();
  }
}
