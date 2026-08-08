---
phase: 26-sync-library-inclusion
plan: 05
subsystem: api
tags: [sync-library, staff-gate, requireStaff, logStaffAction, notifications, jest]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion (26-01)
    provides: sync_listings table (migration 096, live), capability_grants CHECK extension (sync_library/admin_invited)
  - phase: 26-sync-library-inclusion (26-02)
    provides: lib/sync-library/submission.ts (isValidTransition state machine), SyncListing/SyncListingStatus types
provides:
  - "POST /api/sync-library/invite — staff mints an admin_invited sync_library capability_grants row + notifies (leadership/ae)"
  - "POST /api/sync-library/admin/[listingId] — the single admit/reject curation gate for every song, invited or self-applied (leadership/ae)"
  - "POST /api/sync-library/admin/[listingId]/remove — leadership-only takedown of an already-admitted song"
  - "Four sync-library notification builders in lib/social/notifications.ts (invite/admitted/rejected/removed) + NOTIFICATION_TYPES catalog entries"
affects: [26-06 (catalogue admission gate), 26-08 (dashboard invited spotlight), 26-09 (new-feature highlight/nav), sync-library-admin-console]

tech-stack:
  added: []
  patterns:
    - "Staff-gate-first + DB-loaded-target + isValidTransition double-decide guard + unconditional logStaffAction, mirrored exactly from app/api/capabilities/approve/[grantId]/route.ts across all three routes"
    - "Institutional (non-personal) staff-attributed notification builders — actorName fixed to 'Funūn' rather than resolving a per-staff display name, added to lib/social/notifications.ts alongside its existing NotificationPayload contract"

key-files:
  created:
    - app/api/sync-library/invite/route.ts
    - app/api/sync-library/invite/route.test.ts
    - "app/api/sync-library/admin/[listingId]/route.ts"
    - "app/api/sync-library/admin/[listingId]/route.test.ts"
    - "app/api/sync-library/admin/[listingId]/remove/route.ts"
    - "app/api/sync-library/admin/[listingId]/remove/route.test.ts"
  modified:
    - lib/social/notifications.ts

key-decisions:
  - "Notification builders live in lib/social/notifications.ts per the plan's explicit files_modified/task instructions, even though the codebase's more recent precedent (lib/deals/notifications.ts, lib/staff/notifications.ts) is to give admin-triggered notification builders their own domain-specific file. Followed the plan literally; extended NOTIFICATION_TYPES with four new catalog entries (icon + inlineAction: null) so the closed NotificationType union stays consistent rather than widening it to a plain string."
  - "actorName is a fixed 'Funūn' string on all four new builders (invite/admitted/rejected/removed) rather than resolving the acting staff member's display name — these are institutional decisions on Funūn's behalf, matching the spotlight-card's 'Funūn wants to represent your music...' framing (26-UI-SPEC), and avoids an extra profile lookup the plan didn't call for."
  - "The admin/[listingId] route's first-admission check re-queries sync_listings (select id, filtered by artist_user_id + status='admitted') AFTER the update and checks length === 1, rather than a count(*) head query — matches this codebase's established array-length-check convention (mint-agreement route's cohort checks) over PostgREST's count-header path, and is simpler to unit test."
  - "Rejection/removal reasons are trimmed and capped at 500 chars server-side (not specified as an exact number by the plan) — a defensive input-shape guard consistent with this codebase's other length-capped free-text fields."

patterns-established:
  - "TDD RED/GREEN commit pairs per route: test(26-05) commit fails on missing module import (route.ts genuinely absent, not temporarily removed — a cleaner RED than 26-03/26-04's remove-then-restore trick), then feat(26-05) commit makes it pass."

requirements-completed: [SYNCLIB-02, SYNCLIB-05, SYNCLIB-08, SYNCLIB-09, SYNCLIB-14]

