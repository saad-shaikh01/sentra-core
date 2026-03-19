# HRMS-005 — Suspend vs Deactivate: Clarification + Reactivate Flow

## Background: What's the Difference?

| | Suspend | Deactivate |
|---|---|---|
| **Meaning** | Temporary block — employee did something wrong, is on leave, or under investigation | Permanent — employee has left the company or account must be fully disabled |
| **Login blocked?** | Yes | Yes |
| **Sessions revoked?** | Yes (immediately) | Yes (immediately) |
| **Reversible?** | Yes — admin clicks "Unsuspend" | Intended to be permanent; no UI to reverse it today |
| **Status value** | `SUSPENDED` | `DEACTIVATED` (`isActive = false`) |
| **Backend endpoint** | `PATCH /employees/:id/suspend` + `PATCH /employees/:id/unsuspend` | `PATCH /employees/:id/deactivate` |
| **Use case** | Ongoing investigation, maternity leave, short-term block | Offboarding, terminated employee |

Both are already **fully implemented** in the backend and frontend. The buttons
are already visible on the employee detail page with correct permission guards
(`hrms:users:suspend` and `hrms:users:deactivate`).

## What Is Missing: Reactivate

There is no way to **reactivate** a deactivated employee. If an admin accidentally
deactivates someone, or an employee returns from extended leave, there is no path
to restore their account.

## Required Changes

### Backend — `apps/backend/hrms-service/src/modules/employees/employees.service.ts`

Add a `reactivate()` method:

```ts
async reactivate(userId: string, adminId: string, organizationId: string) {
  const user = await this.findEmployee(userId, organizationId);

  if (user.isActive) {
    throw new BadRequestException('User is already active');
  }

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      status: UserStatus.ACTIVE,
      deactivatedAt: null,
      deactivatedBy: null,
    },
  });

  return { message: 'User reactivated successfully' };
}
```

### Backend — `apps/backend/hrms-service/src/modules/employees/employees.controller.ts`

Add the endpoint:

```ts
@Patch(':id/reactivate')
@Permissions('hrms:users:deactivate')   // reuse same permission — admin-only
async reactivate(
  @Param('id') id: string,
  @OrgContext() context: { organizationId: string; userId: string },
) {
  return this.employeesService.reactivate(id, context.userId, context.organizationId);
}
```

### Frontend — `apps/frontend/hrms-dashboard/src/app/dashboard/employees/[id]/_components/employee-detail-header.tsx`

Add `reactivateMutation` and a **Reactivate** button that shows when
`employee.status === 'DEACTIVATED'`:

```ts
const reactivateMutation = useMutation({
  mutationFn: () => hrmsApi.patch(`/employees/${employee.id}/reactivate`),
  onSuccess: () => {
    toast.success(`${employee.fullName} has been reactivated.`);
    queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  },
  onError: (error) => {
    toast.error(error instanceof Error ? error.message : 'Failed to reactivate employee.');
  },
});
```

```tsx
{employee.status === 'DEACTIVATED' && hasPermission('hrms:users:deactivate') ? (
  <Button variant="outline" onClick={() => reactivateMutation.mutate()}>
    {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate'}
  </Button>
) : null}
```

> The Deactivate button already guards `employee.status !== 'DEACTIVATED'`, so
> Reactivate and Deactivate will never show at the same time.

## Acceptance Criteria

- [ ] Deactivated employee detail page shows "Reactivate" button.
- [ ] Clicking Reactivate restores `isActive = true` and `status = ACTIVE`.
- [ ] After reactivation, Deactivate button reappears, Reactivate disappears.
- [ ] Active/Suspended employees do NOT show Reactivate button.
- [ ] `npx tsc --noEmit` passes.
