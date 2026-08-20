import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { validateEnvironment } from './config/environment';
import { PrismaModule } from './database/prisma.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { HealthModule } from './health/health.module';
import { MetricsCoreModule } from './metrics/metrics-core.module';
import { MetricsModule } from './metrics/metrics.module';
import { ShutdownModule } from './shutdown/shutdown.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    MetricsCoreModule,
    EventProcessingModule,
    ShutdownModule,
    HealthModule,
    AuthModule,
    AuthorizationModule,
    AdminModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
