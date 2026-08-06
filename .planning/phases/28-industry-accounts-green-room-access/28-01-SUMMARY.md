---
phase: 28-industry-accounts-green-room-access
plan: 01
subsystem: capabilities-and-antenna-gating
tags: [industry-accounts, antenna, capability-grants, member_type, access-control]
dependency-graph:
  requires: []
  provides:
    - "Antenna POST /api/antenna/opportunities gate is satisfiable by an approved-industry account"
    - "grantCapability(industry) keeps user_profiles.member_type in lockstep with capability_grants"
  affects:
    - app/api/antenna/opportunities/route.ts
    - lib/capabilities/grant.ts
tech-stack:
  added: []
  patterns:
    - "Source-assertion (readFileSync text-guard) regression test, mirroring __tests__/migration-061.test.ts, applied to a route file instead of a migration"
    - "Idempotent conditional-spread UPDATE payload: `...(capability === 'industry' ? { member_type: 'industry' } : {})`"
key-files:
  created:
    - __tests__/antenna-industry-gate.test.ts
    - __tests__/capability-member-type-sync.test.ts
  modified:
    - app/api/antenna/opportunities/route.ts
    - lib/capabilities/grant.ts
    - __tests__/capability-grant.test.ts
decisions:
  - "capability_grants stays authoritative for capability checks; member_type is kept in lockstep with it going forward (this plan does not touch the other 6+ member_type read sites — deferred per the plan's own reconciliation-decision framing, mirroring the Phase 19/20 blast-radius split precedent)"
  - "industry_profiles table itself left untouched (out of scope); only the Antenna route's dead read of it was removed"
  - "industry_profile_id insert field dropped entirely rather than backfilled with a placeholder — the column is nullable (REFERENCES industry_profiles ON DELETE SET NULL) so omitting it is safe and matches RESEARCH's recommendation (a)"
metrics:
  duration: ~15min
  completed: 2026-08-06
status: complete
---

# Phase 28 Plan 01: Antenna Industry Gate + member_type/capability_grants Lockstep Summary

Removed the dead `industry_profiles` double-gate that made `POST /api/antenna/opportunities` a guaranteed 403 for every account, and made `grantCapability()` sync `user_profiles.member_type='industry'` on an approved industry grant so the account lane no longer silently drifts from the capability model.

## What Was Built

**Task 1 — Failing regression + unit tests (RED):**
- `__tests__/antenna-industry-gate.test.ts` — a source-assertion guard (readFileSync text check, mirroring `__tests__/migration-061.test.ts`) that asserts `app/api/antenna/opportunities/route.ts` no longer references `industry_profiles`, no longer writes `industry_profile_id`, and still contains the `hasCapability(user.id, 'industry')` gate.
- `__tests__/capability-member-type-sync.test.ts` — unit tests (mocked `createServiceClient`) asserting `grantCapability({capability:'industry',...})` issues a `user_profiles` update whose payload includes `member_type: 'industry'`, and `grantCapability({capability:'artist',...})` issues an update whose payload omits the `member_type` key entirely.

Both files ran RED against the pre-fix source, as expected.

