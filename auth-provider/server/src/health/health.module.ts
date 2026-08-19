import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { ShutdownModule } from '../shutdown/shutdown.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule, EventProcessingModule, ShutdownModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
