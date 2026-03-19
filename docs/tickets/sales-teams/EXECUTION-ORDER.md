# Data Scope System — Execution Order

## Overview
Two-layer security: **RBAC** (existing, action gates) + **DataScope** (new, data filtering).
ScopeService computes a `UserScope` per user, cached in Redis for 15 min.
Each service applies scope filters via `UserScope.toXxxFilter()` methods.

## Architecture Decisions
- Lead.teamId set at **assignment time** (historical attribution — never changes when user moves teams)
- **TeamBrand** junction: 1 brand → 1 team (enforced), 1 team → many brands
- **Team.allowMemberVisibility**: per-team toggle for member-level data sharing
- Scope cached in Redis, invalidated on team/brand membership changes
- RBAC remains untouched — DataScope is additive

## Execution Order

### Phase 1: Schema & Foundation
| Order | Ticket | Title | Depends On |
|-------|--------|-------|------------|
| 1 | DS-001 | Schema Migration (TeamBrand + indexes) | — |
| 2 | DS-002 | ScopeService + UserScope Class | DS-001 |
| 3 | DS-003 | Scope Invalidation (Redis cache-busting) | DS-002 |

### Phase 2: Service Integration
| Order | Ticket | Title | Depends On |
|-------|--------|-------|------------|
| 4 | DS-004 | Leads Service Scope Integration | DS-002 |
| 5 | DS-005 | Clients Service Scope Integration | DS-002 |
| 6 | DS-006 | Sales Service Scope Integration | DS-002 |
| 7 | DS-007 | Invoices Service Scope Integration | DS-002 |
| 8 | DS-008 | Lead Auto-Assignment (teamId + brand resolution) | DS-001, DS-002 |

### Phase 3: Management UI & Admin
| Order | Ticket | Title | Depends On |
|-------|--------|-------|------------|
| 9 | DS-009 | TeamBrand Management API + UI | DS-001 |
| 10 | DS-010 | Team Visibility Setting (allowMemberVisibility) | DS-002 |
| 11 | DS-011 | Frontend Route & Widget Scoping | DS-004..007 |

### Phase 4: Ops & Data Integrity
| Order | Ticket | Title | Depends On |
|-------|--------|-------|------------|
| 12 | DS-012 | Backfill Script (existing leads → teamId) | DS-001, DS-008 |
| 13 | DS-013 | Dashboard KPI Scoping | DS-004..007 |
| 14 | DS-014 | E2E Integration Tests | All |

## Roles & Visibility Matrix
| Role | Leads | Clients | Sales | Invoices |
|------|-------|---------|-------|----------|
| OWNER | All org | All org | All org | All org |
| ADMIN | All org | All org | All org | All org |
| SALES_MANAGER | Team brands | Team brands | Team brands | Team brands |
| FRONTSELL_AGENT | Own assigned | Team brands (if visibility on) or own leads' clients | Team brands (if visibility on) | Team brands (if visibility on) |
| UPSELL_AGENT | Own assigned | Own assigned | Own assigned sales | Own assigned invoices |
| PROJECT_MANAGER | None | Own assigned | None | None |
