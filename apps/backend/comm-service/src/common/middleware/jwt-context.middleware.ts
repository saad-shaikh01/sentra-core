/**
 * JwtContextMiddleware
 *
 * Bridges direct frontend → comm service calls during development.
 * In production the api-gateway validates the JWT and injects headers.
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
        if (typeof payload['role'] === 'string') {
          req.headers['x-user-role'] = payload['role'];
        }
      } catch {
        // Invalid token — OrgContextGuard will throw 401
      }
    }
    next();
  }
}
