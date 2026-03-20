import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload, UserRole } from '@sentra-core/types';
import { PERMISSIONS_KEY } from '../decorators';
import { PermissionsService } from '../services';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    const orgId = user?.orgId ?? user?.organizationId;

    if (!user?.sub || !orgId) {
      throw new UnauthorizedException();
    }

    if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) {
      return true;
    }

    const effectivePermissions = await this.permissionsService.getUserPermissions(user.sub, orgId);
    // OR semantics: user needs at least one of the listed permissions
    const hasAnyPermission = requiredPermissions.some((permission) =>
      this.permissionsService.matchesAnyPermission(effectivePermissions, permission),
    );

    if (!hasAnyPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
