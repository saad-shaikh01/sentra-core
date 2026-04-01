# Gmail Integration & Email Tracking — Product Overview
**Prepared for:** Client Stakeholders
**Classification:** Client-Facing Documentation

---

## 1. Overview of the System

### What It Does

The Gmail Integration connects your team's Gmail accounts directly into the Sentra CRM platform. Once connected, all your emails — both sent and received — are automatically pulled into the system, organized, and enriched with intelligent tracking data. Your team no longer needs to switch between Gmail and the CRM; everything lives in one place.

### Problems It Solves

- **Fragmented communication** — Emails are scattered across personal inboxes. The integration centralizes all client communication in one dashboard.
- **No visibility after sending** — You never knew if a recipient opened your email. The tracking system tells you exactly when, how often, and from what device.
- **Manual follow-up tracking** — Previously, reps had to remember who hadn't replied. The system automatically identifies conversations that need attention.
- **Lost context** — When a lead is reassigned, the new rep can see the full email history instantly.

### High-Level Workflow

1. A team member connects their Gmail account via a secure one-click authorization.
2. The system immediately imports up to 90 days of past emails in the background.
3. From that point on, new emails arrive in real time (within seconds).
4. Every outbound email sent through the CRM is automatically tagged for tracking.
5. The system continuously analyzes conversations and classifies them into smart tabs for easy prioritization.

---

## 2. Email Syncing & Processing

### Initial Import (Backfill)

When a Gmail account is first connected, the system performs a **90-day backfill** — it reaches back in time and imports all emails from the past three months. This gives your team an immediate, complete view of recent conversations without any manual work.

This import happens silently in the background. Depending on the volume of emails, it may take a few minutes to complete. A progress indicator is shown in the interface.

### Real-Time Updates

After the initial import, the system uses **Google's push notification service** to receive new emails in near real-time. As soon as an email arrives in Gmail, the system is notified and processes it within seconds.

As a fallback, the system also runs a background check every 5 minutes to catch anything that may have been missed — ensuring no email is ever lost even if the real-time notification fails.

### How Emails Are Stored

Each email is stored with its full content — subject, body, sender, recipients, attachments, timestamps, and labels. Emails are grouped into **threads** (conversations), so a back-and-forth exchange with a client appears as a single organized conversation rather than individual messages.

Every time a new message arrives in an existing conversation, the thread is updated automatically — its status, participants, and summary are refreshed.

---

## 3. Tracking Features

### What Gets Tracked

The system provides four categories of tracking, each giving you a different layer of insight:

#### Open Tracking
When you send an email through the CRM, a tiny invisible element is embedded in the email. When the recipient opens the email, the system records:
- The date and time of the open
- How many times the email was opened
- Whether the open appears to be a real human (vs. an automated security scanner)

The system is smart enough to distinguish between **genuine human opens** and **automated scans** (e.g., corporate email security filters). Only real opens are counted toward engagement scores.

#### Reply Detection
The system automatically detects when a recipient replies to one of your emails — even if the reply arrives days later. This feeds directly into the conversation status and removes the thread from your "waiting for reply" list.

#### Bounce Detection
If an email cannot be delivered (wrong address, full inbox, server rejection), the system detects the bounce notification and marks the original email accordingly. You'll see immediately which emails failed to reach their destination.

#### Delivery State Tracking
Every outbound email passes through several stages:
- **Sent** — Email left your account successfully
- **Delivered** — No bounce detected (presumed delivered)
- **Bounce Detected** — A delivery failure notice was received
- **Send Failed** — The email could not be sent at all

### What Events Are Captured

The system records a complete audit trail of events for every email:

| Event | When It's Recorded |
|---|---|
| Email Sent | The moment an email is dispatched |
| Email Opened | Each time the recipient opens the message |
| Reply Received | When an inbound message is detected in a tracked thread |
| Bounce Detected | When a delivery failure notice arrives |
| Send Failed | When the system cannot dispatch the email |

### Why Tracking Matters (Business Value)

