We need to improve the Sales dashboard by making it fully mobile responsive and enhancing the UI/UX of filter handling across key pages such as Leads, Brands, Sales, and Invoices.

Objective

The goal is to improve usability and consistency without changing the existing business logic. The functionality should remain exactly the same, but the user experience should be cleaner, smarter, and more reusable.

Current issue

Right now, filter dropdowns are placed directly above the table on pages like Leads, Brands, Sales, and Invoices. This makes the UI feel cluttered, especially on smaller screens, and creates inconsistency in the filtering experience.

Required improvement

Instead of showing all filters directly above the table, use a single Filter button.

When the user clicks the Filter button:

all related filters should open/render in a clean and user-friendly way
the user should be able to apply filters easily
the design should work well on both desktop and mobile

After filters are applied:

the active/applied filters should appear just above the table
each applied filter should have a close/remove icon
the user should be able to remove individual filters directly
there should also be a convenient way to clear filters as needed
Scope

Apply this improved filter UX consistently across:

Leads
Brands
Sales
Invoices
any other similar table-based pages where the same filter pattern exists
Implementation requirements
Make the Sales dashboard fully mobile responsive
Improve filter UI/UX with a cleaner interaction pattern
Use smart working and build the solution in a reusable way
Create reusable components/patterns for filters wherever possible
Keep the implementation scalable for other pages in the future
Do not change the existing logic
Only improve presentation, responsiveness, and user interaction
Suggested implementation plan
Phase 1 — Responsive UI Review
Audit the current Sales dashboard pages for mobile responsiveness issues
Fix layout, spacing, overflow, table behavior, and filter placement for smaller screens
Phase 2 — Reusable Filter Pattern
Replace multiple visible filter dropdowns with a single Filter button
On click, show all related filters in a structured panel, popover, drawer, or dropdown pattern depending on the page UX
Keep the interaction intuitive and responsive across devices
Phase 3 — Applied Filters Display
Show all active filters above the table as clear filter tags/chips
Add a close icon on each tag so users can remove filters individually
Add support for clearing filters cleanly without affecting business logic
Phase 4 — Reusability and Consistency
Build the filter UI as a reusable component or shared pattern
Apply the same behavior across Leads, Brands, Sales, and Invoices
Ensure consistency in spacing, states, and interactions
Phase 5 — Final Validation
Verify that no business logic has changed
Confirm that filtering results still behave exactly as before
Ensure the new UI works properly on desktop, tablet, and mobile
Important note

This is a UI/UX and responsiveness enhancement task only.
The existing filter logic, business rules, and data behavior must remain unchanged.