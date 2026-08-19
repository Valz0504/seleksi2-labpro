import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { configureSwagger } from './config/swagger';
import { ShutdownStateService } from './shutdown/shutdown-state.service';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const shutdownState = app.get(ShutdownStateService);
  const cookieSecret = configService.getOrThrow<string>('SSO_COOKIE_SECRET');

  app.use((request: Request, response: Response, next: NextFunction) => {
    const isHealthRequest =
      request.path === '/health' || request.path.startsWith('/health/');

    if (isHealthRequest) {
      next();
      return;
    }

    const completeRequest = shutdownState.beginRequest();

    if (!completeRequest) {
      response.status(503).json({
        error: {
          code: 'SERVICE_SHUTTING_DOWN',
          message: 'Layanan sedang berhenti',
        },
      });
      return;
    }

    response.once('finish', completeRequest);
    response.once('close', completeRequest);
    next();
  });
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