coverage:
  - id: D1
    description: "POST /api/sync-library/invite lets leadership/ae staff mint an idempotent, approved admin_invited sync_library grant for a validated artist target, firing a best-effort invite notification and an unconditional sync_library.invite audit log"
    requirement: SYNCLIB-02
    verification:
      - kind: unit
        ref: "app/api/sync-library/invite/route.test.ts — all 7 tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/sync-library/admin/[listingId] is the single staff admit/reject gate for every song (invited or self-applied), guarded by isValidTransition (409 on double-decide), storing an optional rejection reason surfaced to the artist"
    requirement: SYNCLIB-05
    verification:
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/route.test.ts — all 10 tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admitting a song fires the SYNCLIB-14 new-feature-highlight notification (buildSyncLibraryAdmittedNotification, verbatim title) ONLY on the artist's first admitted listing — verified both for the firing case (count===1) and the suppressed case (count>1)"
    requirement: SYNCLIB-14
    verification:
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/route.test.ts#admits a pending_admit listing, fires the highlight notification on the FIRST admission, and audits"
        status: pass
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/route.test.ts#admits a listing but skips the highlight notification when it is NOT the artist's first admission"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/sync-library/admin/[listingId]/remove is LEADERSHIP-ONLY (requireStaff(['leadership']), 403 for ae/bd), guarded to the admitted→removed edge only, records removed_at/removed_by/optional removal_reason, and notifies the artist"
    requirement: SYNCLIB-08
    verification:
      - kind: unit
        ref: "app/api/sync-library/admin/[listingId]/remove/route.test.ts — all 6 tests"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every staff mutation (invite/admit/reject/remove) logs a staff_audit_log entry unconditionally after its write, including the invite route's idempotent no-op path — never on a 4xx/pre-write rejection"
    requirement: SYNCLIB-09
    verification:
      - kind: unit
        ref: "app/api/sync-library/invite/route.test.ts — 'is idempotent — an existing active grant is returned without a duplicate insert or notification' + all 400/404/403/401 tests asserting logStaffAction was NOT called"
        status: pass
    human_judgment: false
  - id: D6
    description: "Manual end-to-end verification (real Supabase, real staff session) that inviting/admitting/rejecting/removing produces correct sync_listings/capability_grants rows and a real notification lands in NotificationBell"
    verification: []
    human_judgment: true
    rationale: "Deferred to the phase gate per this plan's own <verification> section — requires a live DB session and staff account, out of scope for this unit-test-only execution pass."

# Metrics
duration: ~35min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 05: Sync-Library Staff Invite/Admit/Reject/Remove Summary

**Staff curation authority for the sync library — invite mint, the single admit/reject gate for every song (invited or self-applied), and leadership-only removal, each staff-gate-first, DB-target-loaded, transition-guarded, and unconditionally audited.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-08
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 extended)

