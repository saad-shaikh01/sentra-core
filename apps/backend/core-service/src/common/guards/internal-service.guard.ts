import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const secret = req.headers['x-internal-secret'];
    const expected = this.config.get<string>('INTERNAL_SERVICE_SECRET');

    if (!expected || !secret || secret !== expected) {
      throw new UnauthorizedException('Invalid internal service secret');
    }
    return true;
  }
}
