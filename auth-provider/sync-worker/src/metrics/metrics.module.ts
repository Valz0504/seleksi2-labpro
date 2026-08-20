import { Module } from '@nestjs/common';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { MetricsController } from './metrics.controller';
import { WorkerMetricsCollectorService } from './worker-metrics-collector.service';

@Module({
  imports: [EventProcessingModule],
  controllers: [MetricsController],
  providers: [WorkerMetricsCollectorService],
})
export class MetricsModule {}