## Accomplishments
- `POST /api/sync-library/invite` — `requireStaff(['leadership','ae'])` first; validates `profileId` against `user_profiles` (404 if not a real artist account); idempotently mints an approved `admin_invited` `capability_grants` row with a fixed allowlisted column set (never duplicating an active grant, respecting `capability_grants_active_uniq`); fires `buildSyncLibraryInviteNotification` best-effort; logs `sync_library.invite` unconditionally, including on the idempotent no-op path.
- `POST /api/sync-library/admin/[listingId]` — the SINGLE staff curation gate (26-CONTEXT.md decision #2: invited vs self-applied is metadata, not a separate flow). `requireStaff(['leadership','ae'])` first; target loaded from the DB by `listingId`, never the body; `isValidTransition` guards admit (`pending_admit` → `admitted` only) and reject (409 on any non-actionable status); admit fires the SYNCLIB-14 highlight notification (`buildSyncLibraryAdmittedNotification`, verbatim title) ONLY on the artist's first admitted listing; reject stores an optional, length-capped staff reason and surfaces it to the artist via `buildSyncLibraryRejectedNotification`. Every path logs `sync_library.admit`/`sync_library.reject`.
- `POST /api/sync-library/admin/[listingId]/remove` — LEADERSHIP-ONLY takedown of an already-admitted song. `requireStaff(['leadership'])` is the FIRST statement — 403 for ae/bd. Guards the `admitted → removed` edge, records `removed_at`/`removed_by`/optional `removal_reason`, notifies the artist via `buildSyncLibraryRemovedNotification`, logs `sync_library.remove`.
- Four new pure notification builders + `NOTIFICATION_TYPES` catalog entries added to `lib/social/notifications.ts`: `buildSyncLibraryInviteNotification`, `buildSyncLibraryAdmittedNotification`, `buildSyncLibraryRejectedNotification`, `buildSyncLibraryRemovedNotification` — all institutionally-attributed (`actorName: 'Funūn'`).

## Task Commits

Each task was executed via the TDD RED/GREEN cycle (route.ts genuinely absent at RED time, not temporarily removed):

1. **Task 1: POST /api/sync-library/invite** — `cf12d6d` (test, RED) → `e432fa4` (feat, GREEN)
2. **Task 2: POST /api/sync-library/admin/[listingId]** — `f1d2882` (test, RED) → `b96766c` (feat, GREEN)
3. **Task 3: POST /api/sync-library/admin/[listingId]/remove** — `02c1ae7` (test, RED) → `cf002fa` (feat, GREEN)

## Files Created/Modified
- `app/api/sync-library/invite/route.ts` — staff invite mint endpoint
- `app/api/sync-library/invite/route.test.ts` — 7 tests: 401, 403, 400 bad body, 404 non-artist target, success (allowlisted insert + notify + audit), ae-allowed, idempotent-existing-grant
- `app/api/sync-library/admin/[listingId]/route.ts` — admit/reject curation gate endpoint
- `app/api/sync-library/admin/[listingId]/route.test.ts` — 10 tests: 401, 403, 400 bad decision, 404 absent listing, 409 admit-not-pending_admit, 409 reject-terminal, admit+first-admission-notifies, admit+not-first-admission-suppresses, reject+reason, reject+no-reason
- `app/api/sync-library/admin/[listingId]/remove/route.ts` — leadership-only removal endpoint
- `app/api/sync-library/admin/[listingId]/remove/route.test.ts` — 6 tests: 401, 403 (ae rejected), 404 absent listing, 409 non-admitted listing, success+reason, success+no-reason
- `lib/social/notifications.ts` — added 4 builders + 4 `NOTIFICATION_TYPES` catalog entries

## Decisions Made
- Followed the plan's explicit instruction to add the four new notification builders to `lib/social/notifications.ts` (not a new `lib/sync-library/notifications.ts`), even though this codebase's more recent domain-specific-file precedent (Phase 16's `lib/deals/notifications.ts`, Phase 25's `lib/staff/notifications.ts`) would have suggested a dedicated file. Extended `NOTIFICATION_TYPES` with four entries so the file's closed `NotificationType` union stays exhaustive rather than widening `NotificationPayload.type` to a plain string.
- `actorName` is a fixed `'Funūn'` string on all four builders — these are institutional staff actions on Funūn's behalf (mirrors the spotlight-card's "Funūn wants to represent your music..." framing), not individually-attributed peer actions, and resolving a real staff display name wasn't called for by the plan.
- First-admission detection re-queries `sync_listings` (filtered by `artist_user_id` + `status='admitted'`) after the write and checks `.length === 1`, rather than a `count`-header query — matches the array-length-check convention already established in `mint-agreement/route.ts`'s cohort checks, and is simpler to unit test with the existing mock shape.
- Rejection/removal reasons are trimmed and capped at 500 characters server-side — not an exact number specified by the plan, but consistent with this codebase's defensive free-text-length-capping convention.

## Deviations from Plan

None — plan executed exactly as written, including the exact threat-model mitigations (T-26-17 through T-26-22) and the TDD RED/GREEN sequencing for all three tasks.

## Issues Encountered
None.

## User Setup Required

None — no external service configuration required. All three routes only touch already-live tables (migration 096) and the existing notifications infrastructure.

## Next Phase Readiness
- 26-06 (catalogue admission gate) can rely on `sync_listings.status = 'admitted'` as the single source of truth for what's browsable — this plan is the only writer of that transition.
- 26-08 (dashboard invited spotlight) can rely on an `approved`/`admin_invited` `capability_grants(capability='sync_library')` row existing the moment `POST /api/sync-library/invite` succeeds.
- 26-09 (new-feature highlight / nav "New" dot) can rely on `buildSyncLibraryAdmittedNotification`'s notification firing exactly once per artist, on their first admitted listing, with the verbatim locked-context title and a `/sync-library` link.
- Manual end-to-end verification against a live Supabase session with a real staff account (invite → admit → notification lands in `NotificationBell`) is deferred to the phase gate per this plan's `<verification>` section — no blocker, just not yet exercised outside unit tests.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All 7 created/modified files verified present on disk; all 6 task commits (cf12d6d, e432fa4, f1d2882, b96766c, 02c1ae7, cf002fa) verified in git log. Full `npx jest` (144 suites, 1711 tests) and `npx tsc --noEmit` both green.
