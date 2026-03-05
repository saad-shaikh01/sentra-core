import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

/**
 * Comm-scoped cache service.
 * All keys are prefixed with `comm:` to isolate from other service namespaces.
 * Tenant scoping is enforced by including organizationId in every key.
 */
@Injectable()
export class CommCacheService {
  private readonly defaultTtl: number;
  private readonly logger = new Logger(CommCacheService.name);

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
    try {
      const cacheStores = (this.cacheManager as any)?.stores;
      if (Array.isArray(cacheStores) && cacheStores.length > 0) {
        for (const keyvStore of cacheStores) {
          if (typeof keyvStore?.iterator === 'function') {
            const keysToDelete: string[] = [];
            for await (const entry of keyvStore.iterator()) {
              const key = Array.isArray(entry) ? entry[0] : undefined;
              if (typeof key === 'string' && key.startsWith(prefix)) {
                keysToDelete.push(key);
              }
            }
            if (keysToDelete.length > 0) {
              await this.deleteMany(keysToDelete);
            }
            continue;
          }

          const underlyingStore = keyvStore?.store ?? keyvStore?.opts?.store;
          if (underlyingStore?.client && typeof underlyingStore.client.scan === 'function') {
            await this.delByRedisScan(underlyingStore.client, prefix);
            continue;
          }
          if (typeof underlyingStore?.keys === 'function') {
            const keys = await underlyingStore.keys(`${prefix}*`);
            if (Array.isArray(keys) && keys.length > 0) {
              await this.deleteMany(keys);
            }
          }
        }
        return;
      }

      const legacyStore = (this.cacheManager as any)?.store;
      if (legacyStore?.client && typeof legacyStore.client.scan === 'function') {
        await this.delByRedisScan(legacyStore.client, prefix);
        return;
      }
      if (typeof legacyStore?.keys === 'function') {
        const keys = await legacyStore.keys(`${prefix}*`);
        if (Array.isArray(keys) && keys.length > 0) {
          await this.deleteMany(keys);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Cache prefix invalidation failed for "${prefix}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async delByRedisScan(client: any, prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const scanResult = await client.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 100,
      });
      const nextCursor = Array.isArray(scanResult)
        ? scanResult[0]
        : String(scanResult?.cursor ?? '0');
      const keys = Array.isArray(scanResult)
        ? scanResult[1]
        : (scanResult?.keys ?? []);
      cursor = String(nextCursor);
      if (Array.isArray(keys) && keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  }

  private async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const mdel = (this.cacheManager as any)?.mdel;
    if (typeof mdel === 'function') {
      await mdel.call(this.cacheManager, keys);
      return;
    }
    await Promise.all(keys.map((key) => this.cacheManager.del(key)));
  }

  buildKey(organizationId: string, resource: string, ...parts: string[]): string {
    return ['comm', organizationId, resource, ...parts].join(':');
  }

  hashQuery(query: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(query)).toString('base64url');
  }

  async invalidateOrgResource(organizationId: string, resource: string): Promise<void> {
    await this.delByPrefix(`comm:${organizationId}:${resource}`);
  }
}
