import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { AuthMetricsCollectorService } from './auth-metrics-collector.service';
import { MetricsController } from './metrics.controller';
import { MetricsCoreModule } from './metrics-core.module';

@Module({
  imports: [MetricsCoreModule, PrismaModule, EventProcessingModule],
  controllers: [MetricsController],
  providers: [AuthMetricsCollectorService],
  exports: [AuthMetricsCollectorService],
})
export class MetricsModule {}
