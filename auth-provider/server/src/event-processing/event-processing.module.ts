import { Global, Module } from '@nestjs/common';
import { OutboxEventService } from './outbox-event.service';

@Global()
@Module({
  providers: [OutboxEventService],
  exports: [OutboxEventService],
})
export class EventProcessingModule {}
