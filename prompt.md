Perform a complete implementation of dashboard filtering and reporting improvements in the existing codebase, based on the previously identified analytics and data-visibility issues.

Your job is to explore the codebase, identify all relevant frontend and backend areas, and fully implement the required changes so the dashboard becomes a reliable reporting and validation surface for leads, invoices, and sales.

Background / Current Issues

The current dashboard behaves like a static summary screen instead of a proper reporting tool.

Known problems in the current implementation:
The dashboard has no filter state.
No From Date
No To Date
No week/month period presets
No month selector
No comparison mode
The dashboard is driven by a single parameterless analytics query, so users cannot inspect data by period or reconcile dashboard numbers with detail pages.
The UI suggests a time context such as “last 12 months”, but widgets currently mix multiple time models:
all-time totals
current month values
last month comparison
real-time snapshot values
Charts and KPIs are not aligned on a shared filter window, which makes data validation difficult.
Weekly or short-range anomalies are hidden because charting is effectively hardcoded to a monthly 12-month view.
Previous-month comparison is limited and inconsistent. It does not apply uniformly across dashboard widgets.
Dashboard metrics cannot be directly reconciled with leads, invoices, and sales listing pages because those screens already support filtering while the dashboard does not.
Existing date-related bugs and inconsistencies are harder to detect because the dashboard cannot be narrowed to a specific period.
Goal

Implement a fully functional dashboard filter system that allows users to inspect dashboard data by date range and time granularity, and compare periods in a consistent way across all relevant dashboard widgets.

Do not stop at partial UI work. Implement the full flow end to end:

frontend state
query params / API integration
backend filter handling
analytics calculation updates
chart/data transformation
comparison logic
labeling and UX clarity
cache/query-key correctness
consistency across cards, charts, and summaries
Required Features
1. Global Dashboard Filter State

Add a top-level dashboard filter state that controls all dashboard widgets consistently.

It must support:

From Date
To Date
Preset periods
This Week
This Month
Last 30 Days
Specific Month
Custom Range
Granularity toggle
Weekly
Monthly
Month selector
Example: March 2026
Comparison mode
Compare to Previous Period
Compare to Previous Month
Optional: no comparison

All relevant dashboard cards, charts, summaries, and breakdown widgets must respond to the same shared filter state unless a widget is intentionally designed as a snapshot metric.

2. Backend Analytics Filtering

Update the backend analytics/dashboard summary logic so it accepts and correctly handles filter parameters.

Implement support for:

fromDate
toDate
preset
month
year
granularity
compareMode

You should explore the existing analytics service/controller structure and apply the changes in the correct place rather than forcing a superficial workaround.

3. Consistent Time Semantics

Normalize time logic so each metric clearly belongs to one of these categories:

Period metric
Example: revenue collected within selected range, leads created within selected range, invoices generated within selected range
Snapshot metric
Example: currently overdue invoices, currently active sales

Where snapshot metrics remain on the dashboard:

clearly label them as current-state metrics
do not misleadingly imply they belong to the selected period unless intentionally filtered by period

If a widget cannot meaningfully work under the selected range, either:

redesign its logic correctly, or
label it clearly so users understand what it represents
4. Chart Improvements

Update chart logic so users can inspect data in a useful way.

Required behavior:

Weekly granularity should bucket by calendar week
Monthly granularity should bucket by calendar month
Charts must use the currently selected date window
Specific month selection should show that month only
Comparison datasets should align correctly with the chosen compare mode

Do not leave the existing hardcoded “last 12 months” behavior unless it is being used only as a fallback default state.

5. Comparison Logic

Implement robust comparison support.

Compare to Previous Month

When a user selects a month or monthly context:

calculate the immediately previous calendar month
show delta values for all major applicable KPIs
Compare to Previous Period

When a user selects a custom date range:

compare against the immediately preceding period of equal length

Example:

Selected range: March 10–March 20
Comparison range: February 28–March 9 or the immediately preceding equal-length range based on exact day count

Ensure comparison logic is:

deterministic
mathematically correct
consistently applied
6. Query Key / Caching / Refetch Correctness

Update frontend query keys and fetching logic so dashboard queries refetch correctly whenever filters change.

Do not use a static key like:

['analytics-summary']

Instead, ensure the query key reflects the active filter state.

Also make sure the dashboard does not show stale data when:

filters change
month changes
comparison mode changes
granularity changes
7. Reconciliation With Detail Pages

Where practical, align dashboard metric definitions with existing list/detail pages for:

Leads
Invoices
Sales

The goal is that a user selecting a period on the dashboard should be able to cross-check the same period in detail pages and get logically matching results.

If exact one-to-one reconciliation is not possible due to domain differences, standardize and document the definitions in code comments or labels.

8. UX / Labeling Requirements

The dashboard must clearly communicate what data is being shown.

Implement clear labels such as:

active date range
active preset
granularity
comparison mode
whether a widget is “Current Snapshot” or “Selected Period”

The user should never be left guessing what period a number belongs to.

Expected Behavior
Default State

When the dashboard first loads:

use a sensible default filter state
recommended default: Last 30 Days with Monthly or Weekly granularity based on what fits the design best
ensure the UI clearly shows the selected default
From Date / To Date
defines a single inclusive reporting range
all relevant metrics update together
invalid ranges should be prevented or handled gracefully
Specific Month
selecting a month should automatically set the range to the first through last day of that month
all applicable widgets should show only that month’s data
Weekly View
charts and grouped reporting should bucket by week
useful for detecting short-term anomalies and sync issues
Monthly View
charts and grouped reporting should bucket by month
useful for trend analysis and finance reporting
Compare to Previous Month
compare selected month or monthly context against immediately preceding month
show delta on all major comparable cards
Compare to Previous Period
compare custom or preset date range to an immediately preceding equal-length window
the comparison must be based on the same metric definitions
Snapshot Widgets

If certain cards represent current state rather than selected-period activity:

make that explicit in the UI
do not mix them misleadingly with period cards
Implementation Expectations

You must:

Explore the existing frontend dashboard structure and analytics hooks/API layer
Explore the backend analytics controller/service/query logic
Identify all widgets/cards/charts affected by dashboard filters
Implement the changes end to end
Update types/interfaces where needed
Make the solution production-ready, not a proof of concept
Important Notes
Do not merely add UI controls without wiring them properly
Do not hardcode temporary logic
Do not leave inconsistent metric definitions between cards and charts
Do not implement partial filtering for only one widget unless that widget is explicitly isolated by design
Preserve existing functionality where correct, but refactor where necessary for consistency
Deliverables

After implementation, provide:

A summary of what was changed
Which files/modules were updated
Final behavior of each filter
Any assumptions or metric-definition decisions made
Any remaining limitations, if unavoidable

Before finishing, verify that:

changing dashboard filters changes data correctly
comparison values update correctly
charts and cards stay in sync
no stale cache behavior remains
the dashboard is now useful for actual data validation, not just passive summary display