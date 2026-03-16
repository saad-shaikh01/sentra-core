import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

const ALLOWED_IAM_ROLES = new Set(['OWNER', 'ADMIN', 'PROJECT_MANAGER']);
const ALLOWED_PM_APP_ROLES = new Set([
  'pm-admin',
  'pm-project-manager',
  'pm-dept-lead',
  'pm-team-member',
]);

// Map IAM roles to PM app roles when no x-pm-app-role header is present
const IAM_TO_PM_ROLE: Record<string, string> = {
  OWNER: 'pm-admin',
  ADMIN: 'pm-admin',
  PROJECT_MANAGER: 'pm-project-manager',
};

@Injectable()
export class PmRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path ?? '';
    const method = req.method?.toUpperCase() ?? '';

    if (path.includes('/health')) return true;
    if (method === 'OPTIONS') return true;

    // Check x-pm-app-role first
    const pmAppRole = req.headers['x-pm-app-role'];
    const pmRoleValue = Array.isArray(pmAppRole) ? pmAppRole[0] : pmAppRole;
    if (typeof pmRoleValue === 'string' && pmRoleValue.trim()) {
      const normalized = pmRoleValue.trim().toLowerCase();
      if (ALLOWED_PM_APP_ROLES.has(normalized)) {
        req.headers['x-pm-app-role'] = normalized;
        return true;
      }
      throw new ForbiddenException('Invalid x-pm-app-role value');
    }

    // Fallback: check IAM x-user-role
    const iamRole = req.headers['x-user-role'];
    const iamRoleValue = Array.isArray(iamRole) ? iamRole[0] : iamRole;
    const normalizedIam =
      typeof iamRoleValue === 'string' ? iamRoleValue.trim().toUpperCase() : null;

    if (!normalizedIam) {
      throw new ForbiddenException('Missing x-user-role or x-pm-app-role header');
    }
    if (!ALLOWED_IAM_ROLES.has(normalizedIam)) {
      throw new ForbiddenException('Role is not allowed to access PM module');
    }

    // Auto-map IAM role to PM app role
    const mappedPmRole = IAM_TO_PM_ROLE[normalizedIam];
    if (mappedPmRole) {
      req.headers['x-pm-app-role'] = mappedPmRole;
    }

    return true;
  }
}
