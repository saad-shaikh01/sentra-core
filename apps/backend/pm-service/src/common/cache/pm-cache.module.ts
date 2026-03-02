/**
 * PM Cache Module
 *
 * Provides Redis-backed (or in-memory fallback) caching for pm-service.
 * Cache keys must always be tenant-scoped: pm:<orgId>:<resource>:<queryHash>
 *
 * Rules:
 * - NEVER cache mutating operations (create, update, delete, assign, submit, review)
 * - Cache is safe for: template lists, project summaries, stage lists, task lists
 * - All cache invalidation on write must flush the relevant org-scoped key prefix
 * - TTL defaults to CACHE_TTL env var (seconds), converted to ms internally
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { PmCacheService } from './pm-cache.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');

        if (redisUrl) {
          return {
            store: await redisStore({ url: redisUrl }),
            ttl: config.get<number>('CACHE_TTL', 300) * 1000,
          };
        }

        // In-memory fallback for local dev without Redis
        return {
          ttl: config.get<number>('CACHE_TTL', 300) * 1000,
        };
      },
    }),
  ],
  providers: [PmCacheService],
  exports: [PmCacheService],
})
export class PmCacheModule {}
