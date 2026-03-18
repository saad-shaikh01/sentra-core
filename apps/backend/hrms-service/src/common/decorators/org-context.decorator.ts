import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface HrmsOrgContextValue {
  organizationId: string;
  userId: string;
  userRole?: string;
}

export const OrgContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HrmsOrgContextValue => {
    const req = ctx.switchToHttp().getRequest<Request & {
      user?: { sub?: string; orgId?: string; role?: string };
    }>();

    return {
      organizationId:
        (req.headers['x-organization-id'] as string | undefined) ?? req.user?.orgId ?? '',
      userId: (req.headers['x-user-id'] as string | undefined) ?? req.user?.sub ?? '',
      userRole: (req.headers['x-user-role'] as string | undefined) ?? req.user?.role,
    };
  },
);
