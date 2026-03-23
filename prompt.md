I need you to do a deep investigation of the Inbox / Gmail integration flow in my project and identify the exact root cause of a major request flooding issue.

Context

We have an inbox page here:

sales-dashboard → https://sales.testinglinq.com/dashboard/inbox

When I open this page, the browser starts firing a very large number of network requests at once, especially repeated read requests and many of them appear as pending preflight requests in DevTools. This is causing a performance issue and likely indicates a loop, repeated mounting, uncontrolled polling, bad effect dependency handling, duplicate request orchestration, or some Gmail sync/read flow issue.

What I want from you

I do not want a generic answer.
I want you to inspect the actual codebase carefully and determine:

What is the exact root cause?
Which file(s), component(s), service(s), hook(s), effect(s), listener(s), polling logic, or event chain are causing the repeated requests?
Is it a frontend issue, backend issue, integration issue, or a combination?
Is the issue caused by React rendering, effect dependencies, repeated API retries, websocket fallback, mailbox sync logic, unread/read refresh logic, prefetching, or something else?
How does the full Inbox/Gmail flow currently work?
I want you to fully understand and document the current system across both projects:
sales-dashboard
comm-service
Investigation scope

Please study the complete flow of how the inbox works, including:

A. Gmail connection flow
How Gmail account is connected
Where OAuth or token handling happens
How connected accounts are stored and validated
How reconnect / refresh token / expiry handling works
B. Inbox loading flow
How inbox data is requested when user opens /dashboard/inbox
Which APIs are called initially
Which APIs are called after that
What triggers message fetch, thread fetch, read/unread fetch, label fetch, sync fetch, or count fetch
C. Read / thread / message flow
Why repeated read requests are being triggered
Which action or lifecycle causes them
Whether requests are duplicated intentionally or accidentally
Whether the same data is being fetched multiple times by different layers
D. Frontend architecture review

Check for:

bad useEffect dependency arrays
state update loops
re-render loops
duplicated hooks
repeated dispatches
repeated query invalidations
aggressive polling
missing cleanup in intervals/listeners
route remounting
unstable props causing child remount
duplicate API calls from React Strict Mode or bad effect design
E. Backend / service review

In comm-service, inspect:

inbox-related controllers
Gmail sync services
read endpoints
webhook/event handling
retry logic
queue/job processing
any logic that may cascade into repeated reads
F. CORS / preflight analysis

Since many requests appear as preflight:

identify why those requests require preflight
determine whether custom headers, auth handling, cross-origin setup, or request structure is making it worse
explain whether preflight is just a symptom or part of the real issue
Deliverables I want from you

Please give me your findings in this structure:

1. System Understanding

Explain clearly how Inbox + Gmail integration currently works end to end across:

sales-dashboard
comm-service
2. Exact Root Cause

Tell me the precise cause of the repeated requests.
Not assumptions — I want:

exact file names
exact functions / hooks / methods
exact trigger chain
why it happens
under what condition it happens
3. Supporting Evidence

Show the reasoning from code:

where request starts
what triggers re-render/re-fetch/retry
what calls read
why it repeats
whether multiple layers are doing the same thing
4. Impact

Explain:

performance impact
browser/network impact
user experience impact
backend load impact
5. Fix Plan

Provide a safe implementation plan that:

stops repeated requests
keeps existing business logic intact
avoids breaking Gmail/inbox flow
improves maintainability
6. Future Change Readiness

Since I want to make many future changes in this inbox module, identify:

weak areas in current design
tightly coupled parts
risky dependencies
components/services that should be refactored first
Important instructions
First, understand the current flow deeply
Then identify the exact issue
Do not jump straight to code changes without understanding architecture
Do not give generic performance advice
Do not assume — verify from code
If needed, trace the full chain from UI interaction → frontend request layer → backend endpoint → service logic
Mention any unclear area explicitly instead of guessing
Goal

I want you to become fully familiar with this module because I will ask you to make many future changes in:

Gmail integration
inbox behavior
thread/message flow
sync/read handling
UI and UX improvements

So this task is both:

root cause analysis, and
knowledge-building / architecture understanding for future work.

If helpful, you can start with:

locating the inbox route/component in sales-dashboard
identifying all APIs used by that page
tracing those APIs into comm-service
mapping the full Gmail connection and inbox read flow
then isolating the repeated request root cause