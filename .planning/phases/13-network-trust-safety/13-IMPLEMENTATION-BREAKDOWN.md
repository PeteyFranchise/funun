# Phase 13 Implementation Breakdown: Network Tab & Trust & Safety

**Status:** Draft planning breakdown
**Milestone:** v1.2 — Wave 4: The Green Room

## Goal

Make The Green Room safe enough to open. Members can manage their graph, block people, report harmful interactions, control profile visibility, and trust that verified badges are granted by admins only.

## Proposed Plan Waves

### Wave 1 — Contracts & Schema Planning

Plan:

- `13-01-PLAN.md` — Trust/safety contracts, schema additions, and RLS doctrine.

Acceptance focus:

- Reports are private by default.
- Block list remains directional and private to the blocker.
- Profile visibility has a server-side representation.
- Verified badge changes are admin-owned.

### Wave 2 — Network Tab

Plan:

- `13-02-PLAN.md` — Network tab API and UI for following, followers, connections, pending, and blocked list management.

Acceptance focus:

- Network lists are viewer-scoped.
- Pending request actions preserve Phase 10/11 state-machine rules.
- Block/unblock actions are deliberate and confirmable.

### Wave 3 — Hard Block Enforcement

Plan:

- `13-03-PLAN.md` — Block enforcement audit and retrofit across public profile, feed, search, DMs, follows, connections, wall, endorsements, and comments.

Acceptance focus:

- Blocked users cannot view the blocker's profile.
- Blocked users cannot message, follow, connect, comment, react, repost, or discover the blocker.
- The blocked party cannot learn "who blocked me" through direct list queries.

### Wave 4 — Reporting & Admin Review

Plan:

- `13-04-PLAN.md` — Member/message/profile reporting plus admin review queue.

Acceptance focus:

- Users can report visible profiles and messages.
- Admins can review, action, or dismiss reports.
- Report details never leak to reported users.

### Wave 5 — Verification & Profile Visibility Controls

Plan:

- `13-05-PLAN.md` — Verified badge grant/revoke and profile visibility settings.

Acceptance focus:

- Admin-only verified grant/revoke.
- Public vs connections-only profile visibility enforced server-side.
- `Open to` can be hidden from public views without deleting the user's settings.

## Key Technical Risks

- **Information disclosure:** Block and report data must be private.
- **Bypass paths:** Profile pages, search, feed, DMs, and interactions must agree on visibility.
- **Admin authority drift:** Verified badge must not become owner-editable.
- **RLS inconsistency:** Direct PostgREST access should not expose hidden profiles or reports.
- **State-machine collision:** Network tab actions must not break existing follows/connections/DM request flows.

## Recommended Sequencing

Do not implement Phase 13 until Phase 12 has review traction. The safe pre-work is complete when this folder exists and Thomas has the Phase 12 review packet.

