# ADR-001: Split the Product by Domain Service

## Status

Accepted

## Date

2026-03-01

## Context

The product is a full multi-tenant SaaS platform and includes CRM, PM, communication workflows, client portal access, and future HRMS. Keeping all future domains inside one backend service would increase coupling and make scaling, ownership, and long-term maintenance harder.

## Decision

The platform will be split by domain ownership:

- `api-gateway` for public routing
- `core-service` for auth, tenant, CRM, and billing core
- `pm-service` for workflow execution and approvals
- `comm-service` for notifications and communication delivery
- `hrms-service` for future attendance and payroll

## Alternatives Considered

- keep everything inside `core-service`
- split only communication and keep PM in `core-service`
- split all domains only later after deeper coupling

## Consequences

- each domain gets clearer ownership
- parallel implementation becomes safer
- long-term scaling is cleaner
- more service-to-service coordination is required
- event contracts and shared type discipline become important earlier
