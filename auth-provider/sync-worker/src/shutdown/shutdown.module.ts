import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';

@Module({
  imports: [PrismaModule, EventProcessingModule],
  providers: [ShutdownCoordinatorService],
})
export class ShutdownModule {}
