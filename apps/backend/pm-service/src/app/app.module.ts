/**
 * PM Service Root Module
 *
 * Wiring rules:
 * - PrismaClientModule is registered globally and provides PrismaService to all modules.
 *   PM service only reads/writes pm_* prefixed tables via PrismaService.
 *   Tables owned by core-service (Organization, User, Brand, Client, etc.) are referenced
 *   by ID only — never written to from this service.
 * - Config is global so all modules can access env vars without re-importing ConfigModule.
 * - ThrottlerModule protects against write-heavy endpoint abuse.
 * - SentraCacheModule (local) provides Redis-backed or in-memory caching for read paths.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from '../modules/health/health.module';
import { PmCacheModule } from '../common/cache/pm-cache.module';
import { TemplatesModule } from '../modules/templates/templates.module';

@Module({
  imports: [
    // Global config — reads .env at root
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — guards write-heavy PM endpoints
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    // Shared Postgres client — PrismaService is global; pm-service uses pm_* tables only
    PrismaClientModule,

    // Local Redis/in-memory cache — pm-specific key namespacing enforced in services
    PmCacheModule,

    // Domain modules
    HealthModule,
    TemplatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
