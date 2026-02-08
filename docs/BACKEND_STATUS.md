# Backend Status - Auth, RBAC & Organization System

**Last Updated:** February 05, 2026
**Phase:** 1 (Database & Backend Logic) - COMPLETE

---

## Overview

The Authentication, Role-Based Access Control (RBAC), and Organization Management system has been implemented in the Core Service (`apps/backend/core-service`).

## Completed Features

### 1. Database Schema Updates ✅

**File:** `libs/backend/prisma-client/prisma/schema.prisma`

- **UserRole Enum:** Defined 6 hierarchical roles
  - `OWNER` - Organization creator, full access
  - `ADMIN` - Can manage users and roles
  - `SALES_MANAGER` - Can view all leads
  - `PROJECT_MANAGER` - Can manage orders/invoices
  - `FRONTSELL_AGENT` - Focus on new leads
  - `UPSELL_AGENT` - Focus on existing clients

- **User Model Updates:**
  - Added profile fields: `avatarUrl`, `jobTitle`, `phone`, `bio`
  - Added `isActive` for soft delete
  - Added `refreshToken` for JWT refresh token storage
  - Changed `role` from String to `UserRole` enum

- **Invitation Model:** New model for team invitations
  - `email`, `role`, `token` (unique)
  - `status` (PENDING, ACCEPTED, EXPIRED, CANCELLED)
  - `expiresAt`, `organizationId`, `invitedById`

**Migration:** `20260205085729_add_rbac_and_profile`

---

### 2. Shared Types Library ✅

**File:** `libs/shared/types/src/lib/types.ts`

Exports:
- `UserRole` enum
- `InvitationStatus` enum
- `ROLE_HIERARCHY` array with helper functions
- `JwtPayload` interface
- `IUserProfile`, `IUserPublic` interfaces
- `IOrganization`, `IOrganizationMember` interfaces
- `IInvitation` interface
- `IAuthTokens`, `ILoginResponse`, `ISignupResponse` interfaces
- `ROLE_DESCRIPTIONS` for UI display

---

### 3. Auth Module ✅

**Location:** `apps/backend/core-service/src/modules/auth/`

#### Strategies
- `JwtStrategy` - Validates access tokens
- `JwtRefreshStrategy` - Validates refresh tokens

#### Guards
- `AccessTokenGuard` - Global guard for JWT authentication
- `RefreshTokenGuard` - For refresh token endpoint
- `RolesGuard` - RBAC guard with hierarchical role support

#### Decorators
- `@Public()` - Mark routes as public (no auth required)
- `@Roles(...roles)` - Specify required roles for a route
- `@CurrentUser(key?)` - Extract user from request

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | Public | Create new organization & owner |
| POST | `/api/auth/login` | Public | Authenticate user |
| POST | `/api/auth/logout` | Required | Invalidate refresh token |
| POST | `/api/auth/refresh` | RefreshToken | Get new access token |
| POST | `/api/auth/forgot-password` | Public | Request password reset |
| POST | `/api/auth/reset-password` | Public | Reset password with token |

#### JWT Payload Structure
```typescript
{
  sub: string;    // userId
  email: string;
  orgId: string;
  role: UserRole;
}
```

---

### 4. Users Module ✅

**Location:** `apps/backend/core-service/src/modules/users/`

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | Required | Get current user profile |
| PATCH | `/api/users/me` | Required | Update profile (name, avatar, phone, jobTitle, bio) |

**Note:** Email changes are not allowed via this endpoint.

---

### 5. Organization Module ✅

**Location:** `apps/backend/core-service/src/modules/organization/`

#### Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/organization/members` | OWNER, ADMIN, SALES_MANAGER | List all organization members |
| PATCH | `/api/organization/members/:userId/role` | OWNER, ADMIN | Change member role |
| DELETE | `/api/organization/members/:userId` | OWNER, ADMIN | Remove member (soft delete) |

#### Security Rules
- Admin cannot change Owner's role
- Cannot assign OWNER role (ownership transfer requires separate flow)
- Users cannot remove themselves
- Operations restricted to same organization

---

### 6. Invitation Module ✅

**Location:** `apps/backend/core-service/src/modules/invitation/`

#### Endpoints

| Method | Endpoint | Auth/Roles | Description |
|--------|----------|------------|-------------|
| POST | `/api/organization/invite` | OWNER, ADMIN | Send invitation |
| GET | `/api/organization/invitations` | OWNER, ADMIN | List pending invitations |
| DELETE | `/api/organization/invitations/:id` | OWNER, ADMIN | Cancel invitation |
| POST | `/api/organization/link-invite` | Required | Link invitation to existing user |
| GET | `/api/auth/invite?token=...` | Public | Get invitation details |
| POST | `/api/auth/accept-invite` | Public | Accept invitation (new user signup) |

#### Invitation Flow

