/**
 * IdempotencyInterceptor
 *
 * Applies to POST /messages/send.
 * Caches the response for 24h using the Idempotency-Key header.
 * Returns 409 if the same key was used with a different payload.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { CommCacheService } from '../cache/comm-cache.service';
import * as crypto from 'crypto';

const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24h in ms

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly cache: CommCacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const orgId = req.headers['x-organization-id'] as string;
    const cacheKey = `comm:idempotency:${orgId}:${idempotencyKey}`;

    // Hash the request body to detect payload mismatch
    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    const cached = await this.cache.get<{ bodyHash: string; response: unknown }>(cacheKey);
    if (cached) {
      if (cached.bodyHash !== bodyHash) {
        throw new ConflictException(
          'Idempotency key reused with different request payload',
        );
      }
      this.logger.debug(`Idempotency cache hit for key: ${idempotencyKey}`);
      return new Observable((subscriber) => {
        subscriber.next(cached.response);
        subscriber.complete();
      });
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.cache.set(cacheKey, { bodyHash, response }, IDEMPOTENCY_TTL);
        } catch (err) {
          this.logger.warn(`Failed to cache idempotency response: ${err}`);
        }
      }),
    );
  }
}
