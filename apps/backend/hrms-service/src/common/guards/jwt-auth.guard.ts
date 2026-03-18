import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

type HrmsJwtPayload = {
  sub?: string;
  orgId?: string;
  role?: string;
  [key: string]: unknown;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    this.secret =
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      '';
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: HrmsJwtPayload }>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (!this.secret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, this.secret) as HrmsJwtPayload;

      if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
        throw new UnauthorizedException('Token is missing subject claim');
      }

      request.user = payload;
      if (!request.headers['x-user-id']) {
        request.headers['x-user-id'] = payload.sub;
      }
      if (typeof payload.orgId === 'string' && !request.headers['x-organization-id']) {
        request.headers['x-organization-id'] = payload.orgId;
      }
      if (typeof payload.role === 'string' && !request.headers['x-user-role']) {
        request.headers['x-user-role'] = payload.role;
      }

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
