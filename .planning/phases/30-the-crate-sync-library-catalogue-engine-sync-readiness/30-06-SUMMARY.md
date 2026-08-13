---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 06
subsystem: api
tags: [tagging, ai, supabase, staff-approval, sync-library]

# Dependency graph
requires:
  - phase: 30-02
    provides: lib/tagging/tag-merge.ts (mergeAiSuggestion/proposeStaffRefinement/approvePendingTags/rejectPendingTags/isTagApprover), lib/tagging/ai-tag.ts (suggestTrackTags)
  - phase: 30-03
    provides: lib/admin/staff-role.ts widened StaffRole union with 'anr'; lib/admin/gate.ts requireStaff() gate
provides:
  - "POST /api/sync-library/tag-suggest — staff-gated AI tag suggestion, writes descriptors.ai_suggested only"
  - "POST /api/sync-library/tag-propose — AE proposals land pending; leadership/anr proposals auto-confirm"
  - "POST /api/sync-library/tag-approve — leadership/anr approve (promote) or reject (clear) a pending proposal"
affects: [30-07, sync-library-tagging-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-loaded target by trackId (never body-supplied descriptors as the write source of truth); merge into existing tracks.metadata JSONB to preserve sibling keys"
    - "requireStaff() resolves the caller's staffRole server-side and passes it into proposeStaffRefinement() — the role branch (AE→pending, leadership/anr→auto-confirm) lives entirely in lib/tagging/tag-merge.ts, not duplicated in the route"
    - "logStaffAction called UNCONDITIONALLY after every successful write (T-30-05)"

key-files:
  created:
    - app/api/sync-library/tag-suggest/route.ts
    - app/api/sync-library/tag-suggest/route.test.ts
    - app/api/sync-library/tag-propose/route.ts
    - app/api/sync-library/tag-propose/route.test.ts
    - app/api/sync-library/tag-approve/route.ts
    - app/api/sync-library/tag-approve/route.test.ts
  modified: []

key-decisions:
  - "tag-propose runs the incoming refinement through sanitizeDescriptors (full-set coercion) before calling proposeStaffRefinement — matches the plan's read_first guidance and treats a propose call as submitting a complete proposed descriptor set, not a partial patch"
  - "tag-suggest degrades gracefully with { data: { ok: false, error } } at HTTP 200 (never a 500) when suggestTrackTags() returns ok:false — matches ai-tag.ts's offline-key contract"
  - "tag-approve returns 409 (not 404/400) when a track has no pending proposal, mirroring the admin admit/reject route's double-decide-guard convention"

requirements-completed: [CRATE-06, CRATE-10]

coverage:
  - id: D1
    description: "tag-suggest: staff-gated AI tag suggestion writes descriptors.ai_suggested only, never overwrites confirmed tags, degrades gracefully with no ANTHROPIC_API_KEY, preserves sibling metadata keys"
    requirement: CRATE-06
    verification:
      - kind: unit
        ref: "app/api/sync-library/tag-suggest/route.test.ts — all 6 tests"
        status: pass
      - kind: unit
        ref: "lib/tagging/ai-tag.test.ts — all tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "tag-propose: requireStaff(['leadership','ae','anr']); AE proposal lands pending (confirmed unchanged); leadership/anr proposal auto-confirms; bd/non-staff 403"
    requirement: CRATE-10
    verification:
      - kind: unit
        ref: "app/api/sync-library/tag-propose/route.test.ts — all 9 tests"
        status: pass
      - kind: unit
        ref: "lib/tagging/tag-merge.test.ts — proposeStaffRefinement suite"
        status: pass
    human_judgment: false
  - id: D3
    description: "tag-approve: requireStaff(['leadership','anr']) ONLY (AE incl. proposer gets 403); approve promotes pending→confirmed and clears pending; reject clears pending without touching confirmed; 409 when no pending proposal"
    requirement: CRATE-10
    verification:
      - kind: unit
        ref: "app/api/sync-library/tag-approve/route.test.ts — all 8 tests"
        status: pass
      - kind: unit
        ref: "lib/tagging/tag-merge.test.ts — approvePendingTags/rejectPendingTags suites"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live service-role DB round-trip (real trackId, real Supabase auth) for all three routes"
    verification: []
    human_judgment: true
    rationale: "No live Supabase credentials/network access available in this execution sandbox (.env.local read denied by the tool sandbox). Substituted with mocked-service-client Jest route tests that assert the exact update() payload shape and logStaffAction call — the same verification convention every other sync-library route in this codebase uses (see remove/route.test.ts, submit/route.test.ts). A human with access to the live/staging Supabase project should run the manual round-trip described in each task's <verify><manual> block before this plan is considered fully closed."

# Metrics
duration: ~35min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 06: Layered Tagging Write-Paths (AI Suggest / AE Propose / Leadership-A&R Approve) Summary

**Three staff-gated POST routes complete the layered-tagging write side: AI suggests into `descriptors.ai_suggested`, AEs propose into `descriptors.pending`, and leadership/A&R approve or reject — reusing 30-02's `lib/tagging/tag-merge.ts` and `ai-tag.ts` verbatim, no new lib code.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files created:** 6 (3 routes + 3 colocated Jest tests)

## Accomplishments
- `POST /api/sync-library/tag-suggest` — any staff role can trigger an AI tag suggestion for a track; writes only `descriptors.ai_suggested` via `mergeAiSuggestion`, never touches artist-confirmed `moods`/`energy`/`vocal`/`instruments`; returns a graceful `{ ok: false }` (HTTP 200) when `ANTHROPIC_API_KEY` is absent, matching `suggestTrackTags`'s existing offline contract.
- `POST /api/sync-library/tag-propose` — `requireStaff(['leadership','ae','anr'])`; the server-resolved `staffRole` (never a client-supplied value) drives `proposeStaffRefinement()`'s branch: an AE's refinement lands in `descriptors.pending` (confirmed tags untouched), a leadership/anr refinement auto-confirms via `applyStaffRefinement`.
- `POST /api/sync-library/tag-approve` — `requireStaff(['leadership','anr'])` ONLY; an AE (including the original proposer) gets 403. `approve` promotes pending→confirmed and clears pending (stamps `staff_refined_by` = approver); `reject` clears pending without touching confirmed tags; 409 when there is no pending proposal to decide.
- All three routes: target loaded server-side by `trackId` (never trusted from a body-supplied descriptor blob), merge the write into the existing `tracks.metadata` JSONB so sibling keys (`composers`, `lyrics`, `performers`, `recording`) survive untouched, and call `logStaffAction` unconditionally after every successful write.

## Task Commits

Each task was committed atomically:

1. **Task 1: AI tag-suggest route** — `7722edc` (feat)
2. **Task 2: Tag-propose route (AE proposes, leadership/A&R auto-confirm)** — `4d1267d` (feat)
3. **Task 3: Tag-approve route (leadership/A&R approve or reject)** — `1ada59a` (feat)

_No plan-metadata commit — per this session's environment instructions, `gsd-tools state.*`/`roadmap.*` were explicitly skipped (STATE.md stale, main checkout on `feat/lane1-catalogue-menu-help`)._

## Files Created/Modified
- `app/api/sync-library/tag-suggest/route.ts` — POST; staff-gated AI tag suggestion.
- `app/api/sync-library/tag-suggest/route.test.ts` — 6 tests (401/403/400/404/offline-graceful/success-write).
- `app/api/sync-library/tag-propose/route.ts` — POST; AE→pending, leadership/anr→auto-confirm.
- `app/api/sync-library/tag-propose/route.test.ts` — 9 tests (401/403/400×2/404/AE-pending/leadership-confirm/anr-confirm).
- `app/api/sync-library/tag-approve/route.ts` — POST; leadership/anr approve or reject.
- `app/api/sync-library/tag-approve/route.test.ts` — 8 tests (401/403/400×2/404/409/approve/reject).

## Decisions Made
- **tag-propose full-set coercion:** ran the incoming `descriptors` body through `sanitizeDescriptors()` (per the plan's explicit read_first instruction) rather than passing raw fields straight into `proposeStaffRefinement`'s partial-update semantics. This means a propose call submits a complete proposed tag set (moods/energy/vocal/instruments as a whole), not a field-by-field patch — consistent with a staff UI presenting the full descriptor form for review/edit before proposing.
- **Graceful AI-offline shape:** `tag-suggest` returns `{ data: { ok: false, error } }` at HTTP 200 rather than a 4xx/5xx, so the staff UI can distinguish "AI is offline" from an actual request error without special-casing a status code.
- **409 for no-pending on approve/reject:** mirrors the existing admin admit/reject route's "double-decide guard" convention (`isValidTransition` → 409) rather than 400/404, since the track and staff role are both valid — only the state precondition fails.

## Deviations from Plan

None — plan executed exactly as written. `lib/tagging/tag-merge.ts` and `lib/tagging/ai-tag.ts` (30-02) already existed with all the exported functions this plan's routes needed (`mergeAiSuggestion`, `proposeStaffRefinement`, `approvePendingTags`, `rejectPendingTags`, `isTagApprover`, `suggestTrackTags`) — no lib changes were required, only the three new route files plus their colocated tests.

## Issues Encountered
- The plan's `<verify><manual>` DB-round-trip step (real service-role Supabase calls against a live trackId) could not be executed in this sandbox: `.env.local` read access was denied by the tool sandbox and no live network egress to Supabase was available. Substituted with the codebase's standard mocked-service-client Jest route tests (same pattern as `remove/route.test.ts`, `submit/route.test.ts`) that assert the exact `update()` payload and `logStaffAction` call shape for every branch (AE→pending, leadership/anr→auto-confirm, approve→promote, reject→clear, AE→403 on approve, no-pending→409). Flagged as `D4` (`human_judgment: true`) in this SUMMARY's coverage block — a human with staging/production Supabase access should run the manual round-trip in each task's `<verify>` block to fully close this out.

## User Setup Required
None — no external service configuration required. `ANTHROPIC_API_KEY` is a pre-existing env var (already required by 30-02's `ai-tag.ts`); tag-suggest degrades gracefully if it is unset.

## Next Phase Readiness
- Wave 2's three tagging write-paths are complete and staff-gated per the 2026-08-13 owner decision (AE-propose/leadership-A&R-approve governance). No route in this plan touches `app/api/sync-library/admin/[listingId]/route.ts` or any migration.
- Follow-up for a future plan/owner action: build the staff-facing UI that calls these three routes (currently no UI wires to `/tag-suggest`, `/tag-propose`, or `/tag-approve`) — this plan intentionally ships backend write-paths only, matching the phase's wave-2 scope.
- Recommend running the manual DB round-trip (D4 above) against staging before relying on this plan's routes in production, since only mocked-client tests ran in this session.
- `.claude/launch.json` was left untouched per this session's explicit instructions (pre-existing local modification, unrelated to this plan).

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commits (`7722edc`, `4d1267d`, `1ada59a`) verified present in `git log`.
