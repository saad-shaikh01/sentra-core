/**
 * LoggingInterceptor — BE-P0-001
 *
 * Adds structured request/response logging with OrgContext to every PM request.
 * Fields included per log line: organizationId, userId, requestId, method, url, statusCode, durationMs.
 * Sensitive data (Authorization, passwords) is never logged.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    const organizationId = (req.headers['x-organization-id'] as string) ?? 'unknown';
    const userId = (req.headers['x-user-id'] as string) ?? 'anonymous';
    const { method, originalUrl } = req;
    const startMs = Date.now();

    // Attach requestId to response header for traceability
    res.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          requestId,
          organizationId,
          userId,
          method,
          url: originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startMs,
        });
      }),
      catchError((error: unknown) => {
        const statusCode =
          (error as { status?: number })?.status ?? 500;
        this.logger.error({
          requestId,
          organizationId,
          userId,
          method,
          url: originalUrl,
          statusCode,
          durationMs: Date.now() - startMs,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
        return throwError(() => error);
      }),
    );
  }
}
