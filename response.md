Act as a senior frontend engineer and UI/UX specialist.

I need an exact implementation plan and UI refactor proposal for the page `/dashboard/inbox`.

Important: this is a frontend-only redesign/refactor. Do not change backend logic, APIs, data contracts, sync logic, tracking logic, tab logic, classification logic, or database behavior. Existing business logic must remain untouched.

## Context

I have placed reference images inside the `design_issues` folder. Please use them to understand both the current CRM UI and the Gmail reference experience.

Files include:

* `design_issues/4.png`
* a Gmail thread reference screenshot I placed in the same folder

The goal is to keep my improved CRM intelligence/header area, but make the actual email thread reading experience much closer to Gmail in terms of clarity, hierarchy, collapsed thread behavior, and message readability.

## What must remain unchanged

Do not change:

* backend
* API payload shape
* data fetching logic
* sync behavior
* Gmail integration behavior
* tracking logic
* ghosted/replied/score/hot lead logic
* tab logic
* thread classification logic
* database logic
* message ordering logic from the backend unless it is already provided and only reused for presentation

## What should be improved

Frontend only:

* thread rendering structure
* collapsed vs expanded message presentation
* “show earlier messages” interaction similar to Gmail
* message row readability
* expanded message readability
* quoted history styling
* font-family handling for actual email content
* mobile responsiveness
* desktop spacing and alignment
* hover/tap experience
* visual hierarchy

## Main issue to solve

Right now all thread messages are being displayed openly in the CRM, but Gmail collapses older messages and shows a cleaner conversation experience with a count indicator that reveals earlier messages on click. I want a similar experience in my CRM without changing any underlying logic.

Also, the same message content appears with different font rendering in Gmail versus my CRM. I want the CRM shell UI to keep its app font, but the actual email body rendering should preserve or better respect the email’s own font styling or use a more Gmail-like readable fallback. Do not solve this by changing backend processing unless absolutely unavoidable; prefer frontend rendering fixes first.

## What I want from you

Please provide:

1. A precise implementation plan
2. A proposed component structure/refactor
3. Frontend state logic for collapsed/expanded thread rendering
4. Rules for which messages are visible by default vs hidden behind a “show earlier messages” control
5. A Gmail-inspired but CRM-appropriate UI approach
6. A font-rendering strategy for CRM UI font vs email body font
7. Responsive behavior for mobile, tablet, and desktop
8. JSX/Tailwind/CSS implementation guidance
9. Accessibility considerations
10. A safe rollout approach that guarantees existing logic is not disturbed

## Desired rendering behavior

* Keep the CRM intelligence summary at the top
* Separate the thread reading area from the summary area more clearly
* Show the latest/active message in expanded form
* Show some recent messages in compact row form
* Collapse older messages behind an inline control such as “Show X earlier messages”
* Clicking the control should reveal older messages inline
* Compact message rows should show avatar, sender, preview, and timestamp
* Expanded message should show sender details, recipient context, timestamp, actions, full body, and quoted history
* Quoted history should be visually structured and easier to scan
* Message reading should feel content-first, like Gmail, while preserving CRM signals

## Font requirement

* CRM shell can use the app font
* Email body should not be forced into the CRM shell font unnecessarily
* Preserve inline font styles when safe and possible
* If original font cannot be preserved, use a sensible Gmail-like fallback stack
* Inspect whether current CSS or typography utilities are overriding email body fonts and propose a fix

## Output format

Structure your response like this:

1. Current problems diagnosed
2. Proposed UX behavior
3. Component architecture
4. Frontend state plan
5. Collapse/expand rendering rules
6. Font handling strategy
7. Responsive styling strategy
8. Sample implementation structure
9. Risk assessment
10. Why this does not require backend changes

Do not give vague suggestions. Give an implementation-ready plan that a frontend developer can execute safely.
