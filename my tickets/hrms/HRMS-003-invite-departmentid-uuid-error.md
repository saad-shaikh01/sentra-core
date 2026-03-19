# HRMS-003 — Invite Member Fails with "departmentId must be UUID"

## Problem

When sending an invitation from the **Invitations** page, the backend returns
a validation error: `departmentId must be UUID`.

## Root Cause

The `InvitationsPage` fetches departments via `hrmsApi.get('/departments')` and
passes the result as `departments` prop to `CreateEmployeeModal`. The departments
query has `staleTime: 5min` and **no loading guard** — the modal renders and
becomes interactive immediately, even if departments are still loading.

The `CreateEmployeeModal` Department Select starts with `value={null ?? 'none'}`.
If the user opens the modal, quickly selects a department option before the
`departments` prop is fully populated, or if the departments array is partially
loaded with stale/malformed data, the `departmentId` may be set to a non-UUID
string that passes the `|| undefined` guard (non-empty string is truthy).

Specific scenario: if the invitations page renders with stale departments from a
previous session that had different data, `department.id` could be a stale UUID
that no longer exists — but this still passes format validation. More likely:
the **Select value binding** in a React re-render cycle sets `departmentId` to
`'none'` literally (via Radix Select internal state reconciliation), and
`'none' || undefined = 'none'` is sent to the backend.

## Files to Change

| File | Change |
|------|--------|
| `apps/frontend/hrms-dashboard/src/app/dashboard/invitations/page.tsx` | Pass `isLoadingDepartments` to button |
| `apps/frontend/hrms-dashboard/src/app/dashboard/invitations/_components/invite-member-button.tsx` | Forward loading prop |
| `apps/frontend/hrms-dashboard/src/app/dashboard/employees/_components/create-employee-modal.tsx` | Disable dept Select while loading; sanitize payload |

## Implementation

### 1. Sanitize payload in `CreateEmployeeModal` before submit

The payload construction must explicitly guard against non-UUID departmentId:

```ts
const isValidUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

// In mutationFn:
departmentId: isValidUuid(form.departmentId) ? form.departmentId : undefined,
```

This is the minimal fix — covers all edge cases regardless of Select state.

### 2. Show loading state in the Department Select

Pass `isLoadingDepartments` from the page through to the modal and disable the
Select while loading:

```tsx
// InvitationsPage
<InviteMemberButton
  departments={departmentsQuery.data ?? []}
  isLoadingDepartments={departmentsQuery.isLoading}
  onSuccess={() => invitationsQuery.refetch()}
/>
```

```tsx
// CreateEmployeeModal — add isLoadingDepartments prop, default false
<Select
  ...
  disabled={isLoadingDepartments}
>
  <SelectValue placeholder={isLoadingDepartments ? 'Loading departments...' : 'Select a department'} />
```

## Acceptance Criteria

- [ ] Creating an employee with no department selected sends no `departmentId` field.
- [ ] Creating an employee with a valid department selected sends the UUID correctly.
- [ ] Department Select shows "Loading departments..." while query is in flight.
- [ ] `npx tsc --noEmit` passes.
