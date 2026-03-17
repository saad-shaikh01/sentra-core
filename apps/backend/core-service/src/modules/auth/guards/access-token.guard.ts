import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CacheService } from '../../../common/cache/cache.service';

@Injectable()
export class AccessTokenGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Run JWT validation first
    const isValid = await (super.canActivate(context) as Promise<boolean>);
    if (!isValid) return false;

    // Check Redis blacklist for suspended users
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;
    if (userId) {
      const isSuspended = await this.cacheService.get<string>(`suspended:${userId}`);
      if (isSuspended) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended. Contact your administrator.',
        });
      }
    }

    return true;
  }
}
