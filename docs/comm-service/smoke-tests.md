# Comm Service Smoke Tests

Run this checklist after deploy or before release cut.

## OAuth and Sync

- [ ] Connect a new Gmail mailbox through the comm settings page and confirm the backend redirect returns `success=1`.
- [ ] Verify initial sync completes and the inbox shows imported emails for the connected identity.
- [ ] Confirm the identity shows active sync state and no degraded error banner after the first sync completes.

## Compose and Send

- [ ] Compose and send a plain-text email and confirm it appears in the sent view.
- [ ] Compose and send an HTML email and confirm formatted content renders in thread view.
- [ ] Upload a file attachment, send the email, and confirm the attachment chip appears before send and the attachment opens from the CDN URL after send.
- [ ] Insert an inline image, send the email, and confirm the sent message body contains the Bunny CDN image URL.

## Reply and Forward

- [ ] Reply to an inbound email and confirm the reply is stored on the original thread.
- [ ] Forward an email and confirm the compose drawer opens with `Fwd:` subject and quoted original content.
- [ ] Use Reply All and confirm all original recipients except the sending identity are included.

## Read State and Access Control

- [ ] Mark a thread unread, confirm Gmail shows the unread state, reload the dashboard, and verify the unread badge persists.
- [ ] Mark the same thread read and confirm Gmail removes the `UNREAD` label and the server unread badge decrements.
- [ ] Sign in as an admin user and verify all org threads are visible.
- [ ] Sign in as a non-admin user and verify only that user's identities, threads, messages, and attachments are visible.

## Error and Recovery

- [ ] Simulate a token refresh failure, confirm the identity shows an error banner, and verify the reconnect flow clears the degraded state after a successful reconnect.