- **Know who's engaged** — See which clients are opening and reading your emails, so your team can prioritize the right conversations.
- **Stop chasing cold leads** — If someone hasn't opened your email in 7 days, the system surfaces it automatically so you can follow up.
- **Protect your reputation** — Bounce detection tells you immediately when you're emailing bad addresses, so you can clean your contact list.
- **Prove your outreach** — Management can see exactly how many emails were sent, opened, and replied to — no more guessing.

---

## 4. Sidebar Tabs Explained

The sidebar organizes all your email conversations into smart tabs. Each tab uses specific criteria to decide which conversations belong there.

---

### All Mail
**What it shows:** Every conversation — sent and received — that has not been archived.
**Use it for:** Getting a complete picture of all active communication.

---

### Unread
**What it shows:** Conversations that contain at least one message you haven't read yet.
**Logic:** Any thread where an unread message exists.
**Example:** A client replied to your proposal last night — it appears here until you open it.

---

### Sent
**What it shows:** Conversations where your team has sent at least one outbound email.
**Use it for:** Reviewing all outgoing communication and tracking follow-up status.

---

### Fresh
**What it shows:** Conversations where you sent an email and are still within the normal reply window (typically 2 days).
**Logic:** You sent an email recently, no reply yet, but it's too early to worry.
**Example:** You emailed a client this morning — it sits in "Fresh" until they reply or the window expires.

---

### Waiting
**What it shows:** Conversations where you sent an email but haven't received a reply, and the normal reply window has passed (2–7 days).
**Logic:** The conversation has gone quiet but isn't yet classified as ghosted.
**Example:** You sent a follow-up 4 days ago with no response — it moves here from "Fresh."

---

### Ghosted
**What it shows:** Conversations where you sent an email but received no reply for more than 7 days.
**Logic:** The silence window has expired. The contact has likely disengaged.
**Example:** A prospect you emailed 10 days ago hasn't replied. The deal may need a different approach.

---

### Replied
**What it shows:** Conversations where the recipient has responded to your most recent outbound email.
**Logic:** An inbound message was received after your last sent email.
**Example:** A client confirmed the meeting — the thread moves from "Fresh" to "Replied."

---

### Needs Follow-Up
**What it shows:** Conversations the system has identified as urgently needing attention — overdue replies, high-value contacts going silent, etc.
**Logic:** A combination of silence duration, engagement score, and last outbound activity.
**Use it for:** Daily prioritization. Start your day here.

---

### Hot Lead
**What it shows:** Conversations where the recipient has shown strong engagement signals — multiple opens, quick replies, consistent activity.
**Logic:** High engagement score based on open frequency, reply speed, and recency.
**Example:** A prospect opened your proposal 5 times in 2 days — they're clearly interested.

---

### Overdue
**What it shows:** Conversations where silence has exceeded the expected reply time based on the contact's historical behavior.
**Logic:** The system learns how long each contact typically takes to reply and flags conversations that are running beyond that pattern.

---

### Opened (No Reply)
**What it shows:** Conversations where the recipient opened the email but has not yet replied.
**Use it for:** Identifying warm leads who are interested but haven't taken action yet. Perfect for a gentle nudge.

---

### Opened
**What it shows:** Any conversation where at least one open event was detected.

---

### Unopened
**What it shows:** Tracked emails that have not been opened yet.
**Use it for:** Identifying conversations where your email may not have landed well, or the subject line needs improvement.

---

### Bounced
**What it shows:** Conversations where a delivery failure (bounce) was detected.
**Action needed:** The contact's email address should be reviewed and updated.

---

### Failed
**What it shows:** Emails that could not be sent at all due to a system or authentication error.
**Action needed:** Review and retry sending.

---

### Suspicious Opens
**What it shows:** Conversations where open events were detected but flagged as likely automated (security scanners, link-preview bots, etc.).
**Why it matters:** Prevents false positives — you won't mistake a corporate security scanner for genuine client interest.

---

### Archived
**What it shows:** Conversations you have manually archived (removed from the active inbox).
**Logic:** Archived threads are excluded from all other tabs.

---

