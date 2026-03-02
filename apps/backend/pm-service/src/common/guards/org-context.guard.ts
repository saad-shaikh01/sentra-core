/**
 * OrgContextGuard
 *
 * Validates that the gateway has injected the required tenant context headers
 * before any PM domain controller handles a request.
 *
 * Applied at controller level on all PM domain controllers.
 * Health endpoint is intentionally excluded.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class OrgContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const orgId = req.headers['x-organization-id'] as string;
    const userId = req.headers['x-user-id'] as string;

    if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
      throw new UnauthorizedException('Missing x-organization-id header');
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    return true;
  }
}
