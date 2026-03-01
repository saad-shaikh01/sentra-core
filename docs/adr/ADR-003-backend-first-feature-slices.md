# ADR-003: Implement Features in Backend-First Vertical Slices

## Status

Accepted

## Date

2026-03-01

## Context

The team wants to build features in a way that allows steady local verification, avoids frontend drift, and keeps visible product progress. Multiple agents will work in parallel, but frontend work should not guess unstable APIs.

## Decision

Features will be implemented in backend-first vertical slices.

For each bounded feature:

1. backend domain logic and API are implemented first
2. backend work is merged into `integration`
3. the slice is locally verified
4. a frontend agent builds the UI against the merged API
5. the feature is tested locally again as an end-to-end slice

This applies to the major product domains as well as to bounded feature streams inside those domains.

## Alternatives Considered

- frontend and backend built fully in parallel against assumed contracts
- frontend-first scaffolding followed by backend catch-up
- large backend phases followed by a large frontend catch-up phase

## Consequences

- frontend implementation becomes more stable
- local testing can happen continuously
- visible feature completion improves
- backend contracts must be reviewed carefully before merge
- integration discipline becomes part of the delivery workflow
