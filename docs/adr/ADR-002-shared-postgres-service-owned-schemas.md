# ADR-002: Use Shared PostgreSQL Infrastructure with Service-Owned Logical Schemas

## Status

Accepted

## Date

2026-03-01

## Context

The platform will have several backend services, but early-stage implementation should remain operationally simple. Running fully separate databases for every service from the start increases infrastructure overhead. At the same time, allowing all services to write anywhere in one shared schema would weaken domain boundaries.

## Decision

The platform will use:

- one shared PostgreSQL cluster for `core-service`, `pm-service`, and future `hrms-service`
- one MongoDB instance for `comm-service`

Inside PostgreSQL, domain ownership will be logically separated:

- `core` schema owned by `core-service`
- `pm` schema owned by `pm-service`
- `hrms` schema owned by `hrms-service`

Services may share infrastructure, but they should not treat another service's tables as a writable shared domain.

## Alternatives Considered

- one completely shared schema for all services
- fully separate PostgreSQL databases per service from day one
- keeping PM inside `core-service` to avoid new storage concerns

## Consequences

- infrastructure stays simpler in early phases
- domain ownership remains clear
- later extraction to separate databases is easier
- cross-service reads and writes must be handled intentionally
- schema discipline becomes a core engineering requirement
