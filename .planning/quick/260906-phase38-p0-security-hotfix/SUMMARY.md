---
quick_id: 260906-5p9
slug: phase38-p0-security-hotfix
type: security-hotfix
subsystem: workspaces
tags: [supabase, rls, postgres-trigger, rate-limiting, custody-transfer, workspace-access]

key-files:
  created:
    - supabase/migrations/187_custody_offer_requires_current_holder.sql
    - __tests__/migration-187.test.ts
    - app/api/workspaces/[workspaceId]/invitations/route.test.ts
  modified:
    - lib/workspaces/custody-transfer.ts
    - lib/workspaces/custody-transfer.test.ts
    - app/api/vault/custody-transfers/route.ts
    - lib/workspaces/access.ts
    - lib/workspaces/access.test.ts
    - lib/workspaces/access-kill-switch.ts
    - lib/workspaces/access-kill-switch.test.ts
    - app/api/admin/workspaces/access/route.ts
    - app/api/workspaces/[workspaceId]/invitations/route.ts

key-decisions:
  - "F1 fixed by DELETING the workspace owner/admin custody-offer branch, not narrowing it, at both the application layer and the database layer (migration 187), matching the plan's defence-in-depth mandate"
  - "F7's kill-switch check placed as the literal first statement in requireWorkspaceAccess, before the null-user check, so it fails closed (503) even for unauthenticated callers"
  - "F10's rate-limit test drives the real checkRateLimit() against a simulated RPC backend rather than mocking the boolean, per the plan's explicit instruction"

duration: ~7min (commit-to-commit)
completed: 2026-09-06
status: complete
---

# Phase 38 P0 Security Hotfix

**Closed a live custody-takeover path (F1, application + database layers), extended the D-56 workspace-access kill switch to cover service routes (F7), and corrected an inverted rate-limit polarity on workspace invitations (F10).**

## Performance

- **Duration:** ~7 min (commit range 04:16:39 -> 04:23:33)
- **Tasks:** 5 (all `type="auto"`, no checkpoints hit)
- **Files created:** 3
- **Files modified:** 9

## Accomplishments

- **F1 (CRITICAL, custody takeover):** `assertMayOffer` (`lib/workspaces/custody-transfer.ts`) no longer has any workspace-admin branch at all — only the project's current custodian may offer a custody transfer. The branch was deleted, not narrowed, along with the now-unused `workspace_members`/`workspace_attachments` lookups and the `canManageRoster` import. `assertMayRespond` additionally refuses self-resolution (responder === offerer) as defence in depth against any future re-widening.
- **F1 (database layer):** Migration 187 replaces `guard_custody_transfer_offered_by_holder()` so an INSERT into `workspace_custody_transfers` requires BOTH `offered_by` and `from_user_id` to equal the project's current custodian, read live from `vault_projects.user_id`. The workspace owner/admin exception from migration 185 is gone entirely. This is an independent second enforcement layer — the attack stays closed even if the application code regresses.
- **F1/F9 (stale-custodian guard):** The accept branch of `app/api/vault/custody-transfers/route.ts` now filters the `vault_projects` update by `.eq('user_id', row.from_user_id)` in addition to project id, and verifies exactly one row was affected (409 conflict otherwise) — the cheap half of F9; full transactional accept remains deferred to 38.0.1.
- **F7 (kill switch coverage):** `requireWorkspaceAccess` (`lib/workspaces/access.ts`) now consults a new fail-closed reader, `isWorkspaceAccessEnabled()` (`lib/workspaces/access-kill-switch.ts`), as the literal first statement — before the null-user check — and returns 503 when the D-56/WS-31 config is disabled, missing, or unreadable. Because every route under `app/api/workspaces/[workspaceId]/**` funnels through this one function, this single change covers the entire route family.
- **F10 (rate-limit polarity):** `app/api/workspaces/[workspaceId]/invitations/route.ts` renamed `withinLimit` to `limited` and switched the guard from `if (!withinLimit)` to `if (limited)`, matching `check_rate_limit`'s TRUE-at-or-over-limit semantics and the roster route's already-correct usage of the same RPC. A behavioral test drives the real `checkRateLimit()` against a simulated in-memory RPC backend through `maxAttempts + 1` real requests and asserts on actual HTTP status codes — verified to fail against the pre-fix polarity and pass against the fix (see Verification below).

## Task Commits

Each task was committed atomically:

1. **Task 1 (F1 — application layer):** `ccf6606b` — `fix(38-p0-hotfix): delete workspace-admin custody-offer branch (F1)`
2. **Task 2 (F1 — migration 187):** `bfa7e9a0` — `feat(38-p0-hotfix): migration 187 -- DB-layer custody offer guard (F1)`
3. **Task 3 (F1/F9 — stale-custodian guard on accept):** `66aeba6f` — `fix(38-p0-hotfix): stale-custodian guard on custody-transfer accept (F1/F9)`
4. **Task 4 (F7 — kill switch coverage):** `300763de` — `fix(38-p0-hotfix): kill switch now covers workspace service routes (F7)`
5. **Task 5 (F10 — rate-limit polarity):** `6c66394b` — `fix(38-p0-hotfix): correct inverted rate-limit polarity on invitations (F10)`