**Task 2 — Remove the dead `industry_profiles` gate (INDUSTRY-01):**
- Deleted the `industry_profiles` lookup block and its `if (!profile) return 403` branch from the POST handler.
- Removed the `industry_profile_id: profile.id` field from the `opportunities` insert object (the column is nullable, `REFERENCES industry_profiles ON DELETE SET NULL` — confirmed via `supabase/migrations/009_antenna_notifications.sql:18` and `types/index.ts:665` (`industry_profile_id: string | null`)).
- Kept the `hasCapability(user.id, 'industry')` gate exactly as-is — it is now the single authoritative boundary.
- Left `app/(artist)/antenna/[opportunityId]/page.tsx`'s guarded `industry_profiles` detail-page read untouched (out of scope; it already no-ops gracefully via `if (opportunity.industry_profile_id)`, which will now always be null for new opportunities).
- Did not drop the `industry_profiles` table itself (out of scope per RESEARCH Open Question #3).

**Task 3 — Sync `member_type='industry'` on an industry grant (INDUSTRY-06):**
- `grantCapability()` in `lib/capabilities/grant.ts` now conditionally spreads `member_type: 'industry'` into the existing `user_profiles` UPDATE payload when `input.capability === 'industry'`. An `artist` grant's payload is unchanged (roles-only) — `member_type` is never set/downgraded by an artist grant.
- The write is a plain idempotent UPDATE — re-approving an already-industry account is a no-op.
- Added an `// INDUSTRY-06` comment above the write explaining the lockstep intent.
- Widened `__tests__/capability-grant.test.ts`'s exact-match `toHaveBeenCalledWith({roles:...})` assertion to `expect.objectContaining({roles:...})` so it tolerates the new `member_type` key without weakening what it verifies.

## Deviations from Plan

None — plan executed exactly as written. The one incidental fix (typing `mockUpdate`'s payload parameter in `capability-member-type-sync.test.ts` to satisfy `tsc --noEmit`) was made inline while authoring the Task 1 test file itself, before it was ever committed as "passing" — not a deviation from a prior commit's state, just normal test-authoring.

## Manual-Only Verification (per 28-VALIDATION.md / RESEARCH's Validation Architecture)

No Next.js request harness exists in this repo, so the live HTTP behavior of the fixed gate cannot be automated. Recorded here for a human to execute against a real deployment (requires Plan 28-05's migration + a real approved-industry account):

| Scenario | Expected | Status |
|----------|----------|--------|
| Artist-only account calls `POST /api/antenna/opportunities` | `403 Only accounts with industry access can post opportunities` | Not yet executed — requires live accounts |
| Approved-industry account calls `POST /api/antenna/opportunities` | `200` with the created opportunity | Not yet executed — requires live accounts + Plan 28-05's migration (capability_grants write at account creation) |

## Verification Results

- `npx jest __tests__/antenna-industry-gate.test.ts __tests__/capability-member-type-sync.test.ts __tests__/capability-grant.test.ts` — 3 suites / 12 tests, all GREEN.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 warnings, `--max-warnings=0`).
- `npm run test` (full suite) — 110 suites / 1394 tests, all GREEN (no regressions).

## TDD Gate Compliance

All three tasks were `tdd="true"`. Git log confirms the gate sequence:
1. `test(28-01): add failing tests for Antenna industry gate + member_type sync` (RED) — commit `fd9b33a`
2. `fix(28-01): remove dead industry_profiles double-gate from Antenna POST (INDUSTRY-01)` (GREEN, Task 2) — commit `b242ab5`
3. `feat(28-01): sync member_type='industry' on an industry capability grant (INDUSTRY-06)` (GREEN, Task 3) — commit `3c4eb48`

No REFACTOR commit was needed — no cleanup pass was warranted after GREEN.

## Requirements

`INDUSTRY-01` and `INDUSTRY-06` are provisional IDs per the plan's own frontmatter note — no Phase 28 section exists yet in `.planning/REQUIREMENTS.md` (confirmed by grep; consistent with the same pre-existing registration gap already logged for Phases 16/22/23 in STATE.md). `requirements mark-complete` was not run against these provisional IDs; registration is deferred to a future `/gsd-docs-update` pass per the established project convention, not fixed by this executor.

## Self-Check: PASSED

- `app/api/antenna/opportunities/route.ts` — FOUND, modified as described.
- `lib/capabilities/grant.ts` — FOUND, modified as described.
- `__tests__/antenna-industry-gate.test.ts` — FOUND.
- `__tests__/capability-member-type-sync.test.ts` — FOUND.
- `__tests__/capability-grant.test.ts` — FOUND, widened assertion in place.
- Commit `fd9b33a` — FOUND in `git log --oneline`.
- Commit `b242ab5` — FOUND in `git log --oneline`.
- Commit `3c4eb48` — FOUND in `git log --oneline`.
