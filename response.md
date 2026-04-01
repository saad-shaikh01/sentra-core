Act as a senior frontend UI/UX engineer and responsive design specialist.

I want you to redesign and improve the styling of an email-detail/status panel in my dashboard UI for both **desktop and mobile** screens.

## Important constraint

**Do not change any business logic, data logic, conditions, tab logic, labels, status rules, rendering rules, or backend behavior.**
Your task is **styling/UI redesign only**:

* improve layout
* improve spacing
* improve hierarchy
* improve readability
* improve responsiveness
* improve visual consistency
* improve badge/chip arrangement
* improve icon alignment
* improve overflow handling
* improve mobile usability
* improve desktop balance

## Context

This panel is part of the page:
👉 `/dashboard/inbox`

I have attached reference screenshots showing current UI issues:

* `design_issues/4.png`
* `design_issues/5.png`

Use these images to understand current layout problems and redesign accordingly.

This panel shows email/thread intelligence and status signals such as:

* REPLIED
* DELIVERY SENT
* SCORE
* HOT LEAD
* SUSPICIOUS ACTIVITY
* OPENED MULTIPLE TIMES
* TRACKING ESTIMATED
* GHOSTED
* NEEDS FOLLOW-UP
* signal strength / expected window / timing insights / reply insights / open insights

Currently the logic is correct, but the UI looks crowded, unbalanced, and hard to scan on both desktop and mobile.

## Problems to solve

Please redesign the styling to fix these issues:

1. **Too many badges/chips are crammed together**

   * badges wrap awkwardly
   * inconsistent sizing
   * weak visual hierarchy
   * hard to identify primary vs secondary status

2. **Poor spacing and alignment**

   * sections feel cluttered
   * text blocks and chips compete for space
   * icons do not feel properly aligned
   * vertical rhythm is weak

3. **Mobile responsiveness is poor**

   * content feels squeezed
   * chips become messy
   * long text breaks badly
   * not enough breathing room
   * important signals are hard to scan quickly

4. **Desktop layout is also weak**

   * excessive empty space in some areas
   * dense cluster in others
   * the information architecture is not visually organized

5. **Status/info grouping is unclear**

   * important statuses should stand out more
   * secondary metadata should feel quieter
   * supporting insights should be grouped in a cleaner way

## What I want from you

Please provide a **complete UI redesign proposal** that keeps all existing functionality intact.

### Deliverables

1. A clear explanation of the new design structure
2. A suggested visual hierarchy for:

   * primary statuses
   * secondary statuses
   * metrics
   * timeline info
   * insights/reasons
   * actions/icons
3. A responsive layout plan for:

   * mobile
   * tablet
   * desktop
4. Exact frontend implementation guidance
5. Updated JSX/HTML structure if needed
6. Updated Tailwind CSS / CSS classes / styled component suggestions
7. Suggestions for chip/badge redesign
8. Better spacing, padding, margin, font-size, and layout rules
9. Better handling for long text and wrapped status chips
10. Accessibility improvements
11. Suggestions to improve perceived UX quality without touching logic

## Design requirements

* Keep the dark theme
* Make it modern, polished, premium, and easier to scan
* Preserve all existing information
* Preserve all current actions/icons
* Preserve all labels and statuses
* No changes to filtering/classification logic
* No changes to Ghosted / Replied / Tracking / Score logic
* No changes to which emails appear in any tab
* No changes to API data mapping
* No changes to state management logic unless needed purely for presentation
* Do not remove any useful information; reorganize it visually

## Specific redesign direction

Restructure the panel into a cleaner information hierarchy such as:

* header/title area
* primary status chips row
* secondary signal chips row
* metrics/summary area
* supporting insights area
* action icons area

Only do this **without changing the underlying logic**.

## Mobile-specific expectations

* chips should wrap cleanly
* text should not feel cramped
* sections should stack naturally
* primary insights should appear first
* touch targets should be comfortable
* no overlapping or awkward multi-line chip collisions

## Desktop-specific expectations

* use available width better
* avoid a giant empty area beside dense chip clusters
* create stronger grouping and alignment
* improve readability of timeline and insight blocks

## Code expectations

Please return:

* a proposed component structure
* updated styling code
* responsive breakpoint behavior
* any utility classes needed
* a polished implementation approach

If possible, structure your response like:

1. Design diagnosis
2. Redesign strategy
3. Updated component structure
4. Responsive behavior
5. Styling recommendations
6. Sample implementation code
7. Why this improves UX without changing logic

Use the provided screenshots (`design_issues/4.png` and `design_issues/5.png`) as reference for current issues.
