/**
 * PM Service Root Module
 *
 * Wiring rules:
 * - PrismaClientModule is registered globally and provides PrismaService to all modules.
 *   PM service only reads/writes pm_* prefixed tables via PrismaService.
 * - Config is global so all modules can access env vars without re-importing ConfigModule.
 * - ThrottlerModule protects against write-heavy endpoint abuse.
 * - SentraCacheModule (local) provides Redis-backed or in-memory caching for read paths.
 * - PmEventsModule is global — PmEventsService is available to all domain modules.
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtContextMiddleware } from '../common/middleware/jwt-context.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from '../modules/health/health.module';
import { PmCacheModule } from '../common/cache/pm-cache.module';
import { TemplatesModule } from '../modules/templates/templates.module';
import { EngagementsProjectsModule } from '../modules/engagements-projects/engagements-projects.module';
import { PmEventsModule } from '../modules/events/pm-events.module';
import { PerformanceModule } from '../modules/performance/performance.module';
import { SlaMonitorModule } from '../modules/sla-monitor/sla-monitor.module';
import { StagesTasksModule } from '../modules/stages-tasks/stages-tasks.module';
import { QcApprovalsModule } from '../modules/qc-approvals/qc-approvals.module';
import { ThreadsModule } from '../modules/threads/threads.module';
import { FilesModule } from '../modules/files/files.module';
import { PmRoleGuard } from '../common/guards/pm-role.guard';
import { NotificationsModule } from '../modules/notifications/notifications.module';

function resolveEnvFiles(): string[] {
  const explicitEnvFile = process.env.ENV_FILE?.trim();
  if (explicitEnvFile) {
    return [explicitEnvFile, '.env'];
  }

  const nodeEnv = process.env.NODE_ENV?.trim();
  return nodeEnv ? [`.env.${nodeEnv}`, '.env'] : ['.env'];
}

@Module({
  imports: [
    // Global config — reads .env at root
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolveEnvFiles(),
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

    // Global PM domain events (PM-BE-018)
    PmEventsModule,

    // Global performance scoring system
    PerformanceModule,

    // Background SLA monitoring
    SlaMonitorModule,

    // Domain modules
    HealthModule,
    TemplatesModule,                // PM-BE-004/005/006
    EngagementsProjectsModule,      // PM-BE-007/008/009
    StagesTasksModule,              // PM-BE-010/011/012
    QcApprovalsModule,              // PM-BE-013/014/015
    ThreadsModule,                  // PM-BE-016
    FilesModule,                    // PM-BE-017
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PmRoleGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(JwtContextMiddleware).forRoutes('*');
  }
}
