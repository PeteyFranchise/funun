---
phase: 26-sync-library-inclusion
plan: 03
subsystem: api
tags: [sync-library, supabase, ownership-gated-write, mass-assignment-allowlist, jest]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion (26-01)
    provides: sync_listings table (migration 096, live), capability_grants/vault_documents CHECK extensions
  - phase: 26-sync-library-inclusion (26-02)
    provides: lib/sync-library/submission.ts (status state machine), lib/sync-library/eligibility.ts, SyncListing/SyncListingStatus types
provides:
  - "POST /api/sync-library/submit — ungated, per-song, batched artist self-apply into the sync library"
  - "POST /api/sync-library/[listingId]/withdraw — artist-owned un-admit"
affects: [26-04 (blanket agreement e-sign), 26-05 (staff invite/admit/reject), sync-library-hub, sync-library-admin]

tech-stack:
  added: []
  patterns:
    - "Server-owned write: session client (createApiClient) for ownership checks, service client (createServiceClient) only after ownership is confirmed"
    - "Fixed allowlisted column set on every insert/update — request body never spread into a write"
    - "404 (not 403) on absent-or-non-owned rows to avoid an existence leak"
    - "Skip-not-error for idempotent-friendly batch submission (already-active track is reported, not rejected)"

key-files:
  created:
    - app/api/sync-library/submit/route.ts
    - app/api/sync-library/submit/route.test.ts
    - "app/api/sync-library/[listingId]/withdraw/route.ts"
    - "app/api/sync-library/[listingId]/withdraw/route.test.ts"
  modified: []

key-decisions:
  - "entry_source resolved server-side from an approved+admin_invited capability_grants row (profile_id = user.id, capability='sync_library'); anything else defaults to self_applied — the request body never supplies entry_source."
  - "alreadySigned is a direct vault_documents lookup (type='blanket_agreement', user_id, status='signed') rather than round-tripping through readEsignState/allSigned — simpler and sufficient since the webhook (26-04) is the only writer of that status."
  - "Batch-level entry_source/alreadySigned/status are computed once per request and applied uniformly across all newly-created rows in the batch (matches the plan's single initialStatusForEntry() call)."

patterns-established:
  - "TDD RED/GREEN commit pairs per route: test(26-03) commit fails on missing module import, then feat(26-03) commit makes it pass — verified via temporary route.ts removal before each test commit."

requirements-completed: [SYNCLIB-03, SYNCLIB-04]

coverage:
  - id: D1
    description: "POST /api/sync-library/submit lets an authenticated artist batch-submit their own songs (per-song sync_listings rows), rejecting unauthenticated callers, non-owned projects, foreign trackIds, and empty/oversized batches"
    requirement: "SYNCLIB-03"
    verification:
      - kind: unit
        ref: "app/api/sync-library/submit/route.test.ts — all 8 tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "submit route's insert uses a fixed allowlisted column set (vault_project_id, track_id, artist_user_id, entry_source, status) with entry_source/status resolved server-side, never from the request body"
    requirement: "SYNCLIB-03"
    verification:
      - kind: unit
        ref: "app/api/sync-library/submit/route.test.ts#inserts a self_applied listing per new track with a fixed allowlisted column set"
        status: pass
      - kind: unit
        ref: "app/api/sync-library/submit/route.test.ts#uses entry_source admin_invited and skips straight to pending_admit when already signed"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/sync-library/[listingId]/withdraw lets an artist withdraw their own listing (status → withdrawn, withdrawn_at set), returning 404 for absent/non-owned rows and 409 for an already-terminal listing"
    requirement: "SYNCLIB-04"
    verification:
      - kind: unit
        ref: "app/api/sync-library/[listingId]/withdraw/route.test.ts — all 5 tests"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual end-to-end verification (real Supabase, real session) that submitting a real owned song produces a correct sync_listings row"
    verification: []
    human_judgment: true
    rationale: "Deferred to phase gate per the plan's <verification> section — requires a live DB session, out of scope for this unit-test-only execution pass."

# Metrics
duration: ~20min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 03: Sync-Library Self-Apply & Withdraw Summary

