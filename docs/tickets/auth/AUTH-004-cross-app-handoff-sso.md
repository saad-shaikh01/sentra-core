# AUTH-004: Cross-App Handoff Code (SSO Between Sales, PM, HRMS)

## Overview
Implement a server-issued one-time handoff code so users logged into one app can seamlessly open another app without re-authenticating. Since each app is on a different origin (sales.sentracore.com, pm.sentracore.com), localStorage tokens cannot be shared — a short-lived server code solves this cleanly.

## Background / Context
Currently `use-auth.ts` in both dashboards does `window.location.href = ${app.baseUrl}/dashboard` after login. Because localStorage is origin-scoped, the target app has no tokens and redirects to login. Users must log in again for every app they want to use.

The correct approach: the current app asks the server for a one-time code, passes it in the redirect URL, and the target app exchanges it for a new session.

## Acceptance Criteria
- [ ] `POST /auth/handoff` issues a one-time code (30s TTL) stored in Redis
- [ ] `POST /auth/redeem-handoff` accepts the code, validates it, and returns a new token pair for the target app
- [ ] The code is single-use — second use returns 401
- [ ] Code expires after 30 seconds — expired code returns 401
- [ ] Frontend: app switcher component calls `/auth/handoff` then redirects with code in URL
- [ ] Target app: on mount, checks URL for `?handoff=<code>`, redeems it, stores tokens, removes code from URL
- [ ] Works for Sales → PM, PM → Sales, Sales → HRMS, PM → HRMS, and vice versa

## Technical Specification

### Backend: Handoff Issue Endpoint

```typescript
// POST /auth/handoff
// Body: { targetAppCode: "PM" | "SALES" | "HRMS" | "ADMIN" }
// Auth: requires valid access token

async issueHandoffCode(userId: string, orgId: string, targetAppCode: string): Promise<string> {
  // Verify user has access to target app (check UserAppAccess)
  const hasAccess = await this.prisma.userAppAccess.findFirst({
    where: { userId, organizationId: orgId, appCode: targetAppCode, isActive: true }
  });
  if (!hasAccess) throw new ForbiddenException('No access to target app');

  // Generate code
  const code = randomBytes(32).toString('hex'); // 64-char hex string
  const key = `handoff:${code}`;

  // Store in Redis with 30s TTL
  await this.redis.setex(key, 30, JSON.stringify({
    userId,
    organizationId: orgId,
    targetAppCode,
    issuedAt: Date.now()
  }));

  return code;
}
```

```typescript
// auth.controller.ts
@Post('handoff')
@UseGuards(JwtAuthGuard)
async issueHandoff(
  @Body() body: { targetAppCode: string },
  @Req() req: Request
) {
  const code = await this.authService.issueHandoffCode(req.user.sub, req.user.organizationId, body.targetAppCode);
  return { data: { code } };
}
```

### Backend: Handoff Redeem Endpoint

```typescript
// POST /auth/redeem-handoff
// Body: { code: string }
// Auth: none required

async redeemHandoffCode(code: string, deviceInfo: object, ip: string) {
  const key = `handoff:${code}`;
  const raw = await this.redis.get(key);

  if (!raw) throw new UnauthorizedException('Invalid or expired handoff code');

  // Delete immediately — single use
  await this.redis.del(key);

  const { userId, organizationId, targetAppCode } = JSON.parse(raw);

  // Load user
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User not active');

  // Issue full token pair for the target app
  return this.authService.issueTokenPair(userId, organizationId, targetAppCode, deviceInfo, ip, randomUUID());
}
```

```typescript
@Post('redeem-handoff')
async redeemHandoff(
  @Body() body: { code: string },
  @Req() req: Request
) {
  const deviceInfo = parseDeviceInfo(req.headers['user-agent'] || '');
  const ip = req.ip;
  const tokens = await this.authService.redeemHandoffCode(body.code, deviceInfo, ip);
  return { data: tokens };
}
```

### Frontend: App Switcher Component

