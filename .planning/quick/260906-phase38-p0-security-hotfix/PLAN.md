---
quick_id: 260906-5p9
slug: phase38-p0-security-hotfix
date: 2026-09-06
type: security-hotfix
autonomous: false
migration: 187
source: Codex adversarial review 2026-09-06; findings F1, F7, F10 independently re-verified by the orchestrator
---

# Phase 38 — P0 security hotfix

Closes the three findings that make the shipped workspace layer dangerous. Everything else from
the review (F2, F3, F4, F5, F6, F8, and the mediums) is deferred to Phase 38.0.1 — those are
authorization-MODEL changes needing their own discussion, not patches.

**Migration 187 is this hotfix. 188 is reserved for the separate pre-existing F3 fix.
Phase 38.2's reservation moves to 189–190.**

## F1 — CRITICAL: a workspace admin can unilaterally take record custody

**Verified:** `lib/workspaces/custody-transfer.ts` `assertMayOffer` returns ok for "an active
owner/admin of a workspace that holds a LIVE attachment" — someone who is NOT the custodian. The
same actor can then accept their own offer via `assertMayRespond`. One person performs both sides
of a transfer D-29 requires to be two-sided. Needs no grant, so it is live today.

### Task 1 — application layer
`lib/workspaces/custody-transfer.ts`

- **Delete the workspace owner/admin branch from `assertMayOffer` entirely.** Only
  `offeredByUserId === custodianId` may offer. Remove the now-unused membership/attachment lookup
  and the `canManageRoster` import if it becomes unused.
- Rewrite the header comment: workspace administration is ACCESS authority, never custody
  authority. A manager may not dispose of a Member's record. Cite D-29 and this review.
- Keep the `workspaceId` parameter (callers pass it, and it is still recorded for attribution),
  but it must no longer confer authority.
- In `assertMayRespond`, additionally refuse when the responder is the same user as the offerer —
  defence in depth, so a future offerer-widening cannot re-open self-dealing.

### Task 2 — database layer, migration 187
`supabase/migrations/187_custody_offer_requires_current_holder.sql` + `__tests__/migration-187.test.ts`

- Replace `guard_custody_transfer_offered_by_holder` so it requires BOTH:
  `NEW.offered_by = (SELECT user_id FROM public.vault_projects WHERE id = NEW.project_id)`
  AND `NEW.from_user_id = ` that same custodian. Raise `insufficient_privilege` with a message
  naming the rule. The DB must refuse the attack even if application code regresses.
- Idempotent `DROP TRIGGER IF EXISTS` / `CREATE OR REPLACE FUNCTION` shape, matching 182–186.
- Additive only: touch no other table, no policy, no live RLS branch.
- Header comment states 188 is reserved for the pre-existing `user_id` WITH CHECK fix and
  189–190 for Phase 38.2.
- Paired string-assertion test, matching the `__tests__/migration-18*.test.ts` convention.

### Task 3 — stale-custodian guard on accept
`app/api/vault/custody-transfers/route.ts`

- The accept branch updates `vault_projects` filtered by project id only. Add
  `.eq('user_id', transfer.from_user_id)` so an offer cannot overwrite a custodian who changed
  after the offer was made, and verify exactly one row was affected — return a conflict otherwise.
- This is the cheap half of review finding F9. Full transactional RPC is deferred to 38.0.1.

## F7 — HIGH: the kill switch does not cover service routes

**Verified:** `workspace_access_enabled()` gates only `workspace_project_permission`, i.e. the RLS
branch on five vault tables. `requireWorkspaceAccess` never reads the config, so with the switch
OFF every workspace service route still works — including the F1 custody chain. D-56 says the
control disables ALL workspace-derived access. **This was an orchestrator specification error, not
an executor error.**

### Task 4
`lib/workspaces/access.ts` (+ `lib/workspaces/access-kill-switch.ts` if a shared reader helps)

- `requireWorkspaceAccess` reads the `workspace_access_config` singleton FIRST, before any other
  work, and returns a 503-style refusal when `enabled` is false.
- **Fail closed:** a missing row, an unreadable row, or a query error must all deny — mirroring
  `workspace_access_enabled()`'s `COALESCE(..., FALSE)`.
- Because every workspace route funnels through `requireWorkspaceAccess`, this one change covers
  the route family. Verify that claim: list every route under `app/api/workspaces/**`,
  `app/api/roster/**` and `app/api/vault/custody-transfers` and confirm each one calls it. **Any
  route that does not must be named explicitly in the SUMMARY** — do not silently leave a gap.
- The leadership-only `app/api/admin/workspaces/access` route must keep working while disabled,
  or the switch cannot be turned back on. Exempt it deliberately and comment why.

## F10 — MEDIUM: invitation rate limiting is inverted

**Verified:** `check_rate_limit` (migration 116) returns TRUE *at or over* the limit and
deliberately does not record the blocked attempt. `app/api/workspaces/[workspaceId]/invitations/route.ts:79`
names that `withinLimit` and rejects on `!withinLimit`. Attempts 1–20 are refused while
accumulating hits; attempt 21 onward passes unlimited for the rest of the window. Every other
caller in the codebase — including Phase 38's own roster route — uses the direct polarity.

### Task 5
`app/api/workspaces/[workspaceId]/invitations/route.ts`

- Rename to `limited` and guard with `if (limited) return 429`, matching
  `app/api/workspaces/[workspaceId]/roster/route.ts:93`.
- Add a behavioral test asserting attempt 1 is ALLOWED and attempt max+1 is REFUSED. Do not mock
  the boolean — the ambiguous name is what caused this.

## Verification

- `npx tsc --noEmit` clean; full `npm test` green; `npx next lint` clean.
- A test proves a non-custodian workspace admin cannot offer a custody transfer.
- A test proves `requireWorkspaceAccess` denies when the config row is missing or disabled.
- Rate-limit behavioral test passes at attempt 1 and max+1.
- **Migration 187 is NOT pushed.** Owner checkpoint, as with every migration in this repo.

## Explicitly out of scope — Phase 38.0.1

F2 (view_summaries exposes whole child rows), F3 (edit_metadata → arbitrary writes; the `user_id`
WITH CHECK hole is pre-existing from 078 and gets its own migration 188), F4 (attachment survives
custody transfer), F5 (admin→owner self-promotion), F6 (grant model cannot bootstrap), F8
(self-declared authority evidence), F9 full transactional accept, F11–F22.
