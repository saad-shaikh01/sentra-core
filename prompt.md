Good. Now do the **final functional validation** of the completed permission-migration work.

### Goal

Do not summarize code changes again.
Instead, verify that the app now behaves correctly for both legacy roles and newly created custom roles.

### Validate These Scenarios End-to-End

#### 1. Custom Role Compatibility

Create at least:

* one custom role with sales-agent style permissions
* one custom role with manager-style permissions
* one limited view-only custom role

Then verify that these roles behave correctly without needing hardcoded role names.

#### 2. Leads Module

Validate:

* lead list access
* lead detail actions
* assign / unassign / claim / unclaim
* collaborator selection
* team visibility
* unassigned pool
* team-assigned but user-unassigned lead visibility
* conversion / new sale action visibility

#### 3. Sales Module

Validate:

* sales page access
* sales table action visibility
* sale detail actions
* create sale
* update sale
* mark active
* charge / record payment
* agent display
* client ownership checks
* dropdown/member selectors

#### 4. Invoices Module

Validate:

* invoice page access
* invoice detail access
* pay action
* agent/brand filters
* payment flow permissions

#### 5. Navigation / Settings / Other Frontend Areas

Validate:

* sidebar visibility
* inbox access
* packages/settings access
* client detail/client page management actions

### Special Check

There is still one `UserRole.FRONTSELL_AGENT` usage kept as a **data value** for an invite API call.
Confirm whether this is:

* safe and purely informational
* or still a hidden blocker for future custom roles

### Required Output

Provide:

1. passed scenarios
2. failed scenarios
3. any remaining hidden role assumptions
4. any custom-role limitations still left
5. final verdict: **is the app now truly custom-role compatible or not?**

Do not provide another implementation summary. Provide behavioral validation results only.
