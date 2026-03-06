import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppCode, JwtPayload } from '@sentra-core/types';
import { APP_ACCESS_KEY } from '../decorators/app-access.decorator';

@Injectable()
export class AppAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAppCode = this.reflector.getAllAndOverride<AppCode | undefined>(
      APP_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @AppAccess decorator — allow through
    if (!requiredAppCode) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    // No user (public route) — allow through; AccessTokenGuard handles auth
    if (!user) {
      return true;
    }

    // appCodes empty = IAM feature disabled, allow through for backward compat
    if (!user.appCodes || user.appCodes.length === 0) {
      return true;
    }

    if (!user.appCodes.includes(requiredAppCode)) {
      throw new ForbiddenException(
        `Access to ${requiredAppCode} is not granted for this account`,
      );
    }

    return true;
  }
}
