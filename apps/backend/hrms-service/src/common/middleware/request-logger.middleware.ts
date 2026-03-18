import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { HrmsOrgContextValue } from '../decorators';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request & { orgContext?: HrmsOrgContextValue }, res: Response, next: NextFunction): void {
    const start = Date.now();
    const method = req.method;
    const path = req.originalUrl || req.url;
    const orgId =
      req.orgContext?.organizationId ??
      String(req.headers['x-organization-id'] ?? 'unknown');

    res.on('finish', () => {
      this.logger.log({
        method,
        path,
        durationMs: Date.now() - start,
        orgId,
        statusCode: res.statusCode,
      });
    });

    next();
  }
}
