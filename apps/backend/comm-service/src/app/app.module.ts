/**
 * Comm Service Root Module
 *
 * Wiring rules:
 * - ConfigModule is global — all modules can access env vars.
 * - MongooseModule connects to MONGO_URI (comm archive store).
 * - BullModule connects to Redis for sync job queues.
 * - TokenEncryptionModule is global — available to all modules.
 * - CommCacheModule is global — Redis/in-memory cache for reads.
 * - OrgContextGuard: applied per-controller (not globally) since
 *   health and OAuth callback endpoints bypass it.
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CommCacheModule } from '../common/cache/comm-cache.module';
import { TokenEncryptionModule } from '../common/crypto/token-encryption.module';
import { MetricsModule } from '../common/metrics/metrics.module';
import { JwtContextMiddleware } from '../common/middleware/jwt-context.middleware';
import { RequestIdMiddleware } from '../common/middleware/request-id.middleware';
import { HealthModule } from '../modules/health/health.module';
import { MetricsRouteModule } from '../modules/metrics/metrics.module';
import { IdentitiesModule } from '../modules/identities/identities.module';
import { SyncModule } from '../modules/sync/sync.module';
import { ThreadsModule } from '../modules/threads/threads.module';
import { EntityLinksModule } from '../modules/entity-links/entity-links.module';
import { AuditModule } from '../modules/audit/audit.module';
import { AttachmentsModule } from '../modules/attachments/attachments.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { GatewayModule } from '../modules/gateway/gateway.module';
import { GSuiteModule } from '../modules/gsuite/gsuite.module';
import { TrackingModule } from '../modules/tracking/tracking.module';
import { IntelligenceModule } from '../modules/intelligence/intelligence.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { AlertsModule } from '../modules/alerts/alerts.module';
import { MaintenanceModule } from '../modules/maintenance/maintenance.module';
import { ContactsModule } from '../modules/contacts/contacts.module';

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

    // Rate limiting
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

    // MongoDB — comm archive store
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', 'mongodb://localhost:27017/sentra_comm'),
      }),
    }),

    // BullMQ — sync job queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
          },
        };
      },
    }),

    // Global modules
    CommCacheModule,
    TokenEncryptionModule,
    MetricsModule,
    GatewayModule,

    // Domain modules
    HealthModule,
    MetricsRouteModule,
    AuditModule,      // global — must come before modules that inject AuditService
    IdentitiesModule,
    SyncModule,
    ThreadsModule,
    EntityLinksModule,
    AttachmentsModule,
    MessagesModule,
    TrackingModule,
    IntelligenceModule,
    SettingsModule,
    AlertsModule,
    MaintenanceModule,
    GSuiteModule,
    ContactsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer.apply(JwtContextMiddleware).forRoutes('*');
  }
}
