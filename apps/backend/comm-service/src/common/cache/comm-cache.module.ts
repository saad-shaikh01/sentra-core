/**
 * Comm Cache Module
 *
 * Provides Redis-backed (or in-memory fallback) caching for comm-service.
 * Cache keys must always be tenant-scoped: comm:<orgId>:<resource>:<queryHash>
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { CommCacheService } from './comm-cache.service';

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
  providers: [CommCacheService],
  exports: [CommCacheService],
})
export class CommCacheModule {}
