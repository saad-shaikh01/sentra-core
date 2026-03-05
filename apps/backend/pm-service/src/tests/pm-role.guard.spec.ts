import { ForbiddenException } from '@nestjs/common';
import { PmRoleGuard } from '../common/guards/pm-role.guard';

type MockRequest = {
  method?: string;
  path?: string;
  headers: Record<string, unknown>;
};

function createHttpContext(req: MockRequest) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as any;
}

describe('PmRoleGuard', () => {
  let guard: PmRoleGuard;

  beforeEach(() => {
    guard = new PmRoleGuard();
  });

  it('allows health endpoints without role header', () => {
    const ctx = createHttpContext({
      method: 'GET',
      path: '/api/pm/health',
      headers: {},
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows OPTIONS preflight without role header', () => {
    const ctx = createHttpContext({
      method: 'OPTIONS',
      path: '/api/pm/projects',
      headers: {},
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows OWNER/ADMIN/PROJECT_MANAGER (case-insensitive)', () => {
    const ownerCtx = createHttpContext({
      method: 'GET',
      path: '/api/pm/projects',
      headers: { 'x-user-role': 'owner' },
    });
    const adminCtx = createHttpContext({
      method: 'GET',
      path: '/api/pm/projects',
      headers: { 'x-user-role': 'ADMIN' },
    });
    const pmCtx = createHttpContext({
      method: 'GET',
      path: '/api/pm/projects',
      headers: { 'x-user-role': 'PROJECT_MANAGER' },
    });

    expect(guard.canActivate(ownerCtx)).toBe(true);
    expect(guard.canActivate(adminCtx)).toBe(true);
    expect(guard.canActivate(pmCtx)).toBe(true);
  });

  it('throws when role header is missing', () => {
    const ctx = createHttpContext({
      method: 'GET',
      path: '/api/pm/projects',
      headers: {},
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws for disallowed roles', () => {
    const ctx = createHttpContext({
      method: 'GET',
      path: '/api/pm/projects',
      headers: { 'x-user-role': 'SALES_MANAGER' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
