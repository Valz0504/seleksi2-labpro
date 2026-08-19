import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: true,
  });
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
  await app.listen(process.env.PORT ?? 3004);
}
void bootstrap();
