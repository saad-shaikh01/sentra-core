import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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

    const req = context.switchToHttp().getRequest<Request & {
      user?: { sub?: string; orgId?: string };
      orgContext?: { userId: string; organizationId: string };
    }>();

    const organizationId =
      (req.headers['x-organization-id'] as string | undefined) ?? req.user?.orgId;
    const userId =
      (req.headers['x-user-id'] as string | undefined) ?? req.user?.sub;

    if (!organizationId || !organizationId.trim()) {
      throw new UnauthorizedException('Missing x-organization-id header');
    }
    if (!userId || !userId.trim()) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    req.orgContext = { organizationId, userId };
    return true;
  }
}
