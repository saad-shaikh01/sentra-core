# HRMS-BE-001: HRMS Service Bootstrap

## Overview
Bootstrap a new NestJS microservice `hrms-service` following the same patterns as `core-service` and `pm-service`. This service will be the source of truth for organization users, teams, departments, roles, and app access management.

## Background / Context
User management (staff users, invitations, roles, app access) needs a dedicated service — HRMS. This keeps it separate from the core auth service and allows future expansion (payroll, attendance, leave management). All other HRMS tickets depend on this bootstrap.

## Acceptance Criteria
- [ ] New NestJS app at `apps/backend/hrms-service/` with `project.json` in Nx workspace
- [ ] Listens on port `3004` (`PORT_HRMS` env var, fallback `3004`)
- [ ] API prefix: `/api/hrms`
- [ ] Connects to the same Prisma database (shared `libs/backend/prisma-client`)
- [ ] Redis cache module configured (same pattern as other services)
- [ ] JWT auth guard registered globally (validates JWTs issued by core-service using same `JWT_SECRET`)
- [ ] `OrgContextGuard` and `@OrgContext()` decorator (read `x-organization-id` and `x-user-id` headers)
- [ ] Health check: `GET /api/hrms/health` returns `{ status: "ok", service: "hrms", timestamp: "..." }`
- [ ] Request logging middleware (log method, path, duration, orgId)
- [ ] `.env.example` updated with `PORT_HRMS=3004`
- [ ] `README` section added to root docs explaining HRMS service purpose and port

## Technical Specification

### Directory Structure
```
apps/backend/hrms-service/
├── src/
│   ├── main.ts
│   ├── app/
│   │   └── app.module.ts
│   └── modules/
│       └── health/
│           ├── health.controller.ts
│           └── health.module.ts
├── tsconfig.app.json
└── project.json
```

### main.ts
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/hrms');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  const port = process.env.PORT_HRMS || 3004;
  await app.listen(port);
  console.log(`HRMS Service running on port ${port}`);
}

bootstrap();
```

### app.module.ts
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,          // shared from libs/backend/prisma-client
    HrmsCacheModule,       // Redis cache (same pattern as other services)
    HealthModule,
    // Future modules imported here as they are built
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // validates JWT from core-service
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtContextMiddleware, RequestLoggerMiddleware)
      .forRoutes('*');
  }
}
```

### JwtContextMiddleware
```typescript
// Reads x-organization-id and x-user-id headers
// Falls back to JWT claims if headers not present
// Sets req.orgContext = { userId, organizationId }
// Identical pattern to core-service and pm-service
```

### OrgContextGuard
```typescript
// Validates that x-organization-id and x-user-id are present and non-empty
// Returns 401 if missing
// Identical pattern to other services
```

### HrmsCacheModule
```typescript
// Uses same Redis connection from REDIS_URL env var
// Key prefix: "hrms:"
// TTL defaults: 300s (5 min)
// Exposes: get(key), set(key, value, ttl?), del(key), delByPattern(pattern)
```

### Health Controller
```typescript
@Controller('health')
@Public() // no auth required
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'hrms',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    };
  }
}
```

### Environment Variables
```env
PORT_HRMS=3004
JWT_SECRET=<same as core-service>
REDIS_URL=redis://localhost:6379
DATABASE_URL=<same prisma db>
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3005
```

### Nx project.json
Follow the same pattern as `apps/backend/pm-service/project.json` — same build/serve/lint/test targets, just pointing to `hrms-service`.

## Testing Requirements

### Smoke Tests
- `GET /api/hrms/health` returns 200 with `{ status: "ok" }`
- Request without JWT → 401
- Request with valid JWT but missing `x-organization-id` → 401
- Request with valid JWT + org header → passes to controller

### Integration Tests
- Service boots without errors
- Prisma connection successful on boot
- Redis connection successful on boot (log warning if Redis unavailable, do not crash)

### Edge Cases
- `PORT_HRMS` not set in env → defaults to 3004
- `REDIS_URL` not set → log warning, use in-memory cache fallback (same pattern as other services)
- JWT signed with wrong secret → 401 (not 500)
