import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EventProcessingModule } from '../event-processing/event-processing.module';
import { ShutdownCoordinatorService } from './shutdown-coordinator.service';
import { ShutdownStateService } from './shutdown-state.service';

@Global()
@Module({
  imports: [PrismaModule, EventProcessingModule],
  providers: [ShutdownStateService, ShutdownCoordinatorService],
  exports: [ShutdownStateService],
})
export class ShutdownModule {}
