# AUTH-FE-001: Login, Logout, and Auth Error Pages (Frontend)

## Overview
Polish the login/logout flow with proper error states, suspended account page, password reset flow, and a "my sessions" panel where users can see and revoke their own active sessions from within any dashboard.

## Acceptance Criteria

### Login Page
- [ ] Email + password login form with proper validation
- [ ] "Remember me" checkbox (extends session vs session-only cookie / no functional difference with JWT, but UX expectation)
- [ ] Forgot password link → `/auth/forgot-password`
- [ ] On success with 1 app: redirect directly to that app
- [ ] On success with 2+ apps: redirect to `/auth/select-app`
- [ ] Error states: "Invalid credentials" (generic, never say which field is wrong), "Account suspended", "Account deactivated"
- [ ] Loading state on submit button (spinner, disabled)
- [ ] Enter key submits form
- [ ] No password auto-fill issues (use `autoComplete="current-password"`)

### Forgot Password Page (`/auth/forgot-password`)
- [ ] Email input, submit sends reset link via core-service `POST /auth/forgot-password`
- [ ] Always show success message regardless of whether email exists (security: don't reveal if account exists)
- [ ] "Back to login" link

### Reset Password Page (`/auth/reset-password?token=xxx`)
- [ ] New password + confirm password fields
- [ ] Password strength indicator (weak/medium/strong)
- [ ] Minimum: 8 chars, at least 1 number (show requirements inline)
- [ ] On success: auto-login and redirect to select-app
- [ ] On invalid/expired token: clear error with "Request a new reset link" button

### Suspended Account Page (`/auth/suspended`)
- [ ] Shows: "Your account has been suspended."
- [ ] Shows: "Please contact your administrator to regain access."
- [ ] Shows organization admin contact if available (from JWT or local storage before clearTokens)
- [ ] "Log out" button (clears tokens)
- [ ] No back navigation — user cannot go back to app from here

### App Selection Page (`/auth/select-app`)
- [ ] Per AUTH-004 spec
- [ ] Each app card: icon, name, description, user's role(s)
- [ ] Keyboard navigable (tab + enter)
- [ ] Loading skeleton while fetching /auth/my-apps
- [ ] Empty state: "No apps assigned. Contact your administrator."

### My Sessions Panel (in user profile dropdown)
- [ ] Accessible from user avatar dropdown in any dashboard: "My Sessions"
- [ ] Opens a modal/sheet showing current user's active sessions
- [ ] Each session: device icon (desktop/mobile/tablet), browser, OS, last active, "This device" badge for current session
- [ ] "Sign out" button per session
- [ ] "Sign out all other devices" button at bottom
- [ ] Current session cannot be signed out from this panel (would be confusing UX)

## Technical Specification

### Login Form

```tsx
// apps/frontend/sales-dashboard/src/app/auth/login/page.tsx

'use client';
export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, form);
      const { accessToken, refreshToken } = res.data.data;
      setTokens(accessToken, refreshToken);

      // Fetch user's apps
      const appsRes = await api.get('/auth/my-apps');
      const apps = appsRes.data.data;

      if (apps.length === 0) {
        setError('No apps have been assigned to your account yet. Contact your administrator.');
        clearTokens();
        return;
      }

      if (apps.length === 1) {
        window.location.href = apps[0].appUrl + '/dashboard';
      } else {
        router.push('/auth/select-app');
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'ACCOUNT_SUSPENDED') {
        router.push('/auth/suspended');
      } else if (code === 'ACCOUNT_DEACTIVATED') {
        setError('This account has been deactivated. Contact your administrator.');
      } else {
        setError('Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <img src="/logo.svg" alt="Sentra" className="mx-auto h-8" />
          <h1 className="mt-4 text-xl font-semibold">Sign in to Sentra</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

### Password Strength Indicator

```tsx
// components/password-strength.tsx

function getStrength(password: string): { score: 0|1|2|3; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const map = [
    { score: 0, label: '', color: '' },
    { score: 1, label: 'Weak', color: 'bg-red-500' },
    { score: 2, label: 'Fair', color: 'bg-yellow-500' },
    { score: 3, label: 'Strong', color: 'bg-green-500' },
  ];
  return map[Math.min(score, 3)] as any;
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getStrength(password);
  return (
    <div className="mt-1 space-y-1">
      <div className="flex gap-1">
        {[1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= score ? color : 'bg-muted'}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
```

### My Sessions Modal

```tsx
// components/my-sessions-modal.tsx

export function MySessionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sessions, refetch } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: () => api.get('/auth/my-sessions').then(r => r.data.data),
    enabled: open,
  });

  async function revokeSession(sessionId: string) {
    await api.delete(`/auth/sessions/${sessionId}`);
    toast.success('Session signed out');
    refetch();
  }

  async function revokeOtherSessions() {
    await api.delete('/auth/sessions/others');
    toast.success('All other devices signed out');
    refetch();
  }

  const currentSessionId = getCurrentJti(); // decode from localStorage accessToken

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Active Sessions</DialogTitle>
          <DialogDescription>Manage where you're signed in</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {sessions?.map(session => (
            <div key={session.id} className="flex items-center gap-3 rounded-lg border p-3">
              <DeviceIcon type={session.deviceInfo?.deviceType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.deviceInfo?.browser} on {session.deviceInfo?.os}
                  {session.id === currentSessionId && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 rounded px-1">This device</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.appCode} · {session.lastUsedAt ? `Active ${formatDistanceToNow(new Date(session.lastUsedAt))} ago` : 'Just signed in'}
                </p>
              </div>
              {session.id !== currentSessionId && (
                <Button variant="ghost" size="sm" onClick={() => revokeSession(session.id)}>
                  Sign out
                </Button>
              )}
            </div>
          ))}
        </div>

        <Separator />
        <Button variant="outline" className="w-full" onClick={revokeOtherSessions}>
          Sign out all other devices
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

