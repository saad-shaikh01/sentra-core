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
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  const globalPrefix = 'api/comm';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT_COMM || 3002;
  await app.listen(port);
  Logger.log(
    `Comm Service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
