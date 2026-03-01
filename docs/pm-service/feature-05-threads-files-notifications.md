# Feature 05: Threads, Files, and Notifications

## Goal

Provide communication and file handling that supports actual delivery work without duplicating uploads or exposing internal assets incorrectly.

## Business Outcome

- project, stage, and task discussions stay in one system
- files are reusable across scopes
- mentions and replies are first-class
- final deliverables are cleanly separated from raw working files

## Communication Model

Use one reusable thread engine.

## Core Tables

- `pm_conversation_threads`
- `pm_messages`
- `pm_message_mentions`
- `pm_message_attachments`
- `pm_thread_participants`

## Core Rules

- discussions exist at:
  - project level
  - stage level
  - task level
  - approval level
- replies use `parentMessageId`
- mentions create explicit mention records
- system activity is not the same as human discussion

## File Model

Use upload-once, link-many.

## Core Tables

- `pm_file_assets`
- `pm_file_versions`
- `pm_file_links`
- `pm_file_access_logs`

## File Rules

- actual files live in object storage
- database stores metadata and links
- a file can be linked to:
  - project
  - stage
  - task
  - submission
  - deliverable package
  - message
- file versions are append-only
- access is permission-checked
- delivery uses signed URLs

## Notification Direction

Near-term:

- PM domain can emit events
- `comm-service` should own actual notification delivery

Key triggers:

- task assigned
- task submitted
- QC decision
- mention created
- approval requested
- approval decided

## API Direction

Recommended initial endpoints:

- `GET /api/pm/threads/:id`
- `POST /api/pm/threads`
- `POST /api/pm/threads/:id/messages`
- `PATCH /api/pm/messages/:id`
- `POST /api/pm/messages/:id/mentions`
- `POST /api/pm/files/upload-token`
- `POST /api/pm/files/complete-upload`
- `GET /api/pm/files/:id`
- `POST /api/pm/files/:id/link`
- `POST /api/pm/files/:id/signed-url`

## File Upload Flow

Recommended first implementation:

1. backend creates upload token or upload intent
2. client uploads to object storage
3. backend confirms upload and creates `FileAsset` and `FileVersion`
4. backend links the file to the target scope

## Performance Notes

- paginate messages by thread
- index messages by `(threadId, createdAt)`
- index file versions by `(fileAssetId, versionNumber)`
- never return file access logs in normal UI endpoints
- use lightweight message list payloads by default
- do not proxy large file downloads through the app server when signed URLs can be used

## What Not To Do

- do not store large binary files in PostgreSQL
- do not expose raw permanent public file URLs
- do not create separate comment systems for project, stage, and task
