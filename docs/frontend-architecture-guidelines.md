# Frontend Architecture Guidelines

Status: Working guidance
Purpose: Define how frontend should evolve across multiple apps without duplicating core UI or hurting performance.

## Current State

Today, reusable UI is mostly living inside:

- `apps/frontend/sales-dashboard/src/components/ui`
- `apps/frontend/sales-dashboard/src/components/shared`

The `client-portal` app is still a starter shell and is not reusing that component set yet.

This means the design system is real, but it is app-local, not platform-shared.

## Recommendation

Yes, shared UI components should be introduced.

But do it in layers.

### Shared Across Apps

Move stable primitives into a shared frontend library.

Good candidates:

- button
- input
- label
- badge
- card
- dialog
- toast
- avatar
- pagination primitive
- table shell primitive
- empty state
- loading skeletons

Recommended target:

- `libs/frontend/ui`

Optional second layer:

- `libs/frontend/data-display`

for table, pagination, empty state, and list shell primitives.

### Keep App-Specific

Do not over-centralize app-specific workflow components.

Keep these local to each app:

- sales-specific CRUD modals
- PM board lanes
- client approval widgets
- module navigation shells
- role-specific workflow panels

## Theme Strategy

Keep one shared design token layer, but allow brand-aware overrides.

Recommended approach:

- shared tokens for spacing, radius, typography, elevations, motion
- one platform design system for internal apps
- brand theme overrides for client portal branding only

This keeps:

- internal app consistent
- client portals brand-aware without rebuilding the UI system for each brand

## Pagination and Data Loading

Large data screens must use server-side pagination.

Required patterns:

- server-side pagination for project lists, task lists, leads, clients, invoices, and review queues
- do not fetch entire datasets just to paginate in the browser
- use filter params in query keys
- keep list responses summary-only

## Code Splitting

Required patterns:

- route-level code splitting for major modules
- lazy-load heavy drawers, editors, and detail sheets
- avoid bundling PM, sales, and portal heavy screens together

In practice:

- keep page entry points small
- lazy-load boards, file managers, thread panes, and large forms

## UX Performance Rules

- show skeletons instead of blank flashes
- keep user actions near the current context
- load detail panels on demand
- avoid forcing deep click paths for every role
- use optimistic updates carefully only where response shapes are stable

## Practical Build Direction

Short-term:

- keep using the current `sales-dashboard` components as the design source
- extract stable primitives into shared libs
- migrate both `sales-dashboard` and `client-portal` to the shared primitives

Mid-term:

- add PM-specific composite components inside the PM app/module
- keep shared UI narrow and stable

## Performance Requirements for Frontend Tickets

Every frontend ticket should consider:

- server-side pagination
- code splitting
- loading states
- error states
- query invalidation strategy
- avoiding oversized payload assumptions

Use:

- `docs/pm-service/frontend-ticket-pack.md`

as the frontend implementation ticket baseline for the PM module.
