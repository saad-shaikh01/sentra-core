The dashboard filter system has already been implemented. Do not redo or replace the filter work unless required for consistency.

Your task now is to fix the core business-data consistency issues exposed by the backdated-entry and partial-payment analysis.

This is a full implementation task, not just analysis.

You must explore the existing codebase and implement the necessary backend + frontend changes so that Leads, Sales, Invoices, Payments, and Dashboard analytics all behave consistently for:

backdated records
installment sales
partial invoice payments
sale status transitions
revenue vs collected vs outstanding amounts
dashboard reconciliation
Context

The dashboard filtering/reporting layer was already added successfully. Current implemented behavior includes:

Global analytics filter state
Presets: this week, this month, last 30 days, specific month, custom range
Weekly/monthly granularity
Previous-period / previous-month comparison
Parameterized analytics API
Revenue-by-period buckets
Snapshot vs period labeling on dashboard widgets

That part is already done.

New Task Focus

Now fix the underlying business logic and metric definitions so that filtered dashboard data is actually trustworthy.

Current Known Problems To Fix

Based on prior code analysis, the current system has these issues:

1. Lead date inconsistency
Leads can have a business date like leadDate
Dashboard lead analytics currently rely on createdAt in at least some places
This causes backdated leads to appear in the current month instead of the intended business month
2. Sale date inconsistency
Sales reporting currently depends on createdAt, sometimes overridden from saleDate
This is fragile and inconsistent
Sales need a clear canonical business/reporting date instead of mutating audit timestamps
3. Installment scheduling is wrong for backdated sales
Installment invoices are being generated relative to “now” / entry time instead of the actual business sale date or an intentional installment schedule
Example: a November 2025 sale entered in March 2026 can create April/May 2026 invoice due dates by default, which is incorrect for many business cases
4. No proper partial-payment semantics
A sale with total 500 and only 250 collected has no clear payment-state representation
There is no reliable PARTIALLY_PAID equivalent or separate payment-state model
This causes dashboard and UI ambiguity
5. Invoice-payment path and sales-payment path behave differently
Paying an invoice via the invoice module does not reliably update sale state
Paying through the sales payment flow can update the sale differently
This must be unified
6. Revenue, collected, and outstanding are not clearly separated
Dashboard revenue can show full booked sale amount while collected metrics show only paid invoices
There is no clean, consistent distinction between:
booked revenue
collected cash
outstanding receivables
7. Dashboard time bases are inconsistent

Different widgets may be driven by different dates:

lead createdAt
lead business date
sale createdAt
invoice dueDate
invoice updatedAt
transaction/payment timestamp

This produces mixed-period dashboard output.

8. Audit timestamps are being misused as business dates
createdAt should not be overwritten or repurposed to simulate business dates
System needs a proper canonical date model
9. Cross-module stale state / sync issues
After invoice payment, sale detail, dashboard, invoice list, and related metrics may not stay aligned
Existing filter work does not solve incorrect domain logic by itself
Goal

Implement a consistent business-date and payment-state model so that:

Backdated leads, sales, and invoices appear in the correct reporting period
Installment sales behave correctly
Partial payments are represented clearly
Sale status transitions are deterministic and correct
Dashboard metrics reconcile properly under the new filter system
Revenue / collected / outstanding are all clearly defined and correctly computed
Frontend and backend remain in sync after mutations
Required Implementation Areas
A. Canonical Date Model

You must introduce or normalize a clear date strategy across the system.

Requirements

Define and use distinct concepts for:

Audit timestamp
when the record was actually created in the database
should remain createdAt
Business/reporting date
when the lead/sale/invoice should belong for reporting purposes
Payment timestamp
when cash was actually collected
Due date
when an invoice is due
Expected Rules
Leads

Use a canonical business/reporting date for lead analytics.

If leadDate exists and is intended as business date, dashboard and reporting should use it
createdAt should remain audit-only unless business rules clearly require otherwise
Sales

Introduce or properly use a canonical business/reporting date such as saleDate.

Do not rely on overwriting createdAt
Do not treat createdAt as the reporting date
Preserve real record creation timestamps
Invoices