1. **Admin invites user:**
   ```bash
   POST /api/organization/invite
   Body: { "email": "new@user.com", "role": "FRONTSELL_AGENT" }
   ```
   - Creates invitation with 7-day expiry
   - Logs invitation link to console (for testing)

2. **New User (no account):**
   - Opens invitation link
   - `GET /api/auth/invite?token=xxx` returns org name and role
   - `POST /api/auth/accept-invite` with name, password creates account

3. **Existing User (has account):**
   - Logs in first
   - `POST /api/organization/link-invite` with token joins organization

---

## Configuration

### Environment Variables (.env)

```env
# Database
DATABASE_URL="postgresql://..."

# Service Ports
PORT_CORE=3001

# JWT Configuration
JWT_ACCESS_SECRET="your-access-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_ACCESS_EXPIRES="15m"   # Used as 900 seconds internally
JWT_REFRESH_EXPIRES="7d"   # Used as 604800 seconds internally
```

---

## Packages Installed

```json
{
  "dependencies": {
    "@nestjs/passport": "^11.x",
    "@nestjs/jwt": "^11.x",
    "@nestjs/config": "^4.x",
    "passport": "^0.7.x",
    "passport-jwt": "^4.x",
    "bcryptjs": "^2.x",
    "class-validator": "^0.14.x",
    "class-transformer": "^0.5.x",
    "uuid": "^11.x"
  },
  "devDependencies": {
    "@types/passport-jwt": "^4.x",
    "@types/bcryptjs": "^2.x",
    "@types/uuid": "^10.x"
  }
}
```

---

## Testing the API

### 1. Start Services
```bash
docker-compose up -d postgres
npx nx serve core-service
```

### 2. Create Organization (Signup)
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "password123",
    "name": "Test Admin",
    "organizationName": "Test Org"
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "password123"
  }'
```

### 4. Invite Team Member
```bash
curl -X POST http://localhost:3001/api/organization/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "email": "agent@test.com",
    "role": "FRONTSELL_AGENT"
  }'
```

---

## Phase 2: Frontend Implementation - COMPLETE

### Implemented Features

1. **Tailwind CSS v4 + Custom Theme**
   - Configured with `@tailwindcss/postcss`
   - Custom color scheme via `@theme` directive

2. **UI Components (`src/components/ui/`)**
   - Button, Input, Label, Card
   - Badge (with role-specific variants)
   - Avatar, Dialog, Select

3. **Auth Context & API Client**
   - `src/lib/api.ts` - API client with token management
   - `src/contexts/auth-context.tsx` - Auth state management
   - Automatic token refresh on 401 responses

4. **Auth Pages**
   - `/auth/login` - Login form
   - `/auth/signup` - Signup with organization creation
   - `/auth/accept-invite` - Accept invitation flow

5. **Dashboard Layout**
   - Sidebar navigation with role-based visibility
   - User avatar with role badge
   - Protected route wrapper

6. **Profile Settings (`/dashboard/settings/profile`)**
   - View/edit name, avatar, job title, phone, bio
   - Email is read-only

7. **Team Management (`/dashboard/settings/team`)**
   - DataTable showing all members
   - Role badges with distinct colors
   - Role change dropdown (for OWNER/ADMIN)
   - Remove member functionality
   - Invite modal with role selection
   - Pending invitations list

8. **RoleGuard Component**
   - `<RoleGuard allowed={[UserRole.OWNER, UserRole.ADMIN]}>`
   - Hierarchical role checking
   - Used for conditional UI rendering

### Frontend Routes

| Route | Description | Access |
|-------|-------------|--------|
| `/` | Redirects to login/dashboard | Public |
| `/auth/login` | Login page | Public |
| `/auth/signup` | Signup page | Public |
| `/auth/accept-invite` | Accept invitation | Public |
| `/dashboard` | Main dashboard | Authenticated |
| `/dashboard/settings/profile` | Profile settings | Authenticated |
| `/dashboard/settings/team` | Team management | OWNER, ADMIN |

---

## Next Steps (Phase 3)

### Advanced Features
- [ ] Password reset email integration
- [ ] Ownership transfer flow
- [ ] Activity logging
- [ ] Two-factor authentication
- [ ] Lead management pages
- [ ] Order management pages

---

## Architecture Notes

### Global Guards
Both `AccessTokenGuard` and `RolesGuard` are registered globally in `AppModule`:
```typescript
{
  provide: APP_GUARD,
  useClass: AccessTokenGuard,
},
{
  provide: APP_GUARD,
  useClass: RolesGuard,
}
```

### Role Hierarchy
Roles follow this hierarchy (higher index = higher privilege):
```typescript
[UPSELL_AGENT, FRONTSELL_AGENT, PROJECT_MANAGER, SALES_MANAGER, ADMIN, OWNER]
```

The `RolesGuard` checks if user has the required role OR a higher role in the hierarchy.