## 5. Email Lifecycle

Here is the full journey of a single email, from the moment it's sent to its final classification:

```
1. COMPOSED & SENT
   └─ Rep writes email in CRM and hits Send
   └─ System dispatches via Gmail API
   └─ Tracking pixel embedded automatically (if tracking enabled)
   └─ "Sent" event recorded
   └─ Thread status → "Fresh"

2. DELIVERY
   └─ Email reaches recipient's inbox (no bounce = presumed delivered)
   └─ If bounce arrives → "Bounce Detected" event recorded
   └─ Thread status → "Bounced"

3. TRACKING (if recipient opens)
   └─ Open pixel fires when email is opened
   └─ System checks: Is this a real human or a scanner?
   └─ Human open → engagement score increases
   └─ Thread appears in "Opened" and possibly "Hot Lead"

4. WAITING FOR REPLY
   └─ No reply within 2 days → Thread moves to "Waiting"
   └─ No reply within 7 days → Thread moves to "Ghosted"
   └─ Opened but no reply → Thread appears in "Opened No Reply"

5. REPLY RECEIVED
   └─ Inbound email detected in the thread
   └─ "Reply Detected" event recorded
   └─ Thread status → "Replied"
   └─ Removed from "Waiting" / "Ghosted"

6. ONGOING
   └─ System re-evaluates thread status every sync cycle
   └─ Intelligence scores updated based on new activity
   └─ Alerts triggered if configured (e.g., hot lead alert, overdue alert)
```

---

## 6. Real-Time vs. Background Processing

| Feature | Timing | Notes |
|---|---|---|
| New email notification | Within seconds | Via Google Push Notifications |
| Open tracking | Within seconds | Pixel fires on email open |
| Reply detection | Within seconds to 5 minutes | Push + background polling |
| Initial 90-day import | 1–10 minutes | Background job, one-time per account |
| Intelligence scoring | A few seconds after each email | Runs after every sync cycle |
| Gmail watch renewal | Every 6 days | Automatic, no action needed |
| Fallback polling | Every 5 minutes | Catches anything missed by push |

---

## 7. Edge Cases & Important Behaviors

### What if syncing is delayed?
The system has a 5-minute background polling fallback. Even if Google's push notification is delayed or fails, the system will catch up within 5 minutes. No emails are permanently lost.

### What if an email is opened by a security scanner?
The system automatically identifies known corporate email security tools (e.g., Microsoft SafeLinks, Barracuda, Proofpoint) and marks those opens as "suspicious." They are excluded from engagement scores so your data remains accurate.

### What if tracking data is missing?
If an email was sent without tracking enabled, or the tracking pixel was blocked by the recipient's email client (some clients block remote images), the system simply shows no open data. The email is still synced and visible — only the open tracking is unavailable.

### What if the Gmail token expires?
Gmail access tokens refresh automatically in the background. If a refresh fails (e.g., the user changed their Google password), the system marks the account as degraded and alerts the team. Re-connecting the account via the Settings page restores full functionality.

### What if the same email is processed twice?
The system is designed to be idempotent — processing the same email multiple times produces the same result. There is no risk of duplicate records.

---

## 8. Business Value Summary

| Capability | Business Benefit |
|---|---|
| 90-day backfill on connect | Immediate access to all recent conversations — no history gap |
| Real-time email sync | Your team always has the latest information |
| Open tracking | Know who's reading your emails and when |
| Reply detection | Automatic follow-up status — no manual tracking needed |
| Bounce detection | Keep your contact list clean and your sender reputation healthy |
| Smart tabs (Fresh/Ghosted/Hot Lead) | Prioritize the right conversations without sifting through hundreds of emails |
| Engagement scoring | Identify your warmest leads at a glance |
| Needs Follow-Up tab | Never let an important conversation fall through the cracks |
| Full email history per contact | Any team member can instantly see the full communication history |
| Suspicious open filtering | Trust your engagement data — no false positives from bots |

---

*This document reflects the current capabilities of the Sentra Gmail Integration module. Features are subject to enhancement in future releases.*
