import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

interface CacheStoreWithKeys {
  keys: (pattern?: string) => Promise<string[]>;
}

interface CacheStoreWithClient {
  client: {
    scan: (
      cursor: string,
      options: { MATCH: string; COUNT: number },
    ) => Promise<[string, string[]]>;
    del: (keys: string[]) => Promise<unknown>;
  };
}

interface KeyvAdapterLike {
  _cache?: unknown;
}

interface KeyvLikeStore {
  store?: unknown;
}

type CacheManagerWithStores = Cache & {
  stores?: KeyvLikeStore[];
};

@Injectable()
export class CacheService {
  private defaultTtl: number;
  private knownKeys = new Set<string>();

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private config: ConfigService,
  ) {
    this.defaultTtl = this.config.get<number>('CACHE_TTL', 300) * 1000;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.cacheManager.get<T>(key);
    if (value === undefined) {
      this.knownKeys.delete(key);
    }
    return value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl ?? this.defaultTtl);
    this.knownKeys.add(key);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
    this.knownKeys.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const trackedKeys = Array.from(this.knownKeys).filter((key) =>
      key.startsWith(prefix)
    );

    if (trackedKeys.length > 0) {
      await Promise.all(trackedKeys.map((key) => this.cacheManager.del(key)));
      trackedKeys.forEach((key) => this.knownKeys.delete(key));
      return;
    }

    const pattern = `${prefix}*`;
    const stores = this.getPrefixStores();

    for (const store of stores) {
      if (this.isCacheStoreWithClient(store)) {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await store.client.scan(cursor, {
            MATCH: pattern,
            COUNT: 100,
          });
          cursor = nextCursor;
          if (keys.length > 0) {
            await store.client.del(keys);
          }
        } while (cursor !== '0');
        return;
      }

      if (this.isCacheStoreWithKeys(store)) {
        const keys = await store.keys(pattern);
        if (keys.length > 0) {
          await Promise.all(keys.map((key) => this.cacheManager.del(key)));
        }
        return;
      }

      if (store instanceof Map) {
        for (const key of store.keys()) {
          if (typeof key === 'string' && key.startsWith(prefix)) {
            store.delete(key);
          }
        }
        return;
      }
    }
  }

  buildKey(...parts: string[]): string {
    return parts.join(':');
  }

  hashQuery(query: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(query)).toString('base64url');
  }

  private getPrefixStores(): unknown[] {
    const stores: unknown[] = [];
    const cacheManagerWithStores = this.cacheManager as CacheManagerWithStores;
    const legacyStore = this.getLegacyStore();

    if (legacyStore !== undefined) {
      stores.push(legacyStore);
    }

    for (const keyvStore of cacheManagerWithStores.stores ?? []) {
      if (keyvStore.store !== undefined) {
        stores.push(keyvStore.store);
        if (
          this.isKeyvAdapterLike(keyvStore.store) &&
          keyvStore.store._cache !== undefined
        ) {
          stores.push(keyvStore.store._cache);
        }
      }
    }

    return stores;
  }

  private getLegacyStore(): unknown {
    const cacheManagerRecord = this.cacheManager as Record<string, unknown>;
    return cacheManagerRecord.store;
  }

  private isCacheStoreWithKeys(value: unknown): value is CacheStoreWithKeys {
    return (
      typeof value === 'object' &&
      value !== null &&
      'keys' in value &&
      typeof value.keys === 'function'
    );
  }

  private isCacheStoreWithClient(value: unknown): value is CacheStoreWithClient {
    return (
      typeof value === 'object' &&
      value !== null &&
      'client' in value &&
      typeof value.client === 'object' &&
      value.client !== null &&
      'scan' in value.client &&
      typeof value.client.scan === 'function' &&
      'del' in value.client &&
      typeof value.client.del === 'function'
    );
  }

  private isKeyvAdapterLike(value: unknown): value is KeyvAdapterLike {
    return typeof value === 'object' && value !== null && '_cache' in value;
  }
}
