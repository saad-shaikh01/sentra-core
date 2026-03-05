/**
 * InternalServiceGuard
 *
 * Validates service-to-service requests using the X-Service-Secret header.
 * Used to protect internal endpoints that must not be accessible from the public internet.
 * Pair with @Public() to skip JWT auth on these routes.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = req.headers['x-service-secret'] as string;
    const expected = this.config.get<string>('INTERNAL_SERVICE_SECRET', '');

    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Invalid or missing X-Service-Secret');
    }

    return true;
  }
}
