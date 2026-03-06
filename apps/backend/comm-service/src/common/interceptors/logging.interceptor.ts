/**
 * LoggingInterceptor — COMM-BE-021
 *
 * Logs every HTTP request as structured JSON:
 * {
 *   service: 'comm',
 *   requestId: string,
 *   organizationId: string | undefined,
 *   method: string,
 *   url: string,
 *   statusCode: number,
 *   durationMs: number
 * }
 *
 * Sensitive fields (tokens, request/response bodies) are never logged.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('CommHTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (!req || !res) return next.handle();

    const start = Date.now();
    const { method, url, requestId } = req;
    const organizationId: string | undefined = (req as any).orgContext?.organizationId;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            JSON.stringify({
              service: 'comm',
              requestId,
              organizationId,
              method,
              url,
              statusCode: res.statusCode,
              durationMs: Date.now() - start,
            }),
          );
        },
        error: (err: any) => {
          this.logger.error(
            JSON.stringify({
              service: 'comm',
              requestId,
              organizationId,
              method,
              url,
              statusCode: err.status ?? 500,
              durationMs: Date.now() - start,
              errorCode: err.name ?? 'UnknownError',
            }),
          );
        },
      }),
    );
  }
}
