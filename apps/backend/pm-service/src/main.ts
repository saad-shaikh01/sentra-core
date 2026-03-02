/**
 * Sentra PM Service
 * Project management execution engine for the Sentra platform.
 *
 * Base route prefix: /api/pm
 * Port: process.env.PORT_PM (default 3003)
 *
 * Port allocation:
 *   3001 — core-service
 *   3002 — comm-service (reserved)
 *   3003 — pm-service
 *
 * This service owns the PM domain exclusively.
 * Auth, org, and billing remain in core-service.
 * Communication pipelines belong to comm-service.
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation — whitelist only known DTO fields, reject unknown
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
    origin: [
      'http://localhost:4200',
      'http://localhost:4201',
    ],
    credentials: true,
  });

  // All PM endpoints live under /api/pm/...
  const globalPrefix = 'api/pm';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT_PM || 3003;
  await app.listen(port);
  Logger.log(
    `PM Service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
