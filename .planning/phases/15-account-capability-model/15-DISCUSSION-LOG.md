# Phase 15: Account Capability Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 15-account-capability-model
**Areas discussed:** Capability request/grant flow, Multi-capability navigation, Badges vs. capability relationship, Existing account handling

---

## Capability request/grant flow

| Option | Description | Selected |
|--------|-------------|----------|
| Self-serve request + admin approval | User requests from their own account; admin reviews via /admin/members-style surface | ✓ |
| Fully open self-serve | User toggles the second capability themselves, no review | |
| Admin-only, both directions | Nobody self-requests; only staff grants any change | |

**User's choice:** Self-serve request + admin approval.
**Notes:** Follow-up established the gate should be asymmetric — industry→artist instant (no verification exists anywhere today for artist signup), artist→industry admin-reviewed (matches today's invite-only trust gate). Also decided: build a full in-app request UI + admin queue this phase (not informal/out-of-band), and keep curators deliberately separate (not folded in as a third capability).

| Option | Description | Selected |
|--------|-------------|----------|
| Asymmetric: industry→artist instant, artist→industry needs approval | Matches today's actual trust bar exactly | ✓ |
| Symmetric: both directions need approval | Simpler mental model, adds an unnecessary wait step | |

| Option | Description | Selected |
|--------|-------------|----------|
| In-app request + admin queue | Real UI extending /admin/members pattern | ✓ |
| Informal request, admin grants directly | No new request UI, admin flips capability manually | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep curators separate | Wave 3 isolated curators deliberately; folding in now is new scope | ✓ |
| Scope this phase to include curator as a third capability | Real scope increase | |

---

## Multi-capability navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Mode switcher | Workspace-style toggle between Artist view and Industry view, both layouts untouched | |
| Unified nav showing both | Single sidebar/topbar showing everything at once | ✓ |

**User's choice:** Unified nav — specifically, unify around the existing `ArtistNav.tsx` left-sidebar pattern, retiring `app/(industry)/layout.tsx`'s separate topbar nav entirely.
**Notes:** User gave explicit freeform direction mid-discussion: "We need a unified nav bar, the left sidebar makes a lot of sense for most of the rooms, if not all. Things like 'Split Sheets' can live inside a room like 'Contract Locker' which should be already in the left sidebar." Confirmed via codebase check: `Contract Locker` (`/contracts`) and `Antenna` (`/antenna`) already exist in `ArtistNav.tsx`'s `ITEMS` array. Industry's 3 topbar links (`Opportunities`, `Split Sheets`, `Post`) fully redistribute: Split Sheets → Contract Locker, Opportunities + Post → fold into existing Antenna room.

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into existing Antenna room | Antenna already sits in the sidebar for artist browse/apply; grows a Post/Manage section | ✓ |
| Separate sidebar item for industry actions | New distinct "My Postings" item, kept apart from artist-facing Antenna | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hide what doesn't apply | Matches Phase 14's hide-when-absent convention | ✓ |
| Show everything, disable what doesn't apply | Full sidebar always visible, dead-end items grayed out | |

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle sidebar entry point | Low-key item near Settings/profile footer opens the request flow | ✓ |
| Settings page only | No sidebar presence, found only by users who go looking | |

---

## Badges vs. capability relationship

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-suggest a badge on grant | Pre-selects a role badge from the same request; mirrors createIndustryMember() today | ✓ |
| Fully independent, no auto-suggestion | Capability grants and badges never interact | |

| Option | Description | Selected |
|--------|-------------|----------|
| Collect at request time | Request form asks "which role(s)?" up front, reusing MembersAdmin.tsx's chip picker | ✓ |
| Collect after approval | Badge selection happens in a separate follow-up step | |

---

## Existing account handling

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-preserve as their one existing grant | Migration converts each member_type value into that same capability; zero behavior change | ✓ |
| Let Claude/researcher decide the exact mechanism | Confirms this is purely a migration mechanics detail | |

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope for this phase | Revocation is Trust & Safety territory (Phase 13), not identity-model | ✓ |
| Build revocation now too | Symmetric admin-side revoke action added this phase | |

---

## Claude's Discretion

- Exact schema mechanism for the capability set (array column vs. join/grants table) — migration mechanics, not a product decision
- Exact UI copy/layout for the admin approval queue — follow existing `/admin/members` conventions
- Exact UI copy/placement for the sidebar's subtle capability-request entry point

## Deferred Ideas

- Curator unification as a third grantable capability — explicitly deferred, curators stay separate
- Capability revocation UI — explicitly deferred to Phase 13 (Trust & Safety) territory or a later phase