**Follow-up fix (Rule 3 — blocking, TypeScript):** `a7beedcc` — `fix(38-p0-hotfix): type the kill-switch service-client mock in access.test.ts` (see Deviations below).

## Files Created/Modified

- `supabase/migrations/187_custody_offer_requires_current_holder.sql` — new migration replacing the F1 database trigger. **Not pushed** (see below).
- `__tests__/migration-187.test.ts` — text-lock/structural test for migration 187, matching the `__tests__/migration-18*.test.ts` convention.
- `lib/workspaces/custody-transfer.ts` — `assertMayOffer` custodian-only rewrite; `assertMayRespond` self-dealing refusal.
- `lib/workspaces/custody-transfer.test.ts` — updated to remove tests of the deleted workspace-admin offer path; added self-dealing tests.
- `app/api/vault/custody-transfers/route.ts` — stale-custodian guard on accept; header comment updated for the F1/F7 posture.
- `lib/workspaces/access.ts` — `requireWorkspaceAccess` now consults the kill switch first; new `WORKSPACE_ACCESS_DISABLED` export; status union widened to include `503`.
- `lib/workspaces/access.test.ts` — mocks the service client for the kill-switch check; five new tests for disabled/missing/error/unauthenticated/enabled paths.
- `lib/workspaces/access-kill-switch.ts` — new `isWorkspaceAccessEnabled()` fail-closed reader (never throws, unlike `readWorkspaceAccessState`).
- `lib/workspaces/access-kill-switch.test.ts` — five new tests for `isWorkspaceAccessEnabled`.
- `app/api/admin/workspaces/access/route.ts` — comment documenting the deliberate exemption from its own kill switch.
- `app/api/workspaces/[workspaceId]/invitations/route.ts` — rate-limit polarity fix.
- `app/api/workspaces/[workspaceId]/invitations/route.test.ts` — new behavioral test for the rate-limit polarity.

## F7 Route-by-Route Verification

Per the plan's explicit instruction, every route under `app/api/workspaces/**`, `app/api/roster/**`, and `app/api/vault/custody-transfers` was checked for `requireWorkspaceAccess` usage:

**Call `requireWorkspaceAccess` (covered by the fix):**
- `app/api/workspaces/[workspaceId]/attachments/route.ts`
- `app/api/workspaces/[workspaceId]/grants/route.ts`
- `app/api/workspaces/[workspaceId]/invitations/route.ts`
- `app/api/workspaces/[workspaceId]/members/route.ts`
- `app/api/workspaces/[workspaceId]/projects/route.ts`
- `app/api/workspaces/[workspaceId]/roster/evidence/route.ts`
- `app/api/workspaces/[workspaceId]/roster/route.ts`

**Do NOT call `requireWorkspaceAccess` (verified deliberate, not a gap):**
- `app/api/workspaces/route.ts` — creates/lists workspaces; gated by `requireMemberApiAccount` only. There is no existing `workspaceId` to check membership against at creation time, and listing is RLS-filtered by the caller's own session client.
- `app/api/workspaces/invitations/accept/route.ts` — binds a pending seat to the accepting session's identity via a token; gated by `requireMemberApiAccount` only, since the accepting user is by definition not yet a member of the workspace.
- `app/api/roster/relationships/route.ts` — the Member's OWN roster surface (deliberately outside `/api/workspaces/**`, per its own header comment), gated by `requireMemberApiAccount` plus row-ownership comparison (`member_user_id === caller`). No workspace-derived authority is ever exercised here.
- `app/api/vault/custody-transfers/route.ts` — gated by `requireMemberApiAccount` only. After the F1 fix, `assertMayOffer` carries **zero** workspace-derived authority (only the custodian may offer), so there is nothing left for the kill switch to gate here. This is explicitly named in the plan and reconfirmed post-fix.
- `app/api/admin/workspaces/access/route.ts` — the leadership-only kill-switch control itself, gated by `requireStaff(['leadership'])`. Deliberately exempt so an owner can re-enable a disabled switch; documented inline per the plan's requirement.

No route was found calling `requireWorkspaceAccess`-equivalent logic through a different path that would have created a gap.

## Decisions Made