**Ungated per-song "Submit to Sync Library" batch route + artist-owned withdrawal route, both server-owned-write and mass-assignment-safe, driving status exclusively through `lib/sync-library/submission.ts`'s shared state machine.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-08
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `POST /api/sync-library/submit` — an ungated, per-song, batched self-apply route. Session-client ownership check on `vault_projects` + a per-trackId membership check against the project's `tracks` before any write; service-client insert with a fixed allowlisted column set (`vault_project_id`, `track_id`, `artist_user_id`, `entry_source`, `status`); `entry_source` resolved from an approved `admin_invited` `capability_grants` row (defaulting to `self_applied`); status derived via `initialStatusForEntry()` (never hardcoded); tracks with an existing active listing are skipped, not errored.
- `POST /api/sync-library/[listingId]/withdraw` — artist-owned un-admit. Target row loaded via the service client (bypassing RLS) with ownership checked from the row itself (never the request body); 404 (not 403) on an absent or non-owned listing; `isValidTransition(status, 'withdrawn')` double-decide guard returns 409 on an already-terminal listing; allowlisted update sets `status='withdrawn'`, `withdrawn_at`, `updated_at`.
- Both routes reuse the 26-02 domain core (`initialStatusForEntry`, `isValidTransition`) with zero re-derivation of the transition table — closes T-26-05 (Tampering/drift) at the write-path level.

## Task Commits

Each task was executed via the TDD RED/GREEN cycle (route.ts temporarily removed to prove the test fails on import before the implementation was restored):

1. **Task 1: POST /api/sync-library/submit** — `1a18c64` (test, RED) → `61964f7` (feat, GREEN)
2. **Task 2: POST /api/sync-library/[listingId]/withdraw** — `63adc7d` (test, RED) → `ad6c915` (feat, GREEN)

## Files Created/Modified
- `app/api/sync-library/submit/route.ts` — ungated self-apply, per-song, batched submit endpoint
- `app/api/sync-library/submit/route.test.ts` — 8 tests: 401, empty batch, oversized batch, non-owned project (404), foreign trackId (400), allowlisted insert on success, admin_invited+already-signed→pending_admit, skip-active-track
- `app/api/sync-library/[listingId]/withdraw/route.ts` — artist-owned withdrawal endpoint
- `app/api/sync-library/[listingId]/withdraw/route.test.ts` — 5 tests: 401, absent listing (404), non-owned listing (404, not 403), terminal listing (409), success (status + withdrawn_at)

## Decisions Made
- `entry_source` is resolved entirely server-side from the caller's `capability_grants` row (`profile_id = user.id`, `capability = 'sync_library'`, `status = 'approved'`, `source = 'admin_invited'`) — the request body carries no `entry_source` field at all, closing off any client-side attempt to fabricate an invited-path listing.
- `alreadySigned` is a direct existence check on `vault_documents` (`type='blanket_agreement'`, `user_id`, `status='signed'`) rather than routing through `readEsignState`/`allSigned` — the plan allowed either; the direct check is simpler and matches what the 26-04 webhook is expected to write.
- Duplicate trackIds within a single request batch are de-duplicated (`[...new Set(...)]`) before ownership/insert processing — not explicitly required by the plan but a natural extension of "reject invalid input early."

## Deviations from Plan

None — plan executed exactly as written, including the TDD RED/GREEN sequencing and the exact threat-model mitigations (T-26-07 through T-26-10).

## Issues Encountered
- Jest's default CLI arg parsing treats `[` / `]` in a bare test-path argument as a glob character class, so `npx jest app/api/sync-library/[listingId]/withdraw/route.test.ts` silently matched 0 files. Resolved by using `--testPathPatterns` with the brackets escaped (`\[listingId\]`) instead of a bare positional path argument — no code change, test-invocation-only.

## User Setup Required

None — no external service configuration required. Both routes only touch already-live tables (migration 096).

## Next Phase Readiness
- 26-04 (blanket agreement e-sign) can now assume `sync_listings` rows exist in `applied`/`invited` state ahead of the sign step, and that a signed agreement short-circuits future submissions straight to `pending_admit` (verified by this plan's test coverage).
- 26-05 (staff invite/admit/reject) can rely on `entry_source` being trustworthy metadata (never client-supplied) for the curation queue's invited/self-applied distinction.
- Manual end-to-end verification against a live Supabase session (submit a real owned song, confirm the `sync_listings` row) is deferred to the phase gate per the plan's `<verification>` section — no blocker, just not yet exercised outside unit tests.

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All 4 created files verified present on disk; all 4 task commits (1a18c64, 61964f7, 63adc7d, ad6c915) verified in git log. Full `npx jest` (139 suites, 1678 tests) and `npx tsc --noEmit` both green.
