/**
 * AllExceptionsFilter — COMM-BE-022
 *
 * Global exception filter that standardizes all error responses to:
 * {
 *   "error": {
 *     "code":      string,   // e.g. "NOT_FOUND", "BAD_REQUEST", "INTERNAL_SERVER_ERROR"
 *     "message":   string,
 *     "requestId": string | undefined
 *   }
 * }
 *
 * HTTP status codes are preserved. Unhandled errors map to 500.
 * Stack traces are never exposed in responses.
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('CommExceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const requestId: string | undefined = req?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Too many requests — please slow down';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HTTP_STATUS_TO_CODE[status] ?? 'HTTP_ERROR';

      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const r = exResponse as Record<string, unknown>;
        // ValidationPipe returns { message: string[] }
        if (Array.isArray(r['message'])) {
          message = (r['message'] as string[]).join('; ');
        } else if (typeof r['message'] === 'string') {
          message = r['message'];
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    res.status(status).json({
      error: {
        code,
        message,
        requestId,
      },
    });
  }
}
