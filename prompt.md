You have already explored my email-related flow and you are familiar with my codebase. I want you to deeply investigate and identify the root cause of the following issues.

Issue 1: Sync toast message behavior
On the UI, a toast message appears at the bottom with messages like:
- "0 messages synced"
- "1 message synced"

I want you to find out:
1. Why this toast is being shown
2. What exact logic, event, API response, websocket event, polling mechanism, state update, or background job triggers it
3. Why it sometimes shows "0 messages synced" and sometimes "1 message synced"
4. From where the synced count is being calculated
5. Whether this is caused by frontend state leakage, backend event broadcasting, shared cache, shared store, database query issue, socket channel issue, global state issue, tenant scoping issue, or incorrect auth/user filtering

Issue 2: Cross-user email sync toast leakage
Let’s say Agent A has connected an email account. In that case, it makes sense if Agent A sees the sync toast.

But the problem is:
Agent B, who has NOT connected any email account at all, is also seeing the same sync toast related to the exact email account that Agent A connected.

I want you to investigate:
1. Why Agent B is receiving that toast
2. How the email/account/user/agent scoping is currently implemented
3. Whether events are being broadcast globally instead of user-specific
4. Whether the frontend subscription/channel/topic/socket listener is not scoped per authenticated user
5. Whether backend queries are returning data without filtering by the correct agent/user/workspace/team/account
6. Whether some shared Redux/Zustand/Context/global store/local storage/cache/session state is causing this
7. Whether there is any issue in pub-sub, websocket rooms, SSE, notification service, or job result broadcasting
8. Whether the toast is tied to a shared mailbox record instead of the currently logged-in agent
9. Whether the problem comes from multi-tenant isolation failure

Issue 3: Inbox count showing for users with no email connected
In the sidebar, the Inbox count is also sometimes displayed for multiple users who have not connected any email account.

I want you to investigate:
1. Why users with no connected email account are seeing an Inbox count
2. How the inbox count is fetched and scoped
3. Whether the count query is incorrectly using shared data
4. Whether the count is based on a global mailbox/inbox table instead of the logged-in user’s connected account
5. Whether stale frontend cache or persisted state is causing old counts to appear
6. Whether server-side response caching, query caching, or client-side caching is leaking data across users
7. Whether there is a missing check like “user has connected email account” before showing inbox count
8. Whether the data is scoped by agent, organization, workspace, or account correctly

What I need from you:
1. Trace the full flow end-to-end:
   - email connection
   - sync trigger
   - sync status update
   - toast generation
   - inbox count fetch/update
   - frontend rendering
2. Identify the exact files, functions, components, hooks, services, backend handlers, jobs, queries, events, and listeners responsible
3. Explain the root cause clearly
4. Highlight whether the bug is frontend, backend, realtime layer, caching layer, or database scoping related
5. Point out any missing tenant isolation / auth checks / user filters
6. Suggest the exact fix with code-level reasoning
7. Mention any edge cases or similar places in the codebase where the same bug could also happen

Please do not give a generic answer. I want a codebase-specific investigation based on the actual implementation. If you suspect multiple possible causes, rank them by likelihood and explain why.