import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { configureSwagger } from './config/swagger';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const cookieSecret = configService.getOrThrow<string>('SSO_COOKIE_SECRET');

  app.use(cookieParser(cookieSecret));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  configureSwagger(app);
}
