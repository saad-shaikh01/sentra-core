Act as a senior backend engineer and system architect.

I need you to investigate an issue related to email-thread association with leads in our CRM system.

## Context

We have a Gmail integration that syncs emails (both sent and received) into our system. Emails are correctly syncing and visible in the Inbox.

We also have a Lead system. Each Lead has a detail view with an **Email tab**, where related conversations should appear.

## Problem

Emails are NOT appearing inside the Lead’s Email tab, even when they clearly exist in the system.

### Example scenario:

1. I had an existing email conversation with `xyz@gmail.com`
2. That conversation is already synced and visible in the Inbox
3. Later, I create a new Lead using the same email (`xyz@gmail.com`)
4. Expected: all past conversations with this email should appear inside the Lead’s Email tab
5. Actual: no emails are showing inside the Lead

## Key Questions to Investigate

1. **Email-to-Lead Linking Logic**

   * How are emails supposed to be linked to leads?
   * Is linking automatic (based on email address), or does it require manual linking?

2. **Auto-association behavior**

   * When a new Lead is created, does the system:

     * automatically associate past emails with the same email address?
     * or only associate emails created AFTER the lead exists?

3. **Data Model Analysis**

   * How are emails stored?
   * Do email records contain:

     * leadId?
     * contactId?
     * email address fields (from/to)?
   * What is the expected relationship between:

     * email ↔ contact
     * contact ↔ lead
     * email ↔ lead (direct or indirect)

4. **Missing Backfill / Linking**

   * If emails existed BEFORE the lead was created, is there any:

     * backfill process?
     * background job?
     * manual trigger?

   If not, why not?

5. **Manual Linking Capability**

   * Is there any backend support for manually linking emails to a lead?
   * If yes:

     * what API or method is used?
     * what data is required?
   * If no:

     * what would be the correct way to implement it?

6. **UI Dependency**

   * Currently, there is no visible UI to manually link emails to a lead
   * Should there be one?
   * Or should everything be automatic?

7. **Filtering Logic in Lead Email Tab**

   * When opening a Lead → Email tab:

     * what query is executed?
     * is it filtering by leadId?
     * or by email address?
     * or via contact relation?

   This is critical — identify exactly why emails are not showing.

8. **Root Cause**

   * Clearly identify why emails are not appearing:

     * missing association?
     * incorrect query?
     * missing backfill?
     * data model limitation?

9. **Proposed Fix**
   Provide a clear solution:

   * Should emails be auto-linked by email address?
   * Should there be a background job to backfill past emails when a lead is created?
   * Should we introduce a manual linking feature?
   * Should the Lead Email tab query be changed?

10. **Safe Implementation Plan**

* Suggest a fix that does NOT break:

  * existing email sync
  * Gmail integration
  * tracking system
  * existing data

## Expected Output

Please provide:

1. Current system behavior (how it works today)
2. Root cause of the issue
3. Data flow explanation (email → contact → lead)
4. Why emails are missing in the Lead Email tab
5. Recommended fix (with reasoning)
6. Any required backend changes (minimal and safe)
7. Optional: API or schema changes if needed

Be precise and technical. Do not assume — inspect the actual logic and explain it clearly.
