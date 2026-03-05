# PM Feature Ticket: Engagements (Frontend Completion)

## Meta
- Feature ID: `PM-FEAT-003`
- Scope: `Frontend only (pm-dashboard)`
- Target: `Engagements UI backend-contract parity = 100%`
- Depends On: `pm-service engagements endpoints already available`

## Completion Definition (100%)
Frontend must cover all current backend engagement capabilities:
- create engagement
- list engagements (with backend-supported filters)
- engagement detail
- update engagement
- archive engagement

No dead buttons, no fake columns, no unsupported filters text.

## Backend Contract (Reference)
- `POST /api/pm/engagements`
- `GET /api/pm/engagements`
- `GET /api/pm/engagements/:id`
- `PATCH /api/pm/engagements/:id`
- `POST /api/pm/engagements/:id/archive`

Filter DTO (supported):
- `status`
- `ownerType`
- `clientId`
- `ownerBrandId`
- `priority`
- pagination (`page`, `limit`)

## Verified Current Frontend Gaps
1. Engagements page par create disabled hai.
2. Detail view button disabled hai.
3. Filter bar backend-support ke against incorrect message show karta hai.
4. Table mapping backend fields se mismatch:
   - uses `engagementType` instead of `ownerType`
   - brand mapping uses `brandId` instead of `ownerBrandId/primaryBrandId`
   - fake `startDate/endDate` columns show ho rahi hain (backend me nahi)
5. Archive/update flows engagements module me exposed nahi.

## Tickets

### ENG-FE-P0-01 - Data Contract Alignment
Severity: `P0`

Scope:
- Table data mapping backend payload ke mutabiq fix karo:
  - `ownerType` render karo (not `engagementType`)
  - brand resolution `ownerBrandId` / `primaryBrandId` se karo
  - fake date fields remove karo, real metadata (`createdAt`/`updatedAt`) use karo

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/_components/engagements-table.tsx`

Acceptance:
- Console/runtime mapping errors zero.
- Table columns backend schema-consistent.

---

### ENG-FE-P0-02 - Real Filter Bar Wiring
Severity: `P0`

Scope:
- Filter bar me real controls add karo:
  - `status`, `ownerType`, `clientId`, `ownerBrandId`, `priority`
- Query params ko URL state (`nuqs`) + API query params se sync karo.
- Unsupported message remove karo.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/page.tsx`

Acceptance:
- Har filter backend endpoint par correctly pass ho.
- Pagination + filter coexist correctly.

---

### ENG-FE-P0-03 - Engagement Detail Page
Severity: `P0`

Scope:
- New route: `/dashboard/engagements/[id]`
- Detail fetch with `GET /engagements/:id`
- Show core metadata + projects count
- Add navigation from list row / eye action

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/[id]/page.tsx` (new)
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/_components/engagements-table.tsx`

Acceptance:
- Detail page opens from list and loads engagement data.
- Missing/invalid id case handled with proper error state.

---

### ENG-FE-P0-04 - Update + Archive Actions
Severity: `P0`

Scope:
- Engagement edit modal/drawer implement karo (name, description, priority, status, primaryBrandId).
- Archive action add karo with confirmation modal (`POST /engagements/:id/archive`).
- Cache invalidation for list + detail.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/_components/engagement-form-modal.tsx` (new)
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/[id]/page.tsx`
- `apps/frontend/pm-dashboard/src/stores/ui-store.ts` (if confirm config update needed)

Acceptance:
- Update reflects immediately in list/detail.
- Archive changes status to `CANCELLED` and user gets clear feedback.

---

### ENG-FE-P1-01 - Create Engagement Flow in PM Dashboard
Severity: `P1`

Scope:
- `New Engagement` button enable karo.
- Create form for backend DTO:
  - `ownerType` (required)
  - conditional `clientId` if `CLIENT`
  - conditional `ownerBrandId` if `INTERNAL_BRAND`
  - optional `primaryBrandId`
  - `name`, `description`, `priority`
- Client-side conditional validation backend rules ke mutabiq.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/_components/engagement-form-modal.tsx`

Acceptance:
- Valid forms create engagement successfully.
- Invalid ownerType/client/brand combos submit se pehle blocked.

---

### ENG-FE-P1-02 - Project Linkage UX in Engagement Detail
Severity: `P1`

Scope:
- Detail page par engagement-se-linked projects section add karo.
- Use `GET /projects?engagementId=:id` for linked project list.
- Row click to project detail.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/[id]/page.tsx`
- `apps/frontend/pm-dashboard/src/lib/api.ts` (helper method optional)

Acceptance:
- Detail page se related projects visible and navigable.

---

### ENG-FE-P1-03 - UX Hardening (Loading/Empty/Error)
Severity: `P1`

Scope:
- Engagement list + detail me consistent loading skeletons, empty states, error callouts.
- Mutation error messages actionable banao.

Files:
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/page.tsx`
- `apps/frontend/pm-dashboard/src/app/dashboard/engagements/[id]/page.tsx`
- shared UI components (if needed)

Acceptance:
- No blank or silent failure states in engagements flow.

---

### ENG-FE-P2-01 - Query/Mutation Ergonomics
Severity: `P2`

Scope:
- `use-pm-data` me dedicated hooks add karo:
  - `useEngagement(id)`
  - `useCreateEngagement()`
  - `useUpdateEngagement()`
  - `useArchiveEngagement()`
- unify query keys to avoid stale UI.

Files:
- `apps/frontend/pm-dashboard/src/hooks/use-pm-data.ts`
- `apps/frontend/pm-dashboard/src/lib/api.ts`

Acceptance:
- Engagement pages ad-hoc mutations se shared typed hooks par migrate hon.

## Test Plan
1. List page load + pagination.
2. Filters apply/reset + URL sync.
3. Create engagement for both owner types (`CLIENT`, `INTERNAL_BRAND`).
4. Open detail page from list.
5. Edit engagement and verify list/detail refresh.
6. Archive engagement with confirmation and verify status update.
7. Linked projects block in detail (`projects?engagementId=`) works.
8. Loading/empty/error states visually verify under throttled network + forced API failure.

## Definition of Done
- Engagement frontend flows backend endpoints ke against complete.
- No disabled/dead engagements CTAs.
- All table/form fields backend contract aligned.
- Build/lint pass for pm-dashboard touched code.
