# SentraCore - Roadmap & Task List

This document tracks all completed and upcoming work across backend, frontend, and infrastructure.

---

## ✅ Completed

### 🎫 B-001: Email Infrastructure
- [x] Configured `Nodemailer` with Gmail SMTP.
- [x] Created email templates: Welcome, Password Reset, Invitation.
- [x] Integrated with Auth & Invitation modules in CoreService.

### 🎫 B-002 / B-003: Auth, RBAC & Organization
- [x] JWT Auth (access + refresh tokens), 6-role RBAC hierarchy.
- [x] Forgot / Reset Password flow (token-based, 1hr expiry).
- [x] Organization member management (invite, role change, remove).
- [x] Global `AccessTokenGuard` + `RolesGuard`.

### 🎫 B-004: CRUD Modules (Brands, Leads, Clients, Sales, Invoices)
- [x] Full CRUD with org-scoped access for all 5 entities.
- [x] Lead status transitions + activity tracking + conversion to Client.
- [x] Authorize.Net payment integration (charge, subscribe, cancel).
- [x] Invoice PDF generation.
- [x] Webhook handler with HMAC-SHA512 signature verification.

### 🎫 B-005: Redis Caching + Rate Limiting ✅ (February 20, 2026)
- [x] `SentraCacheModule` — global Redis-backed cache (`cache-manager-redis-yet`), in-memory fallback.
- [x] `CacheService` — `get`, `set`, `del`, `delByPrefix` (Redis SCAN pattern invalidation), `hashQuery`.
- [x] `findAll` + `findOne` cached across all 5 CRUD services.
- [x] Smart invalidation on every write (`delByPrefix('{entity}:{orgId}:')`).
- [x] `ThrottlerGuard` registered globally — 100 req / 60s default.
- [x] Tighter limits: auth endpoints (5/min), payment endpoints (10/min).
- [x] `@SkipThrottle()` on Authorize.Net webhook controller.
- [x] New env vars: `REDIS_URL`, `CACHE_TTL`, `THROTTLE_TTL`, `THROTTLE_LIMIT`.

### 🎫 UI-001 / UI-002 / UI-003: Premium Design System
- [x] Glassmorphism design system (Zinc/Slate + Indigo/Violet palette).
- [x] Premium Button, Input, GlassCard components.
- [x] Framer Motion page transitions.
- [x] Collapsible sidebar + Glass topbar + CMD+K command palette.

### 🎫 F-001: Auth Frontend
- [x] Login, Signup, Forgot Password, Reset Password, Accept Invite pages.
- [x] TanStack Query v5 state management, Zustand for auth token.
- [x] E2E tests: 5/5 passing (Playwright).

---

## 🔜 Up Next

### 🎫 B-006: Frontend CRUD Modules (Sales Dashboard UI)

The backend CRUD APIs (Brands, Leads, Clients, Sales, Invoices) are fully built. The frontend has zero pages for these — this is the biggest gap.

**Priority: HIGH**

- [ ] **Brands** — List, create, edit, delete pages with React Query hooks.
- [ ] **Leads** — Pipeline view (Kanban or table), status change UI, assign, add note, convert to client flow.
- [ ] **Clients** — Client list, detail page (with sales summary), edit.
- [ ] **Sales** — Sales list, detail with transactions, charge/subscribe actions.
- [ ] **Invoices** — Invoice list, detail, PDF download button, pay action.

Suggested hook file locations:
```
src/hooks/use-brands.ts
src/hooks/use-leads.ts
src/hooks/use-clients.ts
src/hooks/use-sales.ts
src/hooks/use-invoices.ts
```

---

### 🎫 B-007: SaaS Plans & Limits

- [ ] Add `planType` enum (FREE, PRO, ENTERPRISE) to `Organization` schema.
- [ ] Create `PlanConfig` constants (max brands, max members per plan).
- [ ] Enforce limits in `BrandsService` and `InvitationService` before creation.
- [ ] Include `plan` in JWT payload for fast frontend checks.
- [ ] Prisma migration.

---

### 🎫 B-008: Dashboard Analytics Endpoints

- [ ] `GET /api/dashboard/summary` — aggregated counts (leads, clients, revenue, open invoices).
- [ ] `GET /api/dashboard/revenue-chart` — monthly revenue by brand (for chart rendering).
- [ ] Wire frontend dashboard home page to these endpoints.

---

### 🎫 B-009: Comm Service (Email Sync)

- [ ] Implement CommService logic for Gmail OAuth sync.
- [ ] Store emails in MongoDB via Mongoose.
- [ ] Implement `OutboxEvent` pattern for reliable event-driven emails.

---

## 🚀 Future Roadmap (Phase 4+)

- [ ] Stripe Integration (Checkout & Webhooks) — replace/complement Authorize.Net with plan billing.
- [ ] Super Admin Dashboard (platform-wide stats, org management, health checks).
- [ ] Activity Logs per Organization.
- [ ] Background Jobs — BullMQ on Redis (subscription renewals, invoice reminders).
- [ ] Client Portal frontend (`apps/frontend/client-portal`) — client login, invoice view, payment.
