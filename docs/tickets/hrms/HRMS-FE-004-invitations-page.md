# HRMS-FE-004: Invitations Page

## Overview
Dedicated invitations management page showing all pending invitations with ability to resend or cancel. Also includes the accept-invite public page (accessible without login) where invitees set their password.

## Acceptance Criteria

### Invitations List Page (`/dashboard/invitations`)
- [ ] Shows all pending (non-expired, non-accepted, non-cancelled) invitations
- [ ] Columns: Employee name, Email, Invited by, Sent at, Expires in, Actions
- [ ] "Expires in" shows relative time (e.g., "in 48 hours") with red color if <6 hours remaining
- [ ] Actions: Resend (re-sends email, resets 72h clock), Cancel (cancels invitation)
- [ ] "Invite Member" button — same create+invite flow as from employees list
- [ ] Empty state: "No pending invitations. Invite your team members to get started."
- [ ] Pagination

### Accept Invite Public Page (`/auth/accept-invite?token=xxx`)
- [ ] Publicly accessible (no auth required)
- [ ] Shows: "You've been invited to join [Org Name]"
- [ ] Form: Full name (pre-filled, read-only), email (pre-filled, read-only), new password + confirm password
- [ ] Password strength indicator
- [ ] Requirements shown: min 8 chars, at least 1 number
- [ ] Submit → POST /auth/accept-invite → on success → auto-login → select-app page
- [ ] Invalid/expired token → error page with "Contact your administrator to resend the invitation"
- [ ] Already-accepted token → "This invitation has already been used. Go to login."

## Technical Specification

### Invitations List

```tsx
// src/app/dashboard/invitations/page.tsx

export default function InvitationsPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pending-invitations'],
    queryFn: () => api.get('/api/hrms/invitations/pending').then(r => r.data),
    refetchInterval: 60_000, // refresh every minute (expiry countdowns)
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending Invitations"
        description={`${data?.meta.total || 0} pending`}
        actions={<InviteMemberButton onSuccess={refetch} />}
      />

      {isLoading ? (
        <InvitationsTableSkeleton />
      ) : data?.data.length === 0 ? (
        <InvitationsEmptyState />
      ) : (
        <InvitationsTable invitations={data.data} onAction={refetch} />
      )}
    </div>
  );
}
```

### Invitations Table

```tsx
const columns: ColumnDef<Invitation>[] = [
  {
    header: 'Employee',
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-sm">{row.original.name}</p>
        <p className="text-xs text-muted-foreground">{row.original.email}</p>
      </div>
    ),
  },
  {
    header: 'Invited',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(row.original.invitedAt))} ago
      </span>
    ),
  },
  {
    header: 'Expires',
    cell: ({ row }) => {
      const expiresAt = new Date(row.original.expiresAt);
      const hoursLeft = differenceInHours(expiresAt, new Date());
      const isUrgent = hoursLeft < 6;
      return (
        <span className={cn('text-sm', isUrgent ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
          {isUrgent ? '⚠ ' : ''}{formatDistanceToNow(expiresAt, { addSuffix: true })}
        </span>
      );
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => resendInvite(row.original.userId)}>
          Resend
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => cancelInvite(row.original.userId)}
        >
          Cancel
        </Button>
      </div>
    ),
  },
];
```

### Resend + Cancel Actions

```typescript
async function resendInvite(userId: string) {
  try {
    await api.post(`/api/hrms/employees/${userId}/invite/resend`);
    toast.success('Invitation resent. New link expires in 72 hours.');
    refetch();
  } catch {
    toast.error('Failed to resend invitation. Please try again.');
  }
}

async function cancelInvite(userId: string) {
  const confirmed = await showConfirmDialog({
    title: 'Cancel invitation?',
    description: 'The invitation link will stop working immediately.',
    confirmLabel: 'Cancel Invitation',
    variant: 'destructive',
  });
  if (!confirmed) return;

  try {
    await api.delete(`/api/hrms/employees/${userId}/invite`);
    toast.success('Invitation cancelled.');
    refetch();
  } catch {
    toast.error('Failed to cancel invitation.');
  }
}
```

### Accept Invite Public Page

