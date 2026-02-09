# SentraCore - Roadmap & Task List (SaaS & Auth Completion)

This document tracks the tasks required to complete the Authentication flow and implement the SaaS foundation (Limits, Plans, etc.).

## 🏗 Backend Tasks (Core & Comm Services)

### 🎫 Ticket B-001: Email Infrastructure Setup
- [ ] Implement `CommService` logic for handling emails.
- [ ] Configure `Nodemailer` with Gmail SMTP (App Password).
- [ ] Create email templates for:
  - Welcome Email
  - Password Reset
  - Organization Invitation
- [ ] Integrate `OutboxEvent` pattern to trigger emails when an event occurs.

### 🎫 Ticket B-002: SaaS Database Schema Update
- [ ] Update `Organization` model in `schema.prisma`:
  - Add `planType` enum (FREE, PRO, ENTERPRISE).
  - Add `subscriptionStatus` enum (ACTIVE, PAST_DUE, CANCELED).
  - Add `maxBrands`, `maxMembers` overrides (optional).
- [ ] Add `stripeCustomerId` and `subscriptionId` for future billing.
- [ ] Run migrations and update Prisma Client.

### 🎫 Ticket B-003: SaaS Limits Enforcement (Logic)
- [ ] Create a `PlanConfig` constant defining limits for each plan.
- [ ] Implement checks in `BrandService` before creation.
- [ ] Implement checks in `InvitationService` before sending invites.
- [ ] Update JWT Payload to include `plan` for fast frontend checks.

### 🎫 Ticket B-004: Password Reset API
- [ ] Connect existing `/forgot-password` logic to actual email sending.
- [ ] Secure `/reset-password` endpoint with token validation.
- [ ] Ensure reset tokens expire after 1 hour.

---

## 🎨 Frontend Tasks (Sales Dashboard)

### 🎫 Ticket F-001: Auth Completion (Forgot/Reset Password)
- [ ] Create `/auth/forgot-password` page (Email input).
- [ ] Create `/auth/reset-password` page (New password input + token handling).
- [ ] Add success/error toast notifications.

### 🎫 Ticket F-002: SaaS UI Awareness (Limits)
- [ ] Implement "Upgrade" banners when limits are reached.
- [ ] Disable "Add Brand" button if `plan === FREE` and 1 brand exists.
- [ ] Add a "Billing/Subscription" tab in Settings.

### 🎫 Ticket F-003: Global Refactoring
- [ ] Update `AuthContext` / `useAuth` hook to read the user's `plan` from the token.
- [ ] Add a visual indicator of the current plan in the Sidebar.

---

## 🚀 Future Roadmap (Phase 4)
- [ ] Stripe Integration (Checkout & Webhooks).
- [ ] Super Admin Dashboard (Stats, Health, Org Management).
- [ ] Activity Logs for Organizations.