- F1's fix is a **deletion**, not a narrowed check, at both layers, per the hotfix's own instruction to prefer removing capability over adding a guard.
- The F7 kill-switch check runs before the null-user check in `requireWorkspaceAccess` so an unauthenticated caller is refused identically to an authenticated one when the switch is off — no code path can distinguish "disabled" from "not logged in" through timing or behavior differences.
- `isWorkspaceAccessEnabled()` was added as a **new, separate** function rather than reusing `readWorkspaceAccessState()`, because the two have incompatible failure contracts by design: the admin route needs a thrown error to report a genuine configuration problem to an operator; a request-path gate must never throw and must always fail closed to `false`.
- The F10 test intentionally avoids mocking `checkRateLimit`'s boolean return per the plan's explicit instruction; it simulates the real Postgres `check_rate_limit` RPC's counting semantics instead, and was verified (by temporarily reverting the fix) to fail against the buggy polarity and pass against the corrected one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript inference error in `lib/workspaces/access.test.ts`'s new kill-switch mock**
- **Found during:** Verification step (`npx tsc --noEmit`) after Task 4
- **Issue:** `jest.fn(async () => ({ data: { enabled: true }, error: null }))`'s inferred return type was too narrow to accept the `{ data: null, error: {...} }` variant used by later test cases in the same file, producing three `TS2322` errors.
- **Fix:** Added an explicit `Promise<{ data: ConfigRow; error: ConfigError }>` type parameter to the mock's `jest.fn<...>()` call.
- **Files modified:** `lib/workspaces/access.test.ts`
- **Verification:** `npx tsc --noEmit` clean; `lib/workspaces/access.test.ts` suite passes.
- **Committed in:** `a7beedcc`

---

**Total deviations:** 1 auto-fixed (blocking, TypeScript-only, no behavior change)
**Impact on plan:** No scope creep — a pure type-annotation fix required to make the F7 test suite compile.

## Explicitly Out of Scope (restated from PLAN.md — Phase 38.0.1)

Per the plan's own scope boundary, the following findings from the same adversarial review were **not** touched by this hotfix and remain deferred to Phase 38.0.1 as authorization-model changes:

- **F2** — `view_summaries` exposes whole child rows
- **F3** — `edit_metadata` permits arbitrary writes (the pre-existing `user_id` WITH CHECK hole from migration 078; claims migration 188, not touched here)
- **F4** — attachment survives custody transfer
- **F5** — admin -> owner self-promotion
- **F6** — grant model cannot bootstrap
- **F8** — self-declared authority evidence
- **F9 (full form)** — full transactional accept (only the cheap `.eq('user_id', ...)` mitigation was applied here)
- **F11-F22** — the remaining medium-severity findings

No new defects beyond the plan's five tasks were discovered during execution. Nothing additional is flagged here.

## Migration 187 — Owner Push Required

**Migration 187 was authored and text-tested but was NOT pushed to the remote database**, per this repo's standing rule (stated in the headers of migrations 078, 080, 136, 177, 181-186, and now 187 itself) and this hotfix's explicit `<CRITICAL_DO_NOT_PUSH>` constraint. No `supabase db push`, `supabase db reset`, or `supabase migration up` command was run at any point during this execution.

**Owner action required:** push `supabase/migrations/187_custody_offer_requires_current_holder.sql` to close the F1 database-layer gap. Until pushed, the application-layer fix (Task 1, already live once this commit ships) is the only enforcement point — still a substantial improvement over the pre-hotfix state, but the plan's defence-in-depth goal is not complete until 187 lands.

## Verification

- `npx tsc --noEmit`: clean.
- `npm test` (full suite): 474 test suites / 4818 tests, all passing.
- `npx next lint`: no warnings or errors.
- A dedicated test (`lib/workspaces/custody-transfer.test.ts`) proves a non-custodian workspace admin cannot offer a custody transfer, with or without a live attachment, with or without a `workspaceId`.
- A dedicated test (`lib/workspaces/access.test.ts`) proves `requireWorkspaceAccess` denies (503) when the kill-switch config row is missing, unreadable, or `enabled: false` — including for an unauthenticated caller.
- The rate-limit behavioral test (`app/api/workspaces/[workspaceId]/invitations/route.test.ts`) was manually verified to FAIL against the pre-fix inverted polarity (reverted temporarily, confirmed the test caught `429` on attempt 1 and `400` — meaning "allowed through" — on attempt 21) and PASS against the shipped fix.
- Migration 187 is NOT pushed (see above) — this is the plan's required checkpoint, not an oversight.

## Issues Encountered

None beyond the single TypeScript type-inference fix documented above.

## Next Phase Readiness

- The custody-takeover path (F1) is closed at the application layer immediately on merge, and at the database layer once the owner pushes migration 187.
- The D-56/WS-31 kill switch (F7) now genuinely disables all workspace-derived access when flipped off, with the leadership-only re-enable path deliberately preserved.
- The invitation rate limiter (F10) now enforces its intended 20-per-hour cap correctly.
- Phase 38.0.1 remains the correct home for F2-F6, F8, F9's full form, and F11-F22 — none of that authorization-model work was started or implied by this hotfix.

## Self-Check: PASSED

All 13 files created/modified by this hotfix were verified present on disk, and all 6 task/follow-up commits (`ccf6606b`, `bfa7e9a0`, `66aeba6f`, `300763de`, `6c66394b`, `a7beedcc`) were verified present in `git log`.

---

*Quick task: 260906-phase38-p0-security-hotfix*
*Completed: 2026-09-06*
