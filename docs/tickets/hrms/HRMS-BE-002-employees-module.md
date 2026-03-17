# HRMS-BE-002: Employees Module (User CRUD, Invite, Suspend, Deactivate)

## Overview
Implement the core employees module in HRMS service. This is the source of truth for all staff users within an organization. Covers full CRUD, invite flow, status management (active/suspended/deactivated), and profile management.

## Background / Context
Currently, user creation and management lives informally in `core-service`. This ticket formalizes all user management in HRMS. An "employee" here means any staff member of an organization — not necessarily someone with HRMS payroll access specifically.

## Acceptance Criteria
- [ ] `GET /hrms/employees` returns paginated list of employees for the org (supports filters)
- [ ] `GET /hrms/employees/:id` returns single employee with their app access and roles
- [ ] `POST /hrms/employees` creates a new employee record (without invite)
- [ ] `POST /hrms/employees/:id/invite` sends an invitation email and sets status to INVITED
- [ ] `PATCH /hrms/employees/:id` updates name, department, phone, etc. (not email, not status)
- [ ] `PATCH /hrms/employees/:id/suspend` — per AUTH-006
- [ ] `PATCH /hrms/employees/:id/unsuspend` — per AUTH-006
- [ ] `PATCH /hrms/employees/:id/deactivate` soft-deletes (sets status to DEACTIVATED, revokes all sessions)
- [ ] All mutation endpoints require appropriate HRMS permissions (per RBAC-001)
- [ ] Employees list has filters: status, appCode access, search by name/email
- [ ] Pagination follows standard format: `{ data, meta: { total, page, limit, pages } }`

## Technical Specification

### Schema (Prisma - additions to User model)

```prisma
// Ensure User model has these fields (add migration if missing):
model User {
  id              String      @id @default(cuid())
  organizationId  String
  email           String
  firstName       String
  lastName        String
  phone           String?
  avatarUrl       String?
  jobTitle        String?
  departmentId    String?
  status          UserStatus  @default(INVITED)
  suspendedAt     DateTime?
  suspendedBy     String?
  suspendReason   String?
  deactivatedAt   DateTime?
  deactivatedBy   String?

  // Relations
  organization    Organization  @relation(...)
  department      Department?   @relation(...)
  appAccess       UserAppAccess[]
  appRoles        UserAppRole[]
  refreshTokens   RefreshToken[]

  @@unique([email, organizationId])
  @@index([organizationId])
}
```

### DTOs

```typescript
// create-employee.dto.ts
export class CreateEmployeeDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(1)
  firstName: string;

  @IsString() @MinLength(1)
  lastName: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  jobTitle?: string;

  @IsOptional() @IsString()
  departmentId?: string;
}

// update-employee.dto.ts (no email, no status)
export class UpdateEmployeeDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
}

// employees-query.dto.ts
export class EmployeesQueryDto {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() appCode?: string;       // filter by app access
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() search?: string;        // name or email
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
```

### Service

```typescript
// employees.service.ts

async findAll(orgId: string, query: EmployeesQueryDto) {
  const { status, appCode, departmentId, search, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    organizationId: orgId,
    ...(status && { status }),
    ...(departmentId && { departmentId }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }),
    ...(appCode && {
      appAccess: { some: { appCode, isActive: true } }
    }),
  };

  const [users, total] = await this.prisma.$transaction([
    this.prisma.user.findMany({
      where, skip, take: limit,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      include: {
        department: { select: { id: true, name: true } },
        appAccess: { where: { isActive: true }, select: { appCode: true } },
        appRoles: { include: { appRole: { select: { name: true, slug: true, appCode: true } } } }
      }
    }),
    this.prisma.user.count({ where })
  ]);

  return {
    data: users.map(this.mapToDto),
    meta: { total, page, limit, pages: Math.ceil(total / limit) }
  };
}

async create(orgId: string, dto: CreateEmployeeDto, createdBy: string) {
  // Check email uniqueness within org
  const existing = await this.prisma.user.findUnique({
    where: { email_organizationId: { email: dto.email, organizationId: orgId } }
  });
  if (existing) throw new ConflictException('A user with this email already exists in your organization');

  return this.prisma.user.create({
    data: {
      ...dto,
      organizationId: orgId,
      status: 'INVITED', // default status
    }
  });
}

async deactivate(userId: string, orgId: string, adminId: string) {
  const user = await this.findOrFail(userId, orgId);
  if (user.status === 'DEACTIVATED') throw new BadRequestException('User already deactivated');
  if (user.id === adminId) throw new BadRequestException('Cannot deactivate yourself');

  await this.prisma.user.update({
    where: { id: userId },
    data: { status: 'DEACTIVATED', deactivatedAt: new Date(), deactivatedBy: adminId }
  });

  // Revoke all sessions
  await this.prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'USER_DEACTIVATED' }
  });

  // Add to Redis blacklist
  await this.redis.setex(`suspended:${userId}`, 900, '1');

  await this.auditService.log({
    action: 'USER_DEACTIVATED',
    actorId: adminId,
    targetUserId: userId,
    organizationId: orgId,
  });
}
```