Clarify:

invoice issue/reporting date
invoice due date
payment timestamp

If the current model is missing an invoice business/reporting date, add or derive it cleanly.

Important

Do not ship a half-fix where some analytics still use createdAt and others use business dates. Standardize it properly.

B. Sale Payment State Model

You must implement a clear and reliable payment-state representation for sales.

Problem

A sale’s commercial lifecycle status and payment/collection status are currently mixed or incomplete.

Required Outcome

Support the equivalent of:

unpaid
partially paid
fully paid

This can be implemented as:

a dedicated paymentStatus field, or
an expanded saleStatus model, if that is cleaner for the existing architecture
Important Rule

Do not force unrelated lifecycle meanings into one ambiguous field.

For example:

commercial status might mean draft / pending / active / completed / cancelled
payment status might mean unpaid / partially paid / paid

These may need to be separate.

Required Behavior

For a sale total of 500:

paid 0 → unpaid
paid 250 → partially paid
paid 500 → paid

This logic must be derived from actual related invoices/payments, not guessed from one UI action.

C. Unified Payment Handling

There must be one canonical payment workflow regardless of where payment is recorded from.

Current Problem
Paying via invoice module and sales module produces different sale outcomes
Required Fix

Refactor payment handling so that all payment operations flow through shared domain logic.

Required Behavior

Whenever an invoice payment is recorded:

invoice status updates correctly
payment/transaction record is created correctly
sale collected amount updates correctly
sale outstanding amount updates correctly
sale payment state updates correctly
sale lifecycle status updates only if business rules say so
dashboard-related queries become consistent
Important

Do not duplicate business logic in multiple controllers/services.
Centralize it.

D. Installment and Invoice Generation Logic

Fix installment behavior so it correctly reflects business intent.

Requirements

For installment sales:

invoice schedule should be based on the correct business date / configured schedule
not blindly based on “today” unless that is explicitly the desired rule
Example Scenario

Sale date = November 15, 2025
Amount = 500
Installments = 2
Expected financial meaning:

250 upfront
250 later

The implementation should support this consistently.

You Must Decide

After exploring the code, implement the most correct model based on existing architecture:

Either:

Explicit installment schedule generation from sale date, or
Configurable installment due dates, or
A well-defined “upfront + monthly interval” rule

But it must be deterministic and business-date aware.

Important

If the existing UI only supports equal splits, keep equal split if needed, but make due-date generation correct and transparent.

E. Dashboard Metric Definition Cleanup

Now that filters exist, fix the metric definitions underneath.

The dashboard must clearly and correctly distinguish:

1. Booked Revenue

Value of sales booked in the selected reporting period

2. Collected Cash

Actual payments collected in the selected period

3. Outstanding Receivables

Amounts still unpaid as of current state or within selected scope, depending on widget definition

4. Overdue Amount / Count

Invoices past due and unpaid

5. Lead Creation

Use lead business date/reporting date consistently

6. Lead Conversion

Use an explicit and correct conversion timing rule

7. Sales Count

Use business/reporting date consistently

8. Brand/Breakdown Charts

Must align with the same reporting rules as revenue/sales metrics

Important

Do not leave the dashboard in a state where:

revenue card uses one logic
chart uses another
invoice widget uses a third
payment widget uses a fourth

Standardize and document the definitions.

F. Lead Conversion Date / Timing

Current analysis showed that conversion may be inferred from current state rather than a proper conversion date.

Fix this.

Required Outcome

There must be a reliable way to determine:

when a lead was created
when it was converted
whether it is currently converted

For dashboard analytics and filtered reporting:

lead creation metrics should use lead business date
lead conversion metrics should use an explicit conversion timestamp/date

If the schema currently lacks this, add the appropriate field and wire it correctly.

G. Backdated Entry Support

The system must support this properly:

User enters data today, but assigns it to November 2025.

Required Behavior

If a user intentionally backdates:

lead reporting should use the lead business date
sale reporting should use the sale business date
invoice reporting should use invoice business/reporting date
collected cash should still use actual payment date
overdue logic should still use due date vs current time

This distinction is critical and must be preserved.

H. Frontend Updates

