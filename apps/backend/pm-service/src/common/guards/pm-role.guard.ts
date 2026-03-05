import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const ALLOWED_PM_ROLES = new Set(['OWNER', 'ADMIN', 'PROJECT_MANAGER']);

@Injectable()
export class PmRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path ?? '';
    const method = req.method?.toUpperCase() ?? '';

    // Keep health endpoint available for probes.
    if (path.includes('/health')) {
      return true;
    }

    // CORS preflight should never be blocked by auth guards.
    if (method === 'OPTIONS') {
      return true;
    }

    const role = req.headers['x-user-role'];
    const roleValue = Array.isArray(role) ? role[0] : role;
    const normalizedRole =
      typeof roleValue === 'string' ? roleValue.trim().toUpperCase() : null;

    if (!normalizedRole) {
      throw new ForbiddenException('Missing x-user-role header');
    }

    if (!ALLOWED_PM_ROLES.has(normalizedRole)) {
      throw new ForbiddenException('Role is not allowed to access PM module');
    }

    return true;
  }
}
