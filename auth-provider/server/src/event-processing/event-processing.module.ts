import { Global, Module } from '@nestjs/common';
import { OutboxPublisherService } from './outbox-publisher.service';
import { OutboxEventService } from './outbox-event.service';
import { RabbitMqPublisherService } from './rabbitmq-publisher.service';

@Global()
@Module({
  providers: [
    OutboxEventService,
    RabbitMqPublisherService,
    OutboxPublisherService,
  ],
  exports: [OutboxEventService],
})
export class EventProcessingModule {}
