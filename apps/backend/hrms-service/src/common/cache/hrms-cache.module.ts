import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { HrmsCacheService } from './hrms-cache.service';

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

        return {
          ttl: config.get<number>('CACHE_TTL', 300) * 1000,
        };
      },
    }),
  ],
  providers: [HrmsCacheService],
  exports: [HrmsCacheService],
})
export class HrmsCacheModule {}
