import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService {
  private defaultTtl: number;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private config: ConfigService,
  ) {
    this.defaultTtl = this.config.get<number>('CACHE_TTL', 300) * 1000; // convert to ms
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl ?? this.defaultTtl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const store = (this.cacheManager as any).store;
    if (store?.client) {
      // Redis store — use SCAN + DEL
      const client = store.client;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, {
          MATCH: `${prefix}*`,
          COUNT: 100,
        });
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(keys);
        }
      } while (cursor !== '0');
    } else {
      // In-memory fallback — iterate keys
      const keys = await (this.cacheManager as any).store.keys(`${prefix}*`);
      if (keys?.length) {
        await Promise.all(keys.map((k: string) => this.cacheManager.del(k)));
      }
    }
  }

  buildKey(...parts: string[]): string {
    return parts.join(':');
  }

  hashQuery(query: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(query)).toString('base64url');
  }
}
