# Backend Status - Auth, RBAC & Organization System

**Last Updated:** February 08, 2026
**Phase:** 1 (Database & Backend Logic) - COMPLETE

---

## Overview

The Authentication, Role-Based Access Control (RBAC), and Organization Management system is fully operational in the Core Service (`apps/backend/core-service`). 
**New:** Email infrastructure and Password Reset flow are now integrated.

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
  - **New:** Added `resetPasswordToken` and `resetPasswordExpires` for secure password recovery.

- **Invitation Model:** New model for team invitations
  - `email`, `role`, `token` (unique)
  - `status` (PENDING, ACCEPTED, EXPIRED, CANCELLED)
  - `expiresAt`, `organizationId`, `invitedById`

**Migrations:**
- `20260205085729_add_rbac_and_profile`
- `20260208111143_add_password_reset_fields`

---

### 2. Global Libraries ✅

#### Mail Client Library (New)
**Location:** `libs/backend/mail-client`
- Reusable NestJS module for sending emails.
- **Templates:** `WELCOME`, `INVITATION`, `PASSWORD_RESET`.
- **Infrastructure:** Nodemailer with SMTP (Gmail/Resend compatible).
- **Integration:** Used by `CoreService` (Auth & Invitations).

#### Shared Types Library
**File:** `libs/shared/types/src/lib/types.ts`
- Exports: `UserRole`, `InvitationStatus`, `JwtPayload`, `IUserProfile`, `IOrganization`.

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

#### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | Public | Create new organization & owner (Sends Welcome Email) |
| POST | `/api/auth/login` | Public | Authenticate user |
| POST | `/api/auth/logout` | Required | Invalidate refresh token |
| POST | `/api/auth/refresh` | RefreshToken | Get new access token |
| POST | `/api/auth/forgot-password` | Public | Request password reset (Sends Email) |
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
| POST | `/api/organization/invite` | OWNER, ADMIN | Send invitation (Sends Email) |
| GET | `/api/organization/invitations` | OWNER, ADMIN | List pending invitations |
| DELETE | `/api/organization/invitations/:id` | OWNER, ADMIN | Cancel invitation |
| POST | `/api/organization/link-invite` | Required | Link invitation to existing user |
| GET | `/api/auth/invite?token=...` | Public | Get invitation details |
| POST | `/api/auth/accept-invite` | Public | Accept invitation (new user signup) |

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
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"

# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
FRONTEND_URL="http://localhost:4200"
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
    "uuid": "^11.x",
    "nodemailer": "^6.x"
  },
  "devDependencies": {
    "@types/passport-jwt": "^4.x",
    "@types/bcryptjs": "^2.x",
    "@types/uuid": "^10.x",
    "@types/nodemailer": "^6.x"
  }
}
```