# HRMS-BE-005: Teams and Departments Module

## Overview
Implement Teams and Departments management in HRMS service. Teams are org-configurable service/product groups (e.g., "Ebook Team", "Design Team") — the team type is a configurable dropdown, not a hardcoded enum. Departments are organizational units. Both are used across Sales and PM dashboards.

## Background / Context
Teams in the Sales context are NOT frontsell/upsell type divisions. They represent the service type the team delivers, such as "Ebook", "Design", "Social Media", "Video", etc. Org admins configure what team types are available. A team manager can be assigned, and team members can have roles within the team (member, lead, manager).

## Acceptance Criteria

### Team Types (configurable)
- [ ] `GET /hrms/team-types` returns all team types for the org + system defaults
- [ ] `POST /hrms/team-types` creates a new team type (org admin only)
- [ ] `PATCH /hrms/team-types/:id` updates name of a custom team type
- [ ] `DELETE /hrms/team-types/:id` deletes a custom team type (only if no teams use it)
- [ ] System team types cannot be deleted (marked `isSystem: true`)

### Teams
- [ ] `GET /hrms/teams` returns paginated list of teams with member count and type
- [ ] `GET /hrms/teams/:id` returns team detail with members list
- [ ] `POST /hrms/teams` creates a new team `{ name, typeId, description?, managerId? }`
- [ ] `PATCH /hrms/teams/:id` updates team name, description, typeId, managerId
- [ ] `DELETE /hrms/teams/:id` soft-deletes team (sets `deletedAt`)
- [ ] `POST /hrms/teams/:id/members` adds a member `{ userId, role: 'MEMBER' | 'LEAD' }`
- [ ] `PATCH /hrms/teams/:id/members/:userId` updates member role
- [ ] `DELETE /hrms/teams/:id/members/:userId` removes a member
- [ ] Manager can be set on team creation or update (must be an active employee in the org)

### Departments
- [ ] `GET /hrms/departments` returns all departments for the org
- [ ] `POST /hrms/departments` creates department `{ name, description? }`
- [ ] `PATCH /hrms/departments/:id` updates name/description
- [ ] `DELETE /hrms/departments/:id` only if no employees assigned to it

## Technical Specification

### Schema

```prisma
model TeamType {
  id             String    @id @default(cuid())
  organizationId String?   // null = system default (all orgs)
  name           String    // "Ebook", "Design", "Social Media", "Video", "SEO", "Development"
  slug           String    // "ebook", "design", "social_media"
  isSystem       Boolean   @default(false)
  createdAt      DateTime  @default(now())

  teams          Team[]

  @@unique([organizationId, slug])
  @@index([organizationId])
}

model Team {
  id             String    @id @default(cuid())
  organizationId String
  name           String
  typeId         String                    // TeamType reference
  description    String?
  managerId      String?                   // User who manages this team
  isActive       Boolean   @default(true)
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  teamType       TeamType  @relation(fields: [typeId], references: [id])
  manager        User?     @relation("TeamManager", fields: [managerId], references: [id])
  members        TeamMember[]

  @@index([organizationId])
}

model TeamMember {
  id             String          @id @default(cuid())
  teamId         String
  userId         String
  role           TeamMemberRole  @default(MEMBER)
  joinedAt       DateTime        @default(now())

  team           Team            @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId])
}

enum TeamMemberRole {
  MEMBER
  LEAD
}

model Department {
  id             String    @id @default(cuid())
  organizationId String
  name           String
  description    String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  employees      User[]

  @@unique([organizationId, name])
  @@index([organizationId])
}
```

### System Team Types Seed

```typescript
// seeded with organizationId: null (available to all orgs)
const SYSTEM_TEAM_TYPES = [
  { name: 'Ebook',           slug: 'ebook',           isSystem: true },
  { name: 'Design',          slug: 'design',          isSystem: true },
  { name: 'Social Media',    slug: 'social_media',    isSystem: true },
  { name: 'Video',           slug: 'video',           isSystem: true },
  { name: 'SEO',             slug: 'seo',             isSystem: true },
  { name: 'Development',     slug: 'development',     isSystem: true },
  { name: 'Content Writing', slug: 'content_writing', isSystem: true },
];
```

### Teams Controller

