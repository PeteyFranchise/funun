# Phase 11: Presence & Messaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 11-presence-messaging
**Areas discussed:** DM widget scope & inbox, Message-request flow, Rate limit behavior, Presence semantics

---

## DM widget scope & inbox

| Option | Description | Selected |
|--------|-------------|----------|
| Global widget + thread list | LinkedIn-style floating messenger on every page | |
| Profile widget + /messages page | Keep widget profile-scoped, add separate full-page inbox | |
| Profile widget only + badge | Minimal: no inbox anywhere | |

**User's choice:** Free text — first asked "which is a closer experience to instagram or facebook?"; after mapping (Facebook = floating widget, Instagram = messages page), chose **"a solid hybrid of both."**

Follow-up questions within this area:

| Question | Options | Selected |
|----------|---------|----------|
| Hybrid split of responsibilities | Widget primary, page = expanded view / **Page primary, widget = quick access** / Both full-featured | Page primary |
| Entry points (topbar icon, profile Message button) | Icon → widget, Message → widget / Icon → page, Message → widget / **Both → page** | Both → page |
| When the floating widget appears | **Pop-out from the page** / Auto-dock on navigate / Always-present collapsed bar | Free text: "1 for desktop. Mobile version can feel more like instagram" — pop-out dock on desktop, no widget on mobile |
| /messages desktop layout | **Two-pane** / Single-pane | Two-pane |
| When a conversation counts as read | **Auto-read on open** / Read on reply only | Auto-read on open |
| What the badges count | **Threads with unread** / Total unread messages | Threads with unread |
| Inbox search depth | **People search only** / People + message content / No search this phase | People search only |

**Notes:** User requested more questions after the first four — this area got the deepest treatment (8 questions).

---

## Message-request flow

| Question | Options | Selected |
|----------|---------|----------|
| What IS a request, sender-side | **First message = the request** / Request first, message after | First message = the request |
| Where the recipient acts | **Requests section + notification** / Notification panel only / Mixed into inbox | Requests section + notification |
| Block scope this phase | **Minimal block action now** / Defer block to Phase 13 | Minimal block action now |
| Decline semantics | **Silent decline** / Silent + locked / Notified decline | Silent decline |

**User's choice:** All recommended options.
**Notes:** Grandfathering of existing non-connection threads was flagged as an open sub-question; user chose "Next area," explicitly delegating it to Claude's discretion (default: existing threads keep working; gate applies to new threads only).

---

## Rate limit behavior

| Question | Options | Selected |
|----------|---------|----------|
| Weekly window mechanics | **Rolling 7 days** / Calendar week reset | Rolling 7 days |
| Sender experience | **Counter + friendly wall** / Silent until blocked | Counter + friendly wall |
| What counts against the 10 | **Every request counts** / Accepted requests refund | Every request counts |
| The number itself | 10/week, everyone / **10/week, verified higher** / Lower (5/week) | 10/week, verified higher (~30 default) |
| Admin visibility this phase | **No admin UI yet** / Simple limit-hits log | No admin UI yet |
| Messages into a pending request | One message until accepted / **A few messages allowed (e.g. 3)** | A few messages allowed (~3) |

**Notes:** User requested a second round of questions here (admin view, pending sends). Chose a non-recommended option once: verified members get a higher cap rather than a uniform limit.

---

## Presence semantics

| Question | Options | Selected |
|----------|---------|----------|
| "Active X ago" precision | **Coarse buckets + cutoff** / Exact relative time / Active now only | Coarse buckets + ~7-day cutoff |
| Dot surfaces this phase | **Profile + all messaging surfaces** / Profile + DM header only / Everywhere avatars render | Profile + all messaging surfaces |
| Privacy | **Visible to all, no toggle yet** / Toggle ships now / Connections see more | Visible to all, no toggle yet |
| What counts as active | **App open + tab visible** / App open, even backgrounded | App open + tab visible |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Grandfathering existing non-connection threads (default: keep working; gate new conversations only)
- Exact verified rate cap (~30/week) and constants' home
- `last_seen_at` storage location, write throttling, column-privilege treatment
- Message-request state modeling (table/status shape)
- Pop-out widget state persistence + desktop/mobile breakpoint
- `new_dm` notification firing rules (avoid spam while honoring NOTIF-01)
- Requests empty states, preview truncation, exact "Active X ago" bucket boundaries
- Realtime Presence channel topology + concurrent-connection budget confirmation (carried from STATE.md pending todos)

## Deferred Ideas

- Message-content full-text search in the inbox
- "Show my online status" privacy toggle → Phase 13 (with SAFETY-04)
- Admin cold-outreach/limit-hits dashboard → Phase 13
- Full block UX (profile block, blocked list, unblock, search exclusion) → Phase 13 (SAFETY-01)
- Typing indicator → PRESENCE-04, already v1.x-deferred in REQUIREMENTS.md
