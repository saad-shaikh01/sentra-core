/**
 * Sentra Core Service
 * Main business logic backend for the Sentra ERP/CRM system.
 */

import { Logger, ValidationPipe, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { PrismaService } from '@sentra-core/prisma-client';
import * as bodyParser from 'body-parser';

const CORS_STATIC_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://localhost:3005',
];
const CORS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function resolveConfiguredOrigins(): string[] {
  const rawOrigins = process.env.CORS_ORIGINS ?? '';
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

let cachedOrigins: string[] = [...CORS_STATIC_ORIGINS];
let lastRefreshAt = 0;

async function refreshCorsOrigins(app: INestApplication): Promise<void> {
  try {
    const prisma = app.get(PrismaService);
    const brands = await prisma.brand.findMany({
      where: { domain: { not: null } },
      select: { domain: true },
    });
    const brandOrigins = brands
      .filter((b): b is { domain: string } => b.domain !== null)
      .flatMap((b) => [`https://${b.domain}`, `https://www.${b.domain}`]);
    cachedOrigins = Array.from(
      new Set([...CORS_STATIC_ORIGINS, ...resolveConfiguredOrigins(), ...brandOrigins]),
    );
    lastRefreshAt = Date.now();
  } catch (err) {
    Logger.warn(`CORS origin refresh failed: ${(err as Error).message}`);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/api/webhooks/authorize-net', bodyParser.raw({ type: '*/*' }));

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

  // Perform initial CORS load from Brand table
  await refreshCorsOrigins(app);

  app.enableCors({
    origin: async (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow server-to-server and non-browser requests
      if (!origin) {
        callback(null, true);
        return;
      }

      // Refresh cache if stale
      if (Date.now() - lastRefreshAt > CORS_CACHE_TTL_MS) {
        await refreshCorsOrigins(app);
      }

      if (cachedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT_CORE || 3001;
  await app.listen(port);
  Logger.log(
    `Core Service is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
