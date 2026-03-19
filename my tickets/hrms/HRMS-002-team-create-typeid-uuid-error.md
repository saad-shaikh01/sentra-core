# HRMS-002 — Team Create Fails with "typeId must be UUID"

## Problem

When creating a team via the "Create Team" modal, the backend returns a
validation error: `typeId must be UUID`.

## Root Cause

The `CreateEditTeamModal` loads team types via `teamTypesQuery` with
`enabled: open`. On the **first** modal open, the query fires but the Select
renders its items asynchronously. There is a timing window where:

1. Modal opens → `form.typeId = ''` (initial state)
2. Team types are still loading → Select has no items
3. User observes the modal as "ready" and clicks Create before selecting a type
   (button guard `!form.typeId` should block this, but does not if `form.typeId`
   was set to a non-UUID value somehow)

The second scenario: if an **edit target** is passed and `editTarget.type.id` is
somehow not a UUID (data integrity or mapping issue), the form starts with an
invalid `typeId`.

Additionally, the form currently has **no loading indicator** while team types
are being fetched, making the modal appear ready when it is not.

## Files to Change

| File | Change |
|------|--------|
| `apps/frontend/hrms-dashboard/src/app/dashboard/teams/_components/create-edit-team-modal.tsx` | Add loading state to Select; guard submit |

## Implementation

1. **Show loading state in the Type Select:**

```tsx
<Select
  value={form.typeId || undefined}
  onValueChange={(value) => setForm((current) => ({ ...current, typeId: value }))}
  disabled={teamTypesQuery.isLoading}
>
  <SelectTrigger>
    <SelectValue placeholder={teamTypesQuery.isLoading ? 'Loading types...' : 'Select team type'} />
  </SelectTrigger>
  ...
</Select>
```

2. **Guard the submit button against loading state:**

```tsx
disabled={
  !form.name.trim() ||
  !form.typeId ||
  teamTypesQuery.isLoading ||
  saveMutation.isPending
}
```

3. **Add explicit UUID format check before submitting** (last-resort guard):

```ts
mutationFn: () => {
  if (!form.typeId || !/^[0-9a-f-]{36}$/i.test(form.typeId)) {
    throw new Error('Please select a valid team type.');
  }
  const payload = { ... };
  ...
}
```

## Acceptance Criteria

- [ ] Opening modal immediately and clicking Create is not possible while team types are loading.
- [ ] Selecting a team type and clicking Create succeeds.
- [ ] Editing an existing team pre-populates the type correctly.
- [ ] Error toast shows `"Please select a valid team type."` if somehow submitted with invalid typeId.
- [ ] `npx tsc --noEmit` passes.
