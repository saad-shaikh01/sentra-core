/**
 * JwtContextMiddleware
 *
 * Bridges direct frontend → PM service calls during development.
 *
 * In production the api-gateway validates the JWT and injects:
 *   x-organization-id
 *   x-user-id
 *
 * This middleware does the same thing inline so the PM service works
 * without a gateway. It reads the Authorization Bearer token, verifies
 * it with JWT_ACCESS_SECRET, and sets the two headers on the request
 * before OrgContextGuard runs.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtContextMiddleware implements NestMiddleware {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('JWT_ACCESS_SECRET', '');
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7);
        const payload = jwt.verify(token, this.secret) as Record<string, unknown>;
        if (typeof payload['sub'] === 'string') {
          req.headers['x-user-id'] = payload['sub'];
        }
        if (typeof payload['orgId'] === 'string') {
          req.headers['x-organization-id'] = payload['orgId'];
        }
      } catch {
        // Invalid token — OrgContextGuard will throw 401
      }
    }
    next();
  }
}
