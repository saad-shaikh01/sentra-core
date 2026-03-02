/**
 * OrgContext decorator
 *
 * Extracts tenant + actor context from gateway-injected request headers.
 * The api-gateway is responsible for validating the JWT and injecting:
 *   x-organization-id  — the caller's organization UUID
 *   x-user-id          — the authenticated user UUID
 *
 * These headers are consumed here so controllers never read raw headers directly.
 * When pm-service gets its own JWT guard in a later pass, this decorator
 * will read from req.user instead — no controller changes needed.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface OrgContext {
  organizationId: string;
  userId: string;
}

export const GetOrgContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return {
      organizationId: req.headers['x-organization-id'] as string,
      userId: req.headers['x-user-id'] as string,
    };
  },
);
