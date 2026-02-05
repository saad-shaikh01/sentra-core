# 🤖 Autonomous Task: Authentication & Organization Management System

**Priority:** High
**Mode:** Autonomous (Codespaces)
**Target:** Complete End-to-End Implementation of Auth & Org Logic.

---

## 📌 Objective
Tumhe **Sentra Core System** ka complete **Authentication** aur **Organization Management** flow implement karna hai. Ye "Production Grade" hona chahiye. Isme Backend (NestJS) aur Frontend (Next.js with Shadcn UI) dono shamil hain.

**Architecture Ref:**
- Backend: `apps/backend/core-service` (Port 3001)
- Frontend: `apps/frontend/sales-dashboard` (Port 4200)
- Database: PostgreSQL via Prisma (`libs/backend/prisma-client`)
- Styling: Tailwind CSS + Shadcn UI (Dark/Light Mode)

---

## 🛠 Phase 1: Database & Backend Logic (Core Service)

### 1. Prisma Schema Update (`libs/backend/prisma-client`)
Tumhe `schema.prisma` ko update karna hai taake Invite System support ho sake.
- [ ] **Invitation Model:** Create `Invitation` table with fields: `email`, `token` (unique), `organizationId`, `role`, `status` (PENDING, ACCEPTED), `expiresAt`.
- [ ] **Relations:** Update `Organization` to have `invitations[]`.
- [ ] **Run Migration:** `npx prisma migrate dev --name add_invitations`

### 2. Auth Module Implementation (`modules/auth`)
- [ ] **Signup API:** `POST /auth/signup` (Create User + Create Default Organization "My Workspace" + JWT).
- [ ] **Login API:** `POST /auth/login` (Validate credentials -> Return Access Token & Refresh Token).
- [ ] **Password Reset:**
    - `POST /auth/forgot-password`: Generate token, save hash, trigger Email Event.
    - `POST /auth/reset-password`: Validate token, update password.
- [ ] **Guards:** Implement `JwtAuthGuard` and `RolesGuard` globally.

### 3. Organization Module (`modules/organization`)
- [ ] **Create Org:** `POST /organization` (User creates a new company).
- [ ] **Get Org Details:** `GET /organization/:id`.
- [ ] **Invite Member (Complex):** `POST /organization/invite`
    - Check if user already exists in DB.
    - Generate unique token.
    - Save to `Invitation` table.
    - **Trigger Email:** Send link `https://app.domain.com/invite?token=xyz`.
- [ ] **Accept Invite:** `POST /organization/join`
    - Validate token.
    - Check if user exists.
    - If User Exists: Add to `Organization` members directly.
    - If User New: Require `signup` with token payload.

---

## 🎨 Phase 2: Frontend Implementation (Sales Dashboard)

### 1. Setup & UI Foundation
- [ ] **Shadcn UI Init:** Initialize Shadcn UI in `apps/frontend/sales-dashboard`.
- [ ] **Theming:** Install `next-themes` and setup Dark/Light mode toggle.
- [ ] **Components:** Install Button, Input, Card, Form (React Hook Form + Zod), Dropdown, Toast, Dialog.

### 2. Authentication Pages (`/app/auth/*`)
- [ ] **Login Page:** Beautiful UI, connect to `/auth/login`. Handle JWT storage (Cookies/HttpOnly).
- [ ] **Signup Page:** Registration form with Organization Name input.
- [ ] **Forgot Password:** Email input form.

### 3. Organization Flow
- [ ] **Create Org Modal:** Dashboard ke andar button to create new workspace.
- [ ] **Team Management Page:** List users, Button "Invite Member".
- [ ] **Invite Acceptance Page (`/invite/[token]`):**
    - **Logic:** Page load hote hi API call karo token validate karne ke liye.
    - **Scenario A (User Logged In):** "Do you want to join [Org Name]?" -> Yes -> API Call -> Redirect to Dashboard.
    - **Scenario B (User Not Exists):** Show "Signup to Join [Org Name]" form. Email pre-filled aur locked honi chahiye (security reason).

---

## 📧 Phase 3: Email Integration (Mock for Now)
Since `comm-service` is separate, for now within `core-service`:
- [ ] Create a `MailService` wrapper.
- [ ] Use `console.log` or a temp `nodemailer` to log the "Reset Password Link" and "Invite Link" in the terminal so we can test it manually.

---

## 📝 Rules of Engagement (Strict Instructions)

1.  **Autonomous Documentation:**
    - `docs` folder check karo. Agar nahi hai to banao.
    - Har bada feature complete hone par `docs/BACKEND_STATUS.md` aur `docs/FRONTEND_STATUS.md` ko update karo ke kya ban gaya hai aur endpoints kya hain.

2.  **Git Commits:**
    - Har feature ke baad code commit karo.
    - Format: `feat(auth): implemented login logic` or `ui(dashboard): added dark mode`.

3.  **Error Handling:**
    - Backend mein `GlobalExceptionFilter` use karo.
    - Frontend par `Toaster` notifications use karo error dikhane ke liye.

4.  **No Placeholders:**
    - "TODO" mat chodna. Logic complete honi chahiye.
    - Typescript `any` use mat karna. Proper DTOs aur Interfaces use karo (`libs/shared/types` mein).

---

**Start processing Phase 1 immediately.**