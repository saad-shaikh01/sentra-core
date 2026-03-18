import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

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
    origin: resolveCorsOrigins(),
    credentials: true,
  });

  const globalPrefix = 'api/hrms';
  app.setGlobalPrefix(globalPrefix);

  const port = process.env.PORT_HRMS || 3004;
  await app.listen(port);
  Logger.log(
    `HRMS Service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