```typescript
@Controller('teams')
@UseGuards(JwtAuthGuard, OrgContextGuard, PermissionsGuard)
export class TeamsController {

  @Get()
  @Permissions('hrms:teams:view')
  async findAll(@Query() query: TeamsQueryDto, @OrgContext() ctx: OrgContextDto) {
    return this.teamsService.findAll(ctx.organizationId, query);
  }

  @Get(':id')
  @Permissions('hrms:teams:view')
  async findOne(@Param('id') id: string, @OrgContext() ctx: OrgContextDto) {
    return this.teamsService.findOne(id, ctx.organizationId);
  }

  @Post()
  @Permissions('hrms:teams:manage')
  async create(@Body() dto: CreateTeamDto, @OrgContext() ctx: OrgContextDto) {
    return this.teamsService.create(ctx.organizationId, dto, ctx.userId);
  }

  @Patch(':id')
  @Permissions('hrms:teams:manage')
  async update(@Param('id') id: string, @Body() dto: UpdateTeamDto, @OrgContext() ctx: OrgContextDto) {
    return this.teamsService.update(id, ctx.organizationId, dto);
  }

  @Delete(':id')
  @Permissions('hrms:teams:manage')
  async remove(@Param('id') id: string, @OrgContext() ctx: OrgContextDto) {
    return this.teamsService.softDelete(id, ctx.organizationId, ctx.userId);
  }

  @Post(':id/members')
  @Permissions('hrms:teams:manage')
  async addMember(
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
    @OrgContext() ctx: OrgContextDto
  ) {
    return this.teamsService.addMember(id, ctx.organizationId, dto, ctx.userId);
  }

  @Patch(':id/members/:userId')
  @Permissions('hrms:teams:manage')
  async updateMember(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: { role: TeamMemberRole },
    @OrgContext() ctx: OrgContextDto
  ) {
    return this.teamsService.updateMemberRole(teamId, userId, ctx.organizationId, dto.role);
  }

  @Delete(':id/members/:userId')
  @Permissions('hrms:teams:manage')
  async removeMember(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @OrgContext() ctx: OrgContextDto
  ) {
    return this.teamsService.removeMember(teamId, userId, ctx.organizationId, ctx.userId);
  }
}
```

### DTOs

```typescript
// create-team.dto.ts
export class CreateTeamDto {
  @IsString() @MinLength(1) @MaxLength(100)
  name: string;

  @IsString()
  typeId: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString()
  managerId?: string;
}

// add-team-member.dto.ts
export class AddTeamMemberDto {
  @IsString()
  userId: string;

  @IsEnum(TeamMemberRole)
  @IsOptional()
  role?: TeamMemberRole = TeamMemberRole.MEMBER;
}
```

### Team Detail Response

```typescript
{
  id: "xxx",
  name: "Ebook Team Alpha",
  type: { id: "ttt", name: "Ebook", slug: "ebook" },
  description: "Primary ebook production team",
  manager: {
    id: "mmm",
    name: "Jane Smith",
    email: "jane@org.com",
    avatarUrl: null
  },
  memberCount: 5,
  members: [
    {
      userId: "u1",
      name: "John Doe",
      email: "john@org.com",
      avatarUrl: null,
      role: "LEAD",
      jobTitle: "Ebook Writer",
      joinedAt: "2026-01-15T10:00:00Z"
    }
    // ...
  ],
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z"
}
```

### Teams List with Filters

```typescript
// GET /hrms/teams?typeId=xxx&managerId=yyy&search=alpha&page=1&limit=20

interface TeamsQueryDto {
  typeId?: string;        // filter by team type
  managerId?: string;     // filter by manager
  search?: string;        // team name search
  isActive?: boolean;     // default true
  page?: number;
  limit?: number;
}
```

## Testing Requirements

### Unit Tests
- `create()` validates `managerId` belongs to the same org if provided
- `create()` validates `typeId` is a system type or a type from the same org
- `addMember()` validates user belongs to the same org
- `addMember()` throws ConflictException if user already in team
- `softDelete()` sets `deletedAt`, does NOT delete the record
- `findAll()` excludes soft-deleted teams by default (unless `isActive=false` passed)

### Integration Tests
- Create team type → create team with that type → GET team shows type name
- Add member with role LEAD → GET team detail shows LEAD role
- Change member role from MEMBER to LEAD → reflected in GET
- Remove member → not in team members anymore
- Delete team type that has teams → 409 Conflict

### Sales Dashboard Usage
The Sales Dashboard should:
- Fetch teams from `GET /api/hrms/teams` (via API Gateway)
- Show teams in a dropdown when assigning a lead to a team
- Show team name in lead list as a filter option
- Sales dashboard users with `sales:teams:view` can view; `sales:teams:manage` can edit

### Edge Cases
- Team with no manager is allowed (managerId is optional)
- Adding a deactivated user as team member → reject with clear message
- Team name must be unique per org (case-insensitive): "Ebook Team" and "ebook team" → conflict
- Manager is NOT automatically added as a team member — manager and member are separate concepts