```typescript
// apps/frontend/sales-dashboard/src/components/app-switcher.tsx

const APP_URLS: Record<string, string> = {
  PM: process.env.NEXT_PUBLIC_PM_APP_URL!,       // "https://pm.sentracore.com"
  HRMS: process.env.NEXT_PUBLIC_HRMS_APP_URL!,   // "https://hrms.sentracore.com"
};

export function AppSwitcher() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSwitch(targetAppCode: string) {
    setLoading(targetAppCode);
    try {
      const res = await api.post('/auth/handoff', { targetAppCode });
      const code = res.data.data.code;
      const targetUrl = APP_URLS[targetAppCode];
      // Redirect with code — target app will redeem it
      window.location.href = `${targetUrl}/auth/handoff?code=${code}`;
    } catch (err) {
      toast.error('Failed to switch app. Please log in again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Switch App</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleSwitch('PM')} disabled={!!loading}>
          {loading === 'PM' ? 'Opening...' : 'Project Manager'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSwitch('HRMS')} disabled={!!loading}>
          {loading === 'HRMS' ? 'Opening...' : 'HRMS'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Frontend: Handoff Receiver (Target App)

```typescript
// apps/frontend/pm-dashboard/src/app/auth/handoff/page.tsx

'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setTokens } from '@/lib/tokens';
import axios from 'axios';

export default function HandoffPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const code = params.get('code');
    if (!code) {
      router.replace('/auth/login');
      return;
    }

    axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/redeem-handoff`, { code })
      .then((res) => {
        const { accessToken, refreshToken } = res.data.data;
        setTokens(accessToken, refreshToken);
        router.replace('/dashboard'); // redirect to app home
      })
      .catch(() => {
        router.replace('/auth/login?reason=handoff_failed');
      });
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">Opening dashboard...</p>
    </div>
  );
}
```

### App Selection Screen After Login
When a user logs in and has access to multiple apps, show an app picker before redirecting:

```typescript
// After successful login, check apps count
const userApps = await api.get('/auth/my-apps'); // returns list of apps user has access to

if (userApps.length === 1) {
  // Direct redirect
  window.location.href = APP_URLS[userApps[0].appCode];
} else {
  // Show app selection screen
  router.push('/auth/select-app');
}
```

```typescript
// apps/frontend/sales-dashboard/src/app/auth/select-app/page.tsx
// Shows cards for each accessible app with name, icon, and description
// Clicking a card calls handleSwitch() from AppSwitcher logic
// Cards: Sales Dashboard, PM Dashboard, HRMS (if access exists)
```

## Environment Variables Required
```env
# sales-dashboard
NEXT_PUBLIC_PM_APP_URL=https://pm.sentracore.com
NEXT_PUBLIC_HRMS_APP_URL=https://hrms.sentracore.com

# pm-dashboard
NEXT_PUBLIC_SALES_APP_URL=https://sales.sentracore.com
NEXT_PUBLIC_HRMS_APP_URL=https://hrms.sentracore.com
```

## Testing Requirements

### Unit Tests
- `issueHandoffCode()` stores code in Redis with correct TTL
- `issueHandoffCode()` throws ForbiddenException if user has no access to target app
- `redeemHandoffCode()` deletes Redis key after first use
- `redeemHandoffCode()` throws if key not found (expired or already used)
- `redeemHandoffCode()` throws if user status is not ACTIVE

### Integration Tests
- Issue code → redeem code → get valid tokens
- Redeem same code twice → second call returns 401
- Issue code, wait 31 seconds → redeem → returns 401
- User with no access to PM tries handoff to PM → ForbiddenException

### Frontend Tests
- AppSwitcher shows spinner on click and disabled state for other buttons
- On network error, shows toast (not redirect to login)
- HandoffPage redirects to /auth/login if no `code` param in URL
- HandoffPage redirects to /dashboard on successful redeem

### Edge Cases
- Code must be unguessable (32 random bytes minimum)
- Code in URL must NOT be added to browser history — use `router.replace`, not `router.push`
- If user is suspended between issue and redeem → redeemHandoffCode should catch suspended status
