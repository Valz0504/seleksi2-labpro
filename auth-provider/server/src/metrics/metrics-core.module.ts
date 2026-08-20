import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthMetricsService } from './auth-metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Global()
@Module({
  providers: [
    AuthMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [AuthMetricsService],
})
export class MetricsCoreModule {}
