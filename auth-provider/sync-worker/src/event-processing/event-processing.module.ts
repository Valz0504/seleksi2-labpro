import { Module } from '@nestjs/common';
import { InternalLogoutClientService } from './internal-logout-client.service';
import { RabbitMqConsumerService } from './rabbitmq-consumer.service';
import { RevocationDeliveryService } from './revocation-delivery.service';

@Module({
  providers: [
    InternalLogoutClientService,
    RevocationDeliveryService,
    RabbitMqConsumerService,
  ],
})
export class EventProcessingModule {}
