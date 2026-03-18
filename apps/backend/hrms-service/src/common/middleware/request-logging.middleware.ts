import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const orgId = req.headers['x-organization-id'] ?? 'n/a';

      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms orgId=${orgId}`,
      );
    });

    next();
  }
}
