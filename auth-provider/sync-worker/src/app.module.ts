import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './database/prisma.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { MetricsCoreModule } from './metrics/metrics-core.module';
import { MetricsModule } from './metrics/metrics.module';
import { ShutdownModule } from './shutdown/shutdown.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['.env', '../server/.env', '../../.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    MetricsCoreModule,
    PrismaModule,
    EventProcessingModule,
    MetricsModule,
    ShutdownModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