```tsx
// src/app/auth/accept-invite/page.tsx
// This page is PUBLIC — no auth guard

'use client';
export default function AcceptInvitePage() {
  const params = useSearchParams();
  const token = params.get('token');
  const router = useRouter();

  const [state, setState] = useState<'loading' | 'form' | 'invalid' | 'already-used'>('loading');
  const [inviteInfo, setInviteInfo] = useState<{ firstName: string; email: string; orgName: string } | null>(null);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    // Peek at invite info (GET /auth/invite-info?token=xxx — returns name/org without consuming token)
    api.get(`/auth/invite-info?token=${token}`)
      .then(r => { setInviteInfo(r.data.data); setState('form'); })
      .catch(err => {
        const code = err.response?.data?.code;
        setState(code === 'ALREADY_USED' ? 'already-used' : 'invalid');
      });
  }, [token]);

  function validate() {
    const errs: Record<string, string> = {};
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!/\d/.test(form.password)) errs.password = 'Password must contain at least 1 number';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/accept-invite`, {
        token,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      const { accessToken, refreshToken } = res.data.data;
      setTokens(accessToken, refreshToken);
      router.push('/auth/select-app');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') return <FullPageSpinner />;

  if (state === 'invalid') return (
    <AuthPageWrapper>
      <div className="text-center space-y-4">
        <XCircleIcon className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Invalid or Expired Invitation</h1>
        <p className="text-muted-foreground">This invitation link is no longer valid.</p>
        <p className="text-sm text-muted-foreground">Contact your administrator to resend the invitation.</p>
      </div>
    </AuthPageWrapper>
  );

  if (state === 'already-used') return (
    <AuthPageWrapper>
      <div className="text-center space-y-4">
        <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
        <h1 className="text-xl font-semibold">Already Accepted</h1>
        <p className="text-muted-foreground">This invitation has already been used.</p>
        <Button asChild><Link href="/auth/login">Go to Login</Link></Button>
      </div>
    </AuthPageWrapper>
  );

  return (
    <AuthPageWrapper>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold">Welcome to {inviteInfo?.orgName}</h1>
        <p className="text-muted-foreground mt-1">Set your password to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Read-only info */}
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Signing up as </span>
          <span className="font-medium">{inviteInfo?.email}</span>
        </div>

        {/* Password */}
        <div className="space-y-1">
          <Label>Password</Label>
          <Input
            type="password"
            value={form.password}
            onChange={e => setForm(p => ({...p, password: e.target.value}))}
            autoComplete="new-password"
          />
          <PasswordStrength password={form.password} />
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
            <li className={form.password.length >= 8 ? 'text-green-600' : ''}>✓ At least 8 characters</li>
            <li className={/\d/.test(form.password) ? 'text-green-600' : ''}>✓ At least 1 number</li>
          </ul>
        </div>

        {/* Confirm */}
        <div className="space-y-1">
          <Label>Confirm Password</Label>
          <Input
            type="password"
            value={form.confirmPassword}
            onChange={e => setForm(p => ({...p, confirmPassword: e.target.value}))}
            autoComplete="new-password"
          />
          {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Setting up account...' : 'Create Account'}
        </Button>
      </form>
    </AuthPageWrapper>
  );
}
```

### Backend Endpoint Needed: GET /auth/invite-info

```typescript
// GET /auth/invite-info?token=xxx
// Returns basic info to pre-fill the form — does NOT consume the token
// Returns 400 with code: "ALREADY_USED" if accepted, code: "INVALID" if not found/expired

async getInviteInfo(token: string) {
  const tokenHash = sha256(token);
  const invite = await this.prisma.userInvitation.findFirst({
    where: { tokenHash },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
    }
  });
  if (!invite) throw new BadRequestException({ code: 'INVALID', message: 'Invitation not found or expired' });
  if (invite.acceptedAt) throw new BadRequestException({ code: 'ALREADY_USED', message: 'Already accepted' });
  if (invite.cancelledAt || invite.expiresAt < new Date()) {
    throw new BadRequestException({ code: 'INVALID', message: 'Invitation expired or cancelled' });
  }

  const org = await this.prisma.organization.findUnique({ where: { id: invite.organizationId }, select: { name: true } });

  return {
    firstName: invite.user.firstName,
    email: invite.user.email,
    orgName: org?.name,
  };
}
```

## Testing Requirements

### Component Tests
- "Expires in" text is red when < 6 hours remaining
- Accept invite form "Create Account" button disabled during submission
- Password requirement checklist items turn green as conditions are met
- Accept invite form validates before calling API (client-side)

### Integration Tests
- Invitations list shows pending invites
- Resend invite → expiry time resets to 72 hours from now
- Cancel invite → removed from list
- Accept invite with valid token → redirected to select-app
- Accept invite with expired token → invalid state shown
- Accept invite twice → already-used state shown

### Edge Cases
- `/auth/accept-invite` without `?token=` → shows invalid state immediately
- Password exactly 8 chars with a number → valid (boundary test)
- Org name very long → truncate or wrap correctly in header
