import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule, EventProcessingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
