/**
 * RequestIdMiddleware — COMM-BE-021
 *
 * Attaches a unique requestId to every incoming request.
 * - Reads X-Request-ID header if present (for tracing from upstream proxies).
 * - Otherwise generates a crypto-random hex ID.
 * - Sets the header on the response and stores it on request.requestId.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

type RequestContext = {
  requestId: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getCurrentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming) ??
      randomBytes(8).toString('hex');

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
