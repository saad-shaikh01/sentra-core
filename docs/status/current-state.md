# Current Implementation State

Last reviewed: February 28, 2026

This file is the authoritative implementation snapshot for the repository. It is based on the code currently in the repo, not on older status docs. Generated frontend output under `apps/frontend/sales-dashboard/.next` was not treated as source.

## 1. Concise system overview

Sentra Core is an Nx monorepo with:

- A real NestJS `core-service` backed by Prisma/PostgreSQL.
- Two backend starter apps (`api-gateway`, `comm-service`) that are not yet doing product work.
- One active internal Next.js app (`sales-dashboard`).
- One external Next.js starter app (`client-portal`).
- Shared Prisma and TypeScript type libraries, plus lightweight mail and Mongoose helpers.

The root `package.json` has no convenience scripts; execution is driven by Nx targets and Prisma commands.

## 2. What is confirmed implemented today

- `apps/backend/core-service` boots with global validation, CORS, global `/api` prefix, Prisma access, cache support, and global throttling.
- Auth flows in `core-service` are implemented for signup, login, logout, invitation acceptance, forgot-password token issuance, and password reset handling.
- Organization/user management is implemented for `GET/PATCH /users/me`, member listing, role changes, member soft-removal, invitation creation/listing/canceling, and invitation linking.
- CRUD-style backend modules are implemented for brands, leads, clients, sales, and invoices.
- Lead workflows include assignment, status transitions, note logging, activity history, and lead-to-client conversion.
- Invoice PDF generation is implemented with `pdfkit`.
- Prisma schema, migrations, and a non-trivial seed script exist for organizations, users, brands, leads, clients, sales, invoices, and payment transactions.
- `apps/frontend/sales-dashboard` has implemented auth screens, a protected dashboard shell, CRUD screens for brands/leads/clients/sales/invoices, and profile/team settings pages.
- The sales dashboard uses a real API client plus React Query hooks for the implemented backend routes.
- Docker Compose defines local PostgreSQL, MongoDB, Redis, and RabbitMQ containers.

## 3. What is partially implemented

- Token refresh exists in both frontend and backend code, but the current backend guard setup likely blocks the refresh endpoint from working with a refresh token alone.
- Forgot-password and reset-password flows exist end-to-end in concept, but the frontend reset request payload does not match the backend DTO, so the flow is not reliably usable as written.
- Payment operations are only partially usable: charge, invoice pay, subscription create/cancel, and webhook handlers exist, but there is no code path that provisions or stores Authorize.net customer/payment profiles for new sales.
- The sales dashboard landing page exists, but its KPI cards are hardcoded placeholders rather than being backed by analytics endpoints.
- Role hierarchy and organization-level RBAC are implemented, but brand-level access control is only represented in schema/seed data and is not enforced in request handling.
- SMTP email sending is implemented for welcome, invitation, and password reset templates, but the separate communication service is not handling broader email/sync workflows.
- Tests exist, but coverage is concentrated in boilerplate smoke tests and one frontend happy-path suite rather than business-module coverage.

## 4. What is scaffolded but not operational

- `apps/backend/api-gateway` is still the default Nest starter app returning `Hello API`.
- `apps/backend/comm-service` is still the default Nest starter app returning `Hello API`.
- `apps/frontend/client-portal` is still the default Nx/Next starter page plus a trivial `api/hello` route.
- `libs/backend/mongoose-client` is an empty Nest module and is not wired into a running service.
- Several Prisma schema areas are schema-only today: `UserEmailConfig`, `EmailAlias`, `OutboxEvent`, and runtime `BrandAccess` management.
- `apps/backend/core-service/src/modules/invoices/dto/pay-invoice.dto.ts` is explicitly a placeholder.

## 5. What is missing entirely

- API gateway routing/proxy logic, centralized gateway auth, and service fan-out.
- Communication service product logic such as email sync, queued jobs, notifications, or Mongo-backed domain models.
- Any real client-portal product flow (client auth, invoice access, downloads, account views, etc.).
- Payment profile onboarding/tokenization endpoints and UI needed to make the existing Authorize.net charge/subscription paths operational for normal users.
- Analytics endpoints to support dashboard metrics.
- Dedicated project-management modules; current PM-related implementation is limited to the `PROJECT_MANAGER` role and route permissions.
- Meaningful automated tests for core business modules and integration paths.

## 6. Key risks / inconsistencies found

- `apps/frontend/sales-dashboard/src/lib/api.ts` defaults to `https://localhost:3001/api`, while `core-service` serves plain HTTP by default.
- `apps/frontend/sales-dashboard/src/app/auth/reset-password/page.tsx` sends `{ token, password }`, while the backend expects `{ token, newPassword }`.
- `apps/frontend/sales-dashboard/src/app/auth/forgot-password/page.tsx` imports `sonner`, but `sonner` is not declared in `package.json`.
- The frontend cancel-subscription call uses `DELETE /sales/:id/subscription`, while the backend exposes `POST /sales/:id/cancel-subscription`.
- Some React Query mutations replace detail-cache entries with partial mutation responses, which can leave open detail views with invalid shapes.
- Tenant-boundary validation is incomplete for some create flows, especially around foreign keys such as `brandId` and `assignedToId`.
- `apps/frontend/sales-dashboard/playwright.config.ts` hardcodes `/workspaces/sentra-core` as the web-server cwd; that needs verification outside a Linux/Codespaces-style environment.
- Older status docs currently overstate the maturity of the gateway, communication service, and client portal.

## 7. Recommended next engineering priorities

- Restore auth/session reliability first: fix refresh handling, unify frontend API base URL defaults, and align password reset request contracts.
- Make payments actually operable: add payment-profile setup, then align the subscription cancel endpoint and frontend cache handling.
- Close tenant-safety gaps by validating all cross-entity foreign keys against the caller's organization.
- Replace placeholder dashboard metrics with real analytics endpoints and queries.
- Decide whether `api-gateway`, `comm-service`, and `client-portal` are active scope now; either implement them or keep them explicitly dormant in planning.
