# Ticket Execution Order

## Phase 1 — Auth Foundation (must be done first)

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 1 | AUTH-001: Session Table | BE | none — DB migration first |
| 2 | AUTH-002: Token Rotation + Reuse Detection | BE | AUTH-001 |
| 3 | AUTH-003: Client-Side Single-Flight Refresh | FE | AUTH-001 deployed |
| 4 | AUTH-006: User Suspend + Instant Effect | BE | AUTH-001 |
| 5 | AUTH-005: Admin Session Visibility | BE | AUTH-001 |
| 6 | AUTH-FE-001: Login / Logout / Sessions UI | FE | AUTH-001, AUTH-002 |
| 7 | AUTH-004: Cross-App Handoff SSO | BE+FE | AUTH-001, RBAC-002 |

**Migration command after AUTH-001:**
```bash
cd libs/backend/prisma-client
npx prisma migrate dev --name auth-session-table-remove-single-token
```

---

## Phase 2 — RBAC Model

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 8  | RBAC-001: Permission Catalog + App Roles + Seed | BE | AUTH-001 |
| 9  | RBAC-002: User App Access + Multi-Role | BE | RBAC-001 |
| 10 | RBAC-003: Permission Guard | BE | RBAC-001, RBAC-002 |

**Seed command after RBAC-001:**
```bash
npx ts-node prisma/seeds/permissions.seed.ts
npx ts-node prisma/seeds/roles.seed.ts
```

---

## Phase 3 — HRMS Backend

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 11 | HRMS-BE-001: Service Bootstrap | BE | none |
| 12 | HRMS-BE-002: Employees Module | BE | HRMS-BE-001, AUTH-006 |
| 13 | HRMS-BE-003: Invitations | BE | HRMS-BE-002 |
| 14 | HRMS-BE-004: App Access + Role Management | BE | HRMS-BE-001, RBAC-001, RBAC-002 |
| 15 | HRMS-BE-005: Teams + Departments | BE | HRMS-BE-001 |

---

## Phase 4 — HRMS Frontend

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 16 | HRMS-FE-001: Dashboard Bootstrap | FE | HRMS-BE-001 |
| 17 | HRMS-FE-002: Employees List Page | FE | HRMS-FE-001, HRMS-BE-002 |
| 18 | HRMS-FE-003: Employee Detail Page | FE | HRMS-FE-002, HRMS-BE-004, AUTH-005 |
| 19 | HRMS-FE-004: Invitations Page | FE | HRMS-FE-001, HRMS-BE-003 |
| 20 | HRMS-FE-005: Roles & Permissions Page | FE | HRMS-FE-001, RBAC-001, RBAC-003 |
| 21 | HRMS-FE-006: Teams & Departments Page | FE | HRMS-FE-001, HRMS-BE-005 |

---

## Phase 5 — Sales Teams

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 22 | SALES-TEAMS-001: Teams Backend | BE | HRMS-BE-005 |
| 23 | SALES-TEAMS-002: Teams Frontend | FE | SALES-TEAMS-001, HRMS-FE-001 (for TeamTypeBadge shared component) |

---

## Phase 6 — Infrastructure

| Order | Ticket | Type | Depends On |
|-------|--------|------|------------|
| 24 | INFRA-001: Wasabi + BunnyCDN per-org | BE | none (run in parallel with any phase) |

---

## Complete Ticket Index

### Auth (7 tickets)
| ID | Title | Type |
|----|-------|------|
| AUTH-001 | Session Table (DB migration) | BE |
| AUTH-002 | Token Rotation + Reuse Detection | BE |
| AUTH-003 | Client-Side Single-Flight Refresh | FE |
| AUTH-004 | Cross-App Handoff SSO | BE+FE |
| AUTH-005 | Admin Session Visibility | BE |
| AUTH-006 | User Suspend + Instant Effect | BE |
| AUTH-FE-001 | Login / Logout / Sessions UI | FE |

### RBAC (3 tickets)
| ID | Title | Type |
|----|-------|------|
| RBAC-001 | Permission Catalog + App Roles + Seed | BE |
| RBAC-002 | User App Access + Multi-Role | BE |
| RBAC-003 | Permission Guard + @Permissions Decorator | BE |

### HRMS Backend (5 tickets)
| ID | Title | Type |
|----|-------|------|
| HRMS-BE-001 | Service Bootstrap (port 3004) | BE |
| HRMS-BE-002 | Employees Module | BE |
| HRMS-BE-003 | Invitations | BE |
| HRMS-BE-004 | App Access + Role Management API | BE |
| HRMS-BE-005 | Teams + Departments | BE |

### HRMS Frontend (6 tickets)
| ID | Title | Type |
|----|-------|------|
| HRMS-FE-001 | Dashboard Bootstrap | FE |
| HRMS-FE-002 | Employees List Page | FE |
| HRMS-FE-003 | Employee Detail Page | FE |
| HRMS-FE-004 | Invitations Page + Accept Invite | FE |
| HRMS-FE-005 | Roles & Permissions Page | FE |
| HRMS-FE-006 | Teams & Departments Page | FE |

### Sales Teams (2 tickets)
| ID | Title | Type |
|----|-------|------|
| SALES-TEAMS-001 | Teams CRUD Backend + Lead Assignment | BE |
| SALES-TEAMS-002 | Teams Management Frontend | FE |

### Infrastructure (1 ticket)
| ID | Title | Type |
|----|-------|------|
| INFRA-001 | Wasabi + BunnyCDN Per-Org Auto-Provisioning | BE |

**Total: 24 tickets | 13 Backend | 10 Frontend | 1 Infra**

---

## Critical Path

```
AUTH-001 ──→ AUTH-002 ──→ AUTH-003 (FE)
    │
    ├──→ AUTH-006 ──→ HRMS-BE-002 ──→ HRMS-FE-002
    │
    └──→ RBAC-001 ──→ RBAC-002 ──→ RBAC-003
                          │
                          ├──→ HRMS-BE-004 ──→ HRMS-FE-003
                          │
                          └──→ AUTH-004 (cross-app SSO)

HRMS-BE-001 ──→ HRMS-FE-001 (bootstrap)
HRMS-BE-005 ──→ SALES-TEAMS-001 ──→ SALES-TEAMS-002
INFRA-001 (fully independent — run any time)
```
