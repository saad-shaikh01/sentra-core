# 🤖 Autonomous Task: Auth, RBAC & Organization System (Phase 1)

**Priority:** Critical
**Mode:** Autonomous (Codespaces)
**Target:** End-to-End Implementation of Auth, Roles, and Profile Management.

---

## 📌 Objective
Tumhe **Sentra Core System** ka "Identity & Access Management" layer build karna hai.
Sirf login/signup kaafi nahi hai. Humein **Granular Role-Based Access Control (RBAC)** chahiye jahan Organization Admin apni team ke roles (Sales, Project, Upsell) manage kar sake.

**Architecture Ref:**
- Backend: `apps/backend/core-service` (NestJS)
- Frontend: `apps/frontend/sales-dashboard` (Next.js + Shadcn)
- Database: PostgreSQL (Prisma)

---

## 🛠 Phase 1: Database & Schema Design

### 1. Update Prisma Schema (`libs/backend/prisma-client`)
User aur Roles ko robust banao.
- [ ] **Update User Model:** Add fields: `avatarUrl`, `jobTitle`, `phone`, `bio`.
- [ ] **Define Roles Enum:** System should strictly follow these roles:
    - `OWNER` (Creator of Org)
    - `ADMIN` (Can manage users)
    - `SALES_MANAGER` (View all leads)
    - `PROJECT_MANAGER` (View orders/invoices)
    - `FRONTSELL_AGENT` (Focus on New Leads)
    - `UPSELL_AGENT` (Focus on Existing Clients)
- [ ] **Invitation Model:** Add `role` field to Invitation table (Invite bhejtay waqt hi role decide hoga).
- [ ] **Run Migration:** `npx prisma migrate dev --name add_rbac_and_profile`

---

## 🔐 Phase 2: Backend Logic (Core Service)

### 1. Auth Module (`modules/auth`)
- [ ] **Standard Auth:** Login, Signup (Create Org), Forgot Password.
- [ ] **JWT Payload:** Token ke andar `userId`, `orgId`, aur `role` zaroor hona chahiye taake frontend par permission check fast ho.

### 2. User Profile Module (`modules/users`)
- [ ] **Get Me:** `GET /users/me` (Return full profile with Org details).
- [ ] **Update Profile:** `PATCH /users/me`
    - Allow updating: Name, Avatar, Phone, Job Title.
    - **Validation:** Email change not allowed here.

### 3. Organization & Team Module (`modules/organization`)
- [ ] **Get Members:** `GET /organization/members`
    - Return list of users with their specific Roles.
    - **Guard:** Only accessible to `OWNER`, `ADMIN`, `SALES_MANAGER`.
- [ ] **Manage Role (Promote/Demote):** `PATCH /organization/members/:userId/role`
    - Body: `{ role: 'PROJECT_MANAGER' }`
    - **Security Rule:** Only `OWNER` or `ADMIN` can change roles. `ADMIN` cannot change `OWNER`'s role.
- [ ] **Remove Member:** `DELETE /organization/members/:userId`
    - Soft delete logic (remove access, don't delete history).

### 4. Invitation System (Advanced)
- [ ] **Invite User:** `POST /organization/invite`
    - Body: `{ email: 'alex@agency.com', role: 'FRONTSELL_AGENT' }`
    - Email link generate karo aur console log karo testing ke liye.
- [ ] **Accept Flow:** Handle case where user already has an account (Link Org) vs New User (Signup + Link).

---

## 🎨 Phase 3: Frontend Implementation (Sales Dashboard)

### 1. Profile & Settings Page (`/app/settings/profile`)
- [ ] **Profile Form:** Shadcn Form to update Name, Job Title, Avatar.
- [ ] **UI:** Sidebar mein user avatar dikhao with distinct badge (e.g., "Owner" badge gold color mein).

### 2. Team Management Page (`/app/settings/team`)
- [ ] **Data Table:** Use `@tanstack/react-table`.
    - Columns: Name, Email, Role (Badge), Status (Active/Pending), Actions.
- [ ] **Role Dropdown:** Admin should see a dropdown to change a user's role instantly.
    - *Example:* Change "Mark" from `FRONTSELL_AGENT` to `SALES_MANAGER`.
- [ ] **Invite Modal:**
    - Input Email.
    - **Select Role:** Dropdown showing all 6 roles with descriptions (e.g., "Frontsell: Can only view new leads").

### 3. Role-Based Visibility (Frontend Guard)
- [ ] Create a Wrapper Component `<RoleGuard allowed={['OWNER', 'ADMIN']}>`.
- [ ] **Navigation:** "Settings" tab sirf ADMIN/OWNER ko dikhni chahiye.
- [ ] **Leads:** FRONTSELL walo ko sirf assigned leads dikhein. (Filter logic preparation).

---

## 📝 Rules of Engagement

1.  **Strict Typing:** `libs/shared/types` mein `UserRole` enum define karo aur backend/frontend dono jagah same use karo. No magic strings!
2.  **Security First:** Backend par har protected route par `@Roles('ADMIN', 'OWNER')` decorator implementation honi chahiye. Frontend checks sirf UX ke liye hain, security Backend par hogi.
3.  **Autonomous Execution:**
    - Pehle Backend Models aur API complete karo.
    - Phir Frontend pages banao.
    - Test karo: 2 users create karo (ek Admin, ek Agent) aur check karo ke Agent "Team Settings" access na kar paye.

**Start working on Database Schema updates first.**