Implement all required frontend changes to reflect the corrected backend/domain logic.

Required Areas
types/interfaces
detail screens
list screens if needed
dashboard widgets
sales/invoice status badges
payment summaries
any forms affected by the new date/status model
UI Requirements

Users must be able to clearly understand:

sale total
collected amount
outstanding amount
payment state
lifecycle status
business date vs due date vs paid date where relevant
Important

Do not hide complexity by leaving ambiguous labels.
Make the display explicit.

I. Query Invalidation / Consistency

Ensure that after the business-logic fix:

paying an invoice updates relevant queries
sale detail refreshes correctly
invoice detail refreshes correctly
dashboard analytics refetch or invalidate correctly
stale partial cache writes do not leave UI inconsistent

If needed, replace unsafe direct cache patching with invalidate-and-refetch where appropriate.

Exact Scenario That Must Work Correctly

Use this as a verification scenario during implementation:

Today’s actual date: March 29, 2026
Lead business date: November 15, 2025
Sale business date: November 15, 2025
Sale total: 500
Installments: 2
First invoice: 250
Second invoice: 250
First invoice paid today (March 29, 2026)
Second invoice unpaid
Expected Correct Outcome

After your implementation:

Lead
appears in November 2025 lead creation reporting
not in March 2026 lead creation reporting unless the business rule explicitly says otherwise
Sale
appears in November 2025 sales/booked reporting
not in March 2026 booked reporting just because it was entered later
Payment
250 appears in March 2026 collected-cash reporting
not November 2025 collected-cash reporting
Sale financial state
total = 500
collected = 250
outstanding = 250
payment state = partially paid
Sale lifecycle status

Must follow the domain rule you implement, but it must be explicit and not inconsistent across payment paths.

Invoice state
first invoice = paid
second invoice = unpaid
overdue only if due date has passed
Dashboard

Should be able to show, under the new filters:

November 2025 booked sale activity
March 2026 collected payment activity
consistent outstanding / overdue state
correct lead timing
correct conversion timing
Implementation Constraints
You must:
explore the codebase thoroughly
implement end-to-end changes
migrate existing logic carefully
keep the solution production-ready
Do not:
fake correctness by only changing labels
keep using overwritten createdAt as business date
patch only dashboard queries while leaving domain logic broken
make payment logic diverge across modules
introduce unclear metric definitions
Data Migration / Compatibility

If schema changes are needed, handle them properly.

If you add fields such as:
saleDate
convertedAt
paymentStatus
invoice reporting date field
collected/outstanding derived helpers

Then also:

update DTOs
update shared types
update Prisma/schema models
write migrations if applicable
ensure existing records are handled sensibly
Migration expectation

Where old data relied on overwritten createdAt, you may need a compatibility strategy.
Implement the safest practical approach and document assumptions.

Deliverables

After implementation, provide:

1. Change Summary

What was changed at domain, API, analytics, and UI level

2. File/Module List

Which backend/frontend files were updated

3. Business-Date Model

Explain the final chosen date model:

lead reporting date
sale reporting date
invoice reporting date
payment timestamp
due date
4. Payment-State Model

Explain:

how unpaid / partially paid / fully paid is determined
whether it is stored or derived
how lifecycle status interacts with payment status
5. Dashboard Metric Definitions

Define exactly what each major widget now means:

booked revenue
collected
outstanding
overdue
leads
conversions
sales count
brand breakdown
6. Verification of the Exact Scenario

Show the final expected output for the November-2025 / March-2026 partial-payment scenario

7. Remaining Limitations

Anything unavoidable that still remains

Final Verification Checklist

Before finishing, verify all of the following:

Backdated lead shows in the correct reporting month
Backdated sale shows in the correct reporting month
Actual payment shows in the actual collection month
Installment due dates are generated correctly
Partial payment is represented correctly
Invoice payment and sales payment paths produce the same domain outcome
Dashboard widgets reconcile correctly under filters
Revenue vs collected vs outstanding are no longer conflated
createdAt remains an audit field, not a fake business-date substitute
Queries/cache stay consistent after mutations

Implement the full fix, not a partial workaround.