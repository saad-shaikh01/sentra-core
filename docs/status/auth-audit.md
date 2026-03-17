Technical Audit Report

Status Summary
What works: password-based login/signup, invitation acceptance, password reset, client-portal OTP verification, short-lived access JWTs plus refresh JWTs, global auth guards in core-service, and a partially implemented app-level IAM model.

What’s broken or high-risk: session handling is not multi-session safe, refresh rotation is race-prone, both dashboards store tokens in localStorage, cross-app redirects do not carry auth across origins, and RBAC is split between legacy hardcoded enum roles and a newer database model that is only partially enforced.

What’s missing: MFA, user email verification, account lockout/failed-login tracking, session/device registry, refresh-token reuse detection, cookie hardening, and a general permission/scopes guard.

Finding	Evidence
Access token is 15 min; refresh token is 7 days	auth.service.ts (line 339) shows expiresIn: 900 and expiresIn: 604800. Same default access TTL is also in auth.module.ts (line 15).
Refresh tokens are rotated, but only one refresh token is stored per user	auth.service.ts (line 288) compares the incoming refresh token, then immediately issues a new pair and overwrites storage via updateRefreshToken(). The schema stores only one nullable refreshToken on the user row in schema.prisma (line 561).
Logout from one session/device invalidates all others	auth.service.ts (line 311) sets data: { refreshToken: null } on the user record. With a single stored token, logout is account-wide rather than session-scoped.
Browser auth is bearer-token + localStorage, not cookies	jwt.strategy.ts (line 10) and jwt-refresh.strategy.ts (line 11) both extract tokens only from Authorization headers. The dashboards persist both tokens in localStorage in sales api.ts (line 55) and pm api.ts (line 169). I did not find auth cookie setters in the audited auth paths.
Any refresh failure clears client auth state	sales api.ts (line 77) and pm api.ts (line 191) call clearTokens() on any non-OK refresh response. Protected routes then redirect to login in sales protected-route.tsx (line 12) and pm protected-route.tsx (line 14).
Cross-app auth handoff is broken across origins	After login, the frontend stores tokens locally, then may redirect with window.location.href = \${single.baseUrl}/dashboard`in [sales use-auth.ts](/mnt/d/Repositories/new%20crm/sentra-core/apps/frontend/sales-dashboard/src/hooks/use-auth.ts#L18) and [pm use-auth.ts](/mnt/d/Repositories/new%20crm/sentra-core/apps/frontend/pm-dashboard/src/hooks/use-auth.ts#L18). BecauselocalStorage` is origin-scoped, the target app will not receive those tokens.
Core RBAC is mostly legacy/hardcoded	Controllers are protected globally by app.module.ts (line 80). Role checks in roles.guard.ts (line 26) use user.role from the JWT plus a static hierarchy. Organization role updates directly mutate user.role in organization.service.ts (line 37).
A dynamic IAM model exists, but enforcement is partial	The schema has AppRegistry, PermissionCatalog, AppRole, UserAppAccess, UserAppRole, and UserScopeGrant in schema.prisma (line 641). IAM permission checks in iam.service.ts (line 206) are mainly used for invitation and entitlement management, not general request authorization.
App-access enforcement is weak/backward-compatible	app-access.guard.ts (line 29) explicitly allows access when appCodes are empty: allow through for backward compat.
PM access is also hardcoded, not driven by DB app roles	pm-role.guard.ts (line 9) allows only a fixed set of legacy roles / PM role strings. The dev middleware in jwt-context.middleware.ts (line 29) looks for pmRole, but core JWT issuance does not add one. The PM frontend also hardcodes role mapping in use-dashboard.ts (line 7).
User email verification, MFA, and lockout are absent	The User model in schema.prisma (line 561) has password/reset/refresh fields, but no emailVerified, MFA secret, failed-attempt counter, or lockout timestamp. Email verification exists only for clients in schema.prisma (line 925) and auth.controller.ts (line 51).
Redis/cache is not the auth session store	Auth refresh checks Postgres through Prisma in auth.service.ts (line 288). Prisma simply connects/disconnects in prisma.service.ts (line 5). Core Redis cache is generic in cache.module.ts (line 10) and is not used by the auth flow.
The “Logout” Root Cause
Primary hypothesis: users are being logged out because the system rotates refresh tokens on every refresh but stores only one refresh token per user account. That design breaks concurrent sessions across tabs, devices, and especially across your separate Sales/PM apps. If one session refreshes or logs in again, the older refresh token becomes invalid. On the next 401, the frontend calls clearTokens() and ProtectedRoute sends the user back to /auth/login.

Secondary contributor: refresh is not single-flight on the client. API requests and socket reconnects can independently call /auth/refresh using the same old refresh token. One wins and rotates the token; the loser gets 401 and clears auth. That makes logouts feel random around the 15-minute access-token boundary.

Not the likely cause from code: cookie expiry. Cookies are not being used for auth here. Redis misses are also unlikely to be the direct logout driver because auth state is stored on the user.refreshToken field in Postgres, not Redis. Secret churn is possible operationally, but I did not find runtime-generated JWT secrets; all services load them from shared env config.

Action Plan

Replace user.refreshToken with a Session/RefreshToken table keyed by jti so each device/app/tab family has its own hashed refresh token, expiry, revocation state, and metadata.
Keep rotation, but add token-family tracking and reuse detection. Do not overwrite the whole account’s refresh state on every refresh.
Add a client-side refresh mutex/single-flight layer so only one refresh request can run at a time per browser context. Make other failed requests await the same promise.
Stop clearing tokens on the first failed refresh unless you have confirmed no newer refresh already succeeded.
Move auth off localStorage to HttpOnly cookies or a BFF/session-cookie model. For cross-app SSO, use a shared parent-domain cookie or centralized auth domain with one-time code exchange.
Remove cross-origin window.location.href app switching until SSO exists, or pass through an explicit server-issued handoff code.
Unify RBAC around the DB-backed IAM model: add a permission guard, resolve UserAppRole and UserScopeGrant per request, and migrate controllers away from Roles(UserRole...) where app-level permissions should apply.
Add missing controls: user email verification, MFA, failed-login counters, lockout/backoff, hashed password-reset tokens, and audit events for login/refresh/logout/revocation.
Add regression tests for: multi-tab refresh race, login to Sales then PM then back to Sales, logout on one device not affecting another, and access revocation propagation.
This was a static code/config audit; I didn’t boot the services or reproduce the behavior live.