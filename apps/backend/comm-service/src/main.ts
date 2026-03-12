/**
 * Sentra Comm Service
 * Gmail-integrated communication engine for the Sentra platform.
 *
 * Base route prefix: /api/comm
 * Port: process.env.PORT_COMM (default 3002)
 *
 * Port allocation:
 *   3001 — core-service
 *   3002 — comm-service
 *   3003 — pm-service
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app/app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateCommEnv } from './common/config/env-validation';

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4201',
];

function resolveCorsOrigins(): string[] {
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configuredOrigins]));
}

async function bootstrap() {
  validateCommEnv(process.env);

  const app = await NestFactory.create(AppModule);

  // WebSocket adapter for /comm namespace
  app.useWebSocketAdapter(new IoAdapter(app));

  // COMM-BE-022: Standardized error responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // COMM-BE-021: Structured request logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  const globalPrefix = 'api/comm';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT_COMM || 3002;
  await app.listen(port);
  Logger.log(
    `Comm Service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
