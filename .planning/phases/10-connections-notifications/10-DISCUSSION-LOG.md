# Phase 10: Connections & Notifications - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 10-Connections & Notifications
**Areas discussed:** Follow/Connect button layout, Connect ↔ Follow relationship, Notification panel behavior, Bell badge delivery mechanism

---

## Follow/Connect button layout

| Option | Description | Selected |
|--------|-------------|----------|
| Three buttons: Connect, Follow, Message | All three always visible side by side | ✓ |
| Connect + Message, Follow folds in | Follow becomes icon-only toggle | |
| Follow + Message, Connect is secondary | Connect in overflow/kebab menu | |

**User's choice:** Three buttons always visible.

| Option | Description | Selected |
|--------|-------------|----------|
| Connect → Pending → Connected | Incoming requests handled elsewhere | |
| Connect → Pending → Accept/Decline → Connected | Inline accept/decline on their profile if they requested you | ✓ |

**User's choice:** Inline Accept/Decline on the profile.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — click Pending to withdraw | Uses existing 'withdrawn' status | ✓ |
| No — pending requests are final | Simpler v1 | |

**User's choice:** Withdraw allowed.

| Option | Description | Selected |
|--------|-------------|----------|
| Bare request — no note field | Simplest v1 | |
| Optional short note | ~200 char cap textarea | ✓ |

**User's choice:** Optional short note. **Notes:** Requires a new `connections.note` column not present in migration 035 — captured as D-04 with a schema gap flag.

---

## Connect ↔ Follow relationship

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — accepting auto-follows both ways | Connection implies follow | ✓ |
| No — fully independent | Separate graphs, no cross-effects | |

**User's choice:** Auto-follow on accept.

| Option | Description | Selected |
|--------|-------------|----------|
| Allowed — unfollow is independent of connection | Follow/Connect separate after seed | ✓ |
| Blocked — must disconnect to unfollow | Locks follow state while connected | |

**User's choice:** Unfollow allowed independently.

| Option | Description | Selected |
|--------|-------------|----------|
| No — follow persists after disconnect | Simplest, consistent | ✓ |
| Yes — disconnect also unfollows both ways | Requires tracking auto-created vs manual follows | |

**User's choice:** Follow persists after disconnect. **Notes:** Disconnect itself isn't a Phase 10 requirement — this decision is forward-looking for whenever it's built (likely Phase 13).

---

## Notification panel behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown from the bell | Floating panel anchored to icon | ✓ |
| Dedicated /notifications page | Full page navigation | |

**User's choice:** Dropdown.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit 'mark all read' button only | Matches NOTIF-03 wording | ✓ |
| Auto-clears on open | Simpler interaction | |

**User's choice:** Explicit mark-all-read only.

| Option | Description | Selected |
|--------|-------------|----------|
| Inline Accept/Decline buttons on the row | No panel click-through | ✓ |
| Click-through to profile only | Consistent single place to respond | |

**User's choice:** Inline Accept/Decline on the notification row.

| Option | Description | Selected |
|--------|-------------|----------|
| Recent N with 'load more' | Simple pagination | ✓ |
| Fixed recent window, no pagination | Simplest to build | |

**User's choice:** Recent N with load-more.

---

## Bell badge delivery mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Realtime + slow poll fallback (reuse DmWidget pattern) | Instant updates via Supabase Realtime + 20-30s poll reconcile | ✓ |
| Polling only | Simpler, less snappy | |

**User's choice:** Realtime + slow poll fallback.

| Option | Description | Selected |
|--------|-------------|----------|
| Global — subscribe wherever the topbar renders | Badge always accurate app-wide | ✓ |
| Only while panel is open, poll otherwise | Mirrors DmWidget exactly | |

**User's choice:** Global subscription.

---

## Claude's Discretion

- Notification-type catalog/discriminated union shape (so Phase 11 can extend it without rework)
- Where the global realtime subscription for the bell badge lives architecturally
- Exact column/constraint shape for `connections.note`
- Per-notification-type deep-link targets
- Icon/visual treatment differentiating notification types (resolved during `/gsd-ui-phase`)

## Deferred Ideas

- Dedicated "Requests" list/tab for incoming connection requests — considered, not chosen; requests surface via profile + notification panel instead
- Disconnect / remove-connection action — not in Phase 10 scope; only its interaction with follow state was pre-decided (D-07)
- Full notification history page — recent-window + load-more chosen instead for v1
