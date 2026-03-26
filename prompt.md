Do a **quick audit and fix of sidebar visibility** so all sidebar links are shown strictly according to permissions.

### Problem

Previously, **Admin** had sidebar links for:

* **GSuite**
* **Sales Teams**

Now these links are no longer showing in the sidebar for Admin.

This indicates the sidebar visibility logic may have been affected during the permission migration and needs to be reviewed carefully.

### Expected Behavior

Sidebar links should be displayed based on the user’s **actual permissions**, not on outdated role assumptions and not on broken/missing mapping logic.

### Required Check

Review the entire sidebar and verify for each sidebar item:

* which permission controls its visibility
* which roles currently have that permission
* whether Admin/Manager/Agent/custom roles are seeing the correct links
* whether any links disappeared incorrectly after the migration

### Focus Especially On

Check sidebar visibility for pages such as:

* GSuite
* Sales Teams
* Leads
* Clients
* Sales
* Invoices
* Packages
* Settings-related pages
* Inbox
* any other dashboard navigation item

### What to Fix

* If Admin has the required permission, the link must appear.
* If a role does not have the permission, the link should stay hidden.
* Sidebar rendering must stay fully aligned with backend permission model.
* Remove any broken assumptions, mismatched permission keys, or incorrect `PermissionGuard` usage.
* Verify both legacy roles and custom roles behave correctly.

### Expected Output

Please:

1. identify the permission used by each sidebar link
2. confirm which links are incorrectly hidden/shown
3. fix sidebar rendering to be fully permission-driven
4. verify Admin can see GSuite and Sales Teams again if their permissions allow it

### Important

This is a **quick check/fix first** before continuing with other module tasks.
The sidebar should be treated as part of the permission system and must remain consistent with actual access rights.
