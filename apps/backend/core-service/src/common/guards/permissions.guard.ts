import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppCode, JwtPayload } from '@sentra-core/types';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsService } from '../services/permissions.service';

const APP_BY_PERMISSION_PREFIX: Record<string, AppCode> = {
  sales: AppCode.SALES_DASHBOARD,
  pm: AppCode.PM_DASHBOARD,
  hrms: AppCode.HRMS,
  admin: AppCode.CLIENT_PORTAL,
  comm: AppCode.COMM_SERVICE,
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    this.assertHasRequiredAppAccess(user, requiredPermissions);

    const effectivePermissions = await this.permissionsService.getUserPermissions(user.sub, orgId);
    const hasAllPermissions = requiredPermissions.every((permission) =>
      this.permissionsService.matchesAnyPermission(effectivePermissions, permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private assertHasRequiredAppAccess(user: JwtPayload, requiredPermissions: string[]): void {
    if (!user.appCodes || user.appCodes.length === 0) {
      return;
    }

    for (const permission of requiredPermissions) {
      const [permissionPrefix] = permission.split(':', 1);
      const requiredApp = APP_BY_PERMISSION_PREFIX[permissionPrefix];
      if (requiredApp && !user.appCodes.includes(requiredApp)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }
  }
}
