import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

/**
 * PM-scoped cache service.
 * All keys are prefixed with `pm:` to isolate from core-service cache namespace.
 * Tenant scoping is enforced by including organizationId in every key.
 */
@Injectable()
export class PmCacheService {
  private readonly defaultTtl: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly config: ConfigService,
  ) {
    this.defaultTtl = this.config.get<number>('CACHE_TTL', 300) * 1000;
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
      const keys = await (this.cacheManager as any).store.keys(`${prefix}*`);
      if (keys?.length) {
        await Promise.all(keys.map((k: string) => this.cacheManager.del(k)));
      }
    }
  }

  /**
   * Build a tenant-scoped PM cache key.
   * Pattern: pm:<organizationId>:<resource>:<...parts>
   */
  buildKey(organizationId: string, resource: string, ...parts: string[]): string {
    return ['pm', organizationId, resource, ...parts].join(':');
  }

  /**
   * Build a query hash for use in list cache keys.
   * Deterministic — same query object always produces the same hash.
   */
  hashQuery(query: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(query)).toString('base64url');
  }

  /**
   * Flush all PM cache entries for a given org and resource.
   * Call this on any write that invalidates a list.
   */
  async invalidateOrgResource(organizationId: string, resource: string): Promise<void> {
    await this.delByPrefix(`pm:${organizationId}:${resource}`);
  }
}
