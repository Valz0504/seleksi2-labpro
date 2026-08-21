import { Module } from '@nestjs/common';
import { DeadLetterPublisherService } from './dead-letter-publisher.service';
import { InternalLogoutClientService } from './internal-logout-client.service';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';
import { RevocationDeliveryService } from './revocation-delivery.service';
import { RevocationRetryService } from './revocation-retry.service';

@Module({
  providers: [
    DeadLetterPublisherService,
    InternalLogoutClientService,
    RevocationDeliveryService,
    RabbitMqConsumerService,
    RevocationRetryService,
  ],
  exports: [RabbitMqConsumerService, RevocationRetryService],
})
export class EventProcessingModule {}
