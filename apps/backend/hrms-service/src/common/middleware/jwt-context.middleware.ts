import { ConfigService } from '@nestjs/config';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

type HrmsJwtPayload = {
  sub?: string;
  orgId?: string;
  role?: string;
  [key: string]: unknown;
};

@Injectable()
export class JwtContextMiddleware implements NestMiddleware {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret =
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  use(
    req: Request & {
      user?: HrmsJwtPayload;
      orgContext?: { userId?: string; organizationId?: string };
    },
    _res: Response,
    next: NextFunction,
  ): void {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ') && this.secret) {
      try {
        const token = auth.slice(7);
        const payload = jwt.verify(token, this.secret) as HrmsJwtPayload;

        req.user = payload;

        if (typeof payload.sub === 'string' && !req.headers['x-user-id']) {
          req.headers['x-user-id'] = payload.sub;
        }
        if (typeof payload.orgId === 'string' && !req.headers['x-organization-id']) {
          req.headers['x-organization-id'] = payload.orgId;
        }
        if (typeof payload.role === 'string' && !req.headers['x-user-role']) {
          req.headers['x-user-role'] = payload.role;
        }

        req.orgContext = {
          userId: (req.headers['x-user-id'] as string | undefined) ?? payload.sub,
          organizationId:
            (req.headers['x-organization-id'] as string | undefined) ?? payload.orgId,
        };
      } catch {
        // Invalid tokens are handled by JwtAuthGuard.
      }
    }

    next();
  }
}
