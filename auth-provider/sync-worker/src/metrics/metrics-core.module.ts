import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { WorkerMetricsService } from './worker-metrics.service';

@Global()
@Module({
  providers: [
    WorkerMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [WorkerMetricsService],
})
export class MetricsCoreModule {}