### Controller

```typescript
@Controller('employees')
@UseGuards(JwtAuthGuard, OrgContextGuard, PermissionsGuard)
export class EmployeesController {

  @Get()
  @Permissions('hrms:users:view')
  async findAll(@Query() query: EmployeesQueryDto, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.findAll(ctx.organizationId, query);
  }

  @Get(':id')
  @Permissions('hrms:users:view')
  async findOne(@Param('id') id: string, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.findOne(id, ctx.organizationId);
  }

  @Post()
  @Permissions('hrms:users:create')
  async create(@Body() dto: CreateEmployeeDto, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.create(ctx.organizationId, dto, ctx.userId);
  }

  @Patch(':id')
  @Permissions('hrms:users:edit')
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.update(id, ctx.organizationId, dto);
  }

  @Patch(':id/suspend')
  @Permissions('hrms:users:suspend')
  async suspend(@Param('id') id: string, @Body() body: { reason: string }, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.suspend(id, ctx.userId, ctx.organizationId, body.reason);
  }

  @Patch(':id/unsuspend')
  @Permissions('hrms:users:suspend')
  async unsuspend(@Param('id') id: string, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.unsuspend(id, ctx.userId, ctx.organizationId);
  }

  @Patch(':id/deactivate')
  @Permissions('hrms:users:deactivate')
  async deactivate(@Param('id') id: string, @OrgContext() ctx: OrgContextDto) {
    return this.employeesService.deactivate(id, ctx.organizationId, ctx.userId);
  }
}
```

### Employee Detail Response Shape
```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;       // computed: firstName + lastName
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  department: { id: string; name: string } | null;
  appAccess: Array<{
    appCode: string;
    appLabel: string;
  }>;
  roles: Array<{
    appCode: string;
    roleName: string;
    roleSlug: string;
  }>;
  suspendedAt: string | null;
  suspendReason: string | null;
  createdAt: string;
  updatedAt: string;
}
```

## Testing Requirements

### Unit Tests
- `create()` throws ConflictException if email already exists in org
- `create()` does NOT throw if same email in different org
- `deactivate()` throws if userId === adminId
- `deactivate()` sets status, revokedAt on all refresh tokens, adds Redis blacklist
- `findAll()` with `search` filter returns partial name/email matches (case-insensitive)
- `findAll()` with `appCode` filter returns only users with that app access

### Integration Tests
- Create employee → findOne returns them with status INVITED
- Suspend → status SUSPENDED, sessions revoked
- Unsuspend → status ACTIVE, blacklist cleared
- Deactivate → status DEACTIVATED, cannot re-login

### Frontend Expectations
(Covered in HRMS-FE tickets, but agent should be aware)
- Employee list has search bar, status filter dropdown, app filter dropdown
- Status badges: INVITED (yellow), ACTIVE (green), SUSPENDED (orange), DEACTIVATED (red/gray)
- Employee detail page shows all fields + sessions panel (from AUTH-005) + roles panel

### Edge Cases
- Deactivating an INVITED (never logged in) user → allowed, sets status, no sessions to revoke
- Updating email is NOT allowed via PATCH (email changes need a separate verify flow — not in scope yet)
- Search for " " (whitespace only) → treat as no search filter
- Pagination: page beyond total pages → returns empty data array, not 404
