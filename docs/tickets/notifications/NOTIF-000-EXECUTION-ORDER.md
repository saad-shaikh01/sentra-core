# Notification System — Execution Order

## Dependency Graph

```
NOTIF-001 (Schema)
    │
    ├──→ NOTIF-002 (BullMQ Queue + Processor)
    │         │
    │         └──→ NOTIF-003 (NotificationHelper shared lib)
    │                   │
    │                   ├──→ NOTIF-004 + NOTIF-005 (REST API + Socket Gateway — same module, same agent)
    │                   │
    │                   └──→ NOTIF-011 (Migrate existing services)
    │
    └──→ NOTIF-013 (@Mention backend) — needs NOTIF-003

NOTIF-006 (Frontend lib bootstrap) ← independent, start any time
    │
    └──→ NOTIF-007 (Hooks) — needs NOTIF-004 + NOTIF-005 + NOTIF-006
              │
              └──→ NOTIF-008 (UI Components)
                        │
                        └──→ NOTIF-009 (Wire both dashboards)

NOTIF-010 (Tiptap RTE) ← fully independent, start any time in parallel

NOTIF-012 (Firebase FCM) — needs NOTIF-004 (push-token endpoint) + NOTIF-005 (socket)
```

## Phase Table

| Phase | Tickets | Can Parallelize? |
|-------|---------|-----------------|
| 1 | NOTIF-001 | No — must be first (DB migration) |
| 2 | NOTIF-002, NOTIF-006, NOTIF-010 | Yes — all 3 parallel |
| 3 | NOTIF-003 | After NOTIF-002 |
| 4 | NOTIF-004+005, NOTIF-011, NOTIF-013 | Yes — all parallel after NOTIF-003 |
| 5 | NOTIF-007 | After NOTIF-004+005+006 |
| 6 | NOTIF-008, NOTIF-012 | Yes — parallel |
| 7 | NOTIF-009 | After NOTIF-008 |

## Ticket Index

| ID | Title | Type | Phase |
|----|-------|------|-------|
| NOTIF-001 | Database Schema & Prisma Migration | BE | 1 |
| NOTIF-002 | BullMQ Notification Queue + Processor | BE | 2 |
| NOTIF-003 | NotificationHelper Shared Library | BE | 3 |
| NOTIF-004 | Notifications REST API (core-service) | BE | 4 |
| NOTIF-005 | Notifications Socket.io Gateway | BE | 4 |
| NOTIF-006 | Frontend Shared Lib Bootstrap | FE | 2 |
| NOTIF-007 | Notification Hooks (Query + Socket) | FE | 5 |
| NOTIF-008 | NotificationBell + Panel UI Components | FE | 6 |
| NOTIF-009 | Wire Notifications into Both Dashboards | FE | 7 |
| NOTIF-010 | Tiptap Rich Text Editor Shared Component | FE | 2 |
| NOTIF-011 | Migrate Existing Notification Services | BE | 4 |
| NOTIF-012 | Firebase FCM Push Integration | BE+FE | 6 |
| NOTIF-013 | @Mention Backend Extraction & Dispatch | BE | 4 |