### Backend Endpoints Needed (add to auth.controller.ts)

```typescript
// GET /auth/my-sessions — current user's own sessions
@Get('my-sessions')
@UseGuards(JwtAuthGuard)
async getMySessions(@Req() req: Request) {
  return this.authService.getUserSessions(req.user.sub, req.user.organizationId, 'active');
}

// DELETE /auth/sessions/:id — revoke a specific session (own only)
@Delete('sessions/:id')
@UseGuards(JwtAuthGuard)
async revokeMySession(@Param('id') id: string, @Req() req: Request) {
  // validate session belongs to current user before revoking
  await this.authService.revokeOwnSession(id, req.user.sub);
  return { message: 'Session revoked' };
}

// DELETE /auth/sessions/others — revoke all except current
@Delete('sessions/others')
@UseGuards(JwtAuthGuard)
async revokeOtherSessions(@Req() req: Request) {
  await this.authService.revokeAllExcept(req.user.sub, req.user.jti);
  return { message: 'Other sessions revoked' };
}
```

## Testing Requirements

### Unit/Component Tests
- Login form shows generic error (not "wrong password" or "wrong email")
- Password strength indicator updates on each keypress
- Suspended error redirects to /auth/suspended (not shows inline error)
- My sessions modal shows "This device" badge on current session only
- Current session has no "Sign out" button

### Integration Tests
- Login → 1 app → direct redirect (no select-app page)
- Login → 2 apps → select-app page shown
- Forgot password → always shows success (even for non-existent email)
- Reset password with expired token → shows error with "request new link" CTA
- Revoke session from My Sessions → that session returns 401 on next API call

### Edge Cases
- Login while already logged in → redirect to dashboard (detect existing valid token on login page mount)
- Forgot password email input: invalid format → client validation before API call
- Reset password: passwords don't match → inline error before API call
- My Sessions: zero sessions (shouldn't happen but handle gracefully)
