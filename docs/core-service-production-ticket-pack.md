# Core Service Production Ticket Pack

**Module:** Advanced Auth & Infrastructure
**Status:** Authoritative
**Hold:** Client Approval (comm-service)

---

### [P0: Auth & Access Architecture Refactor]

#### AUTH-BE-001: Unified App-Centric Auth Refactor
- **Severity:** P0
- **Module:** Auth / IAM
- **Expected Behavior:** 
  - JWT payload updated to include `appAccess` array.
  - Login returns list of accessible apps.
- **Estimate:** M

#### AUTH-BE-002: AppAccessGuard & Scoped Decorators
- **Severity:** P0
- **Module:** Auth / Guards
- **Expected Behavior:** Verify user has specific `AppCode` before granting API access.
- **Estimate:** S

---

### [P0: Leads & Foundation Blockers]

#### LEAD-BE-001: Soft-Delete Implementation
- **Severity:** P0
- **Module:** Leads / Prisma
- **Estimate:** S

#### CORE-BE-006: Advanced Data Scoping (Visibility)
- **Severity:** P0
- **Module:** Auth / Organization
- **Expected Behavior:** Owners/Admins see all. Managers see Team data. Agents see only Assigned data.
- **Estimate:** M

#### CORE-BE-007: Dynamic CORS & Performance Hardening
- **Severity:** P0
- **Module:** Infrastructure / Security
- **Expected Behavior:** 
  - Dynamic CORS middleware whitelisting Brand domains.
  - Redis caching for `Public Invoice Detail` API.
  - Rate-limiting on public endpoints.
- **Estimate:** M

---

### [P1: Sales, Payments & Branding]

#### SALE-BE-001: Advanced Sales Schema (Packages & Custom Plans)
- **Severity:** P0
- **Module:** Sales / Prisma
- **Estimate:** M

#### SALE-BE-002: Dynamic Invoicing & Authorize.Net Profile Management
- **Severity:** P0
- **Module:** Sales / Payments
- **Estimate:** M

#### BRAND-BE-001: Advanced Brand Identity & Asset Management
- **Severity:** P1
- **Module:** Brands / Storage
- **Expected Behavior:** 
  - CRUD updated with: `primaryColor`, `secondaryColor`, `logoUrl`, `faviconUrl`.
  - Integration with **Wasabi S3** for file storage and **Bunny CDN** for delivery.
- **Estimate:** M

---

### [Not in this phase]
- Client Approval flow (HOLD).
- Complex Tax/Currency logic.
