We now need to add a reusable sticky pagination bar across all pages where pagination is required.

Objective

Create a bottom sticky pagination bar that stays visible for better usability and works consistently across all relevant pages. It should be built in a reusable and scalable way, without changing the existing pagination logic.

Requirements

The pagination bar should:

remain sticky at the bottom
be reusable across all pages where pagination is used
be fully responsive on desktop, tablet, and mobile
include all important pagination controls and information in one place
Pagination bar should include
Previous button
Next button
current page indicator
total pages
total items
displayed items range
per-page limit selector
any other useful pagination details already supported by existing logic
UI/UX expectations
use a clean and modern glassmorphism effect
ensure the bar looks polished and does not feel heavy
maintain proper readability and accessibility
keep interactions smooth and user-friendly
optimize spacing and layout for smaller screens so the bar remains usable on mobile
Scope

Apply this pagination bar to every page where pagination is needed, using the same reusable component/pattern.

Implementation requirements
build it as a shared reusable pagination component
ensure it can adapt to different pages and datasets
keep the existing pagination behavior and logic unchanged
only improve the presentation, layout, responsiveness, and usability
make sure it integrates cleanly with current tables/lists
Suggested implementation plan
Phase 1 — Pagination Audit
review all pages where pagination currently exists or will be needed
identify the common pagination logic and display requirements
Phase 2 — Reusable Component Design
create a shared sticky bottom pagination bar component
make it configurable so it can work across different modules/pages
Phase 3 — UI/UX Enhancement
apply a modern glassmorphism style
organize controls clearly for both desktop and mobile
ensure responsive behavior and proper wrapping/collapsing where needed
Phase 4 — Data Display Integration
show:
current page
total pages
total items
current visible item range
page size / limit selector
prev/next navigation
keep all values synced with existing pagination state
Phase 5 — Final Validation
confirm that the pagination logic is unchanged
verify responsiveness on all screen sizes
ensure consistency across all pages using this component
Important note

This is a UI/UX enhancement and component reusability task only.
Do not change any existing business logic or pagination behavior.
The goal is to create a better, more consistent, responsive, and reusable pagination experience across the system.