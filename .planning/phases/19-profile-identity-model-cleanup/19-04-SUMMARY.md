---
phase: 19-profile-identity-model-cleanup
plan: 04
subsystem: database
tags: [postgres, supabase, migrations, security-definer, jsonb]

# Dependency graph
requires:
  - phase: 19-profile-identity-model-cleanup
    provides: "19-01's lib/profile/semantic-blank.ts and lib/profile/claim-prefill.ts parity twins (the machine-checked contract these migrations mirror field-for-field)"
provides:
  - "supabase/migrations/071_user_profiles_data_rescue.sql — logged semantic-blank data rescue, authored not pushed"
  - "supabase/migrations/072_repoint_claim_functions.sql — both claim/backfill functions re-pointed to artist_profiles + claim_prefill column + R2 reverse pre-fill, authored not pushed"
  - "supabase/migrations/073_drop_user_profiles.sql — drop user_profiles, strictly last, authored not pushed"
affects: [19-05, 19-06, 19-07, 20-profile-table-rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three separately-reviewable migration files (rescue -> re-point -> drop) enforce ordering by filename alone under the human-gated-push constraint"
    - "Reverse pre-fill runs inside claim_collaborators() per-field, using jsonb_set on a private claim_prefill column rather than N new boolean/text columns"

key-files:
  created:
    - supabase/migrations/071_user_profiles_data_rescue.sql
    - supabase/migrations/072_repoint_claim_functions.sql
    - supabase/migrations/073_drop_user_profiles.sql
  modified: []

key-decisions:
  - "Reverse pre-fill (R2) is scoped to the 5 fields that exist on both artist_profiles and collaborators (pro, ipi, publisher, contact_phone/phone, mailing_address) — bio/artist_name have no collaborators-side equivalent, so they are rescue-only (071), never claim-pre-filled (072)"
  - "Stranded-value audit count in 071 is computed BEFORE the rescue UPDATE runs (not after, as the RESEARCH.md illustrative snippet's literal ordering would produce a post-rescue count of ~0) — logs the number of rows that WOULD have lost data absent the rescue, which is the meaningful audit trail for R1 AC line 3"
  - "backfill_claimed_collaborators() receives only the re-point (Pitfall 1), not the R2 reverse pre-fill — the plan and SPEC scope the reverse pre-fill to the claim path (claim_collaborators()) exclusively"

patterns-established:
  - "claim_prefill JSONB entries are written via jsonb_set(v_prefill, ARRAY['field'], jsonb_build_object(...)) per field, then persisted in a single trailing UPDATE — avoids N separate artist_profiles writes"

requirements-completed: [R1, R2, R3]

coverage:
  - id: D1
    description: "Migration 071 rescues stranded user_profiles values (pro/ipi/publisher/phone->contact_phone/mailing_address/display_name->artist_name/bio) into artist_profiles using semantic-blank + canonical-wins rules, with logged pre/post + stranded-value counts"
    requirement: R1
    verification:
      - kind: unit
        ref: "__tests__/rescue-semantic-blank.test.ts (parity twin — lib/profile/semantic-blank.ts)"
        status: pass
      - kind: other
        ref: "structural grep: 071 contains RAISE NOTICE, contact_phone, artist_name, and the human-gated 'NEVER run' header"
        status: pass
    human_judgment: true
    rationale: "Live behavior (actual row counts rescued, RAISE NOTICE output) can only be observed when Pete pushes this migration at the 19-07 human-gated checkpoint — this plan authors and structurally/twin-verifies it only"
  - id: D2
    description: "Migration 072 re-points BOTH claim_collaborators() and backfill_claimed_collaborators() to read artist_profiles (phone->contact_phone), adds the private claim_prefill JSONB column, and extends claim_collaborators() with the R2 idempotent reverse pre-fill (most-recent-wins, inviting-artist provenance)"
    requirement: R2
    verification:
      - kind: unit
        ref: "__tests__/claim-prefill.test.ts (parity twin — lib/profile/claim-prefill.ts)"
        status: pass
      - kind: other
        ref: "structural grep: 072 contains claim_prefill, artist_profiles, backfill_claimed_collaborators, and NOTIFY pgrst"
        status: pass
    human_judgment: true
    rationale: "Live function behavior (actual claim runs against real collaborators/artist_profiles rows) can only be observed post-push at 19-07 — this plan authors and structurally/twin-verifies it only"
  - id: D3
    description: "Migration 073 drops user_profiles only, ordered strictly after 071/072 by filename, with a header documenting the rescue+re-point+zero-runtime-reference preconditions"
    requirement: R1
    verification:
      - kind: other
        ref: "structural grep: 073 contains DROP TABLE, user_profiles, and the human-gated 'NEVER run' header"
        status: pass
    human_judgment: true
    rationale: "The drop is destructive/irreversible and gated on live push order at 19-07 — cannot be automation-verified pre-push"

# Metrics
duration: 12min
completed: 2026-07-24
status: complete
---

# Phase 19 Plan 04: Migrations 071-073 — Rescue, Re-point, Drop Summary

**Three ordered, human-gated migrations that fix the duplicate-rights bug at the data layer: a logged semantic-blank rescue (071), a both-readers re-point plus R2 reverse pre-fill (072), and a strictly-last destructive drop (073).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-24T05:03:57Z
- **Completed:** 2026-07-24T05:15:56Z
- **Tasks:** 3
- **Files modified:** 3 (all new)

## Accomplishments
- Migration 071 copies any `user_profiles` values stranded over a semantic-blank `artist_profiles` column (NULL / trimmed-empty text / empty-JSON `{}`) using canonical-wins, mapping `phone`→`contact_phone` and `display_name`→`artist_name`; logs pre-candidate, pre-stranded, and post-rescue row counts via `RAISE NOTICE`
- Migration 072 re-points both `claim_collaborators()` and `backfill_claimed_collaborators()` to read `artist_profiles` instead of `user_profiles`, adds the private `artist_profiles.claim_prefill JSONB` column, and extends `claim_collaborators()` with the R2 reverse pre-fill (most-recent-collaborator-wins, unconfirmed provenance naming the inviting artist, idempotent against confirmed/non-blank values)
- Migration 073 drops `user_profiles` via `DROP TABLE IF EXISTS ... CASCADE`, with a header documenting the rescue+re-point+zero-runtime-reference preconditions Pete must confirm before pushing
- All three files carry the "an executor agent must NEVER run `supabase db push`" header; nothing was pushed to the remote database

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 071 — semantic-blank data rescue (logged)** - `a6dcf87` (feat)
2. **Task 2: Migration 072 — re-point both functions + claim_prefill column + R2 reverse pre-fill** - `45b19da` (feat)
3. **Task 3: Migration 073 — drop user_profiles (strictly last)** - `6e2db03` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `supabase/migrations/071_user_profiles_data_rescue.sql` - Semantic-blank rescue, canonical-wins, logs pre/post + stranded counts via `RAISE NOTICE`
- `supabase/migrations/072_repoint_claim_functions.sql` - Both DB readers re-pointed to `artist_profiles`; new `claim_prefill` column; R2 reverse pre-fill inside `claim_collaborators()`
- `supabase/migrations/073_drop_user_profiles.sql` - `DROP TABLE public.user_profiles CASCADE`, gated header

## Decisions Made
- **Stranded-count ordering:** computed the stranded-value audit count in 071 *before* the rescue `UPDATE` runs, rather than after (as RESEARCH.md's illustrative snippet's literal statement order would do). Computing it after the rescue would report ~0 every time, since the rescue had already fixed the blank columns the check looks for — that reads as a false "nothing was stranded" signal to Pete at push time. Pre-rescue computation gives the honest "this many rows would have lost data absent this migration" audit trail the SPEC's AC line 3 actually wants.
- **Reverse pre-fill field scope:** limited R2's reverse pre-fill (in 072) to the 5 fields that exist on both `artist_profiles` and `collaborators` — `pro`, `ipi`, `publisher`, `contact_phone`/`phone`, `mailing_address`. `bio` and `artist_name`/`display_name` have no `collaborators`-table equivalent to pre-fill from, so they remain rescue-only (071) and are not part of the claim_prefill provenance map.
- **backfill_claimed_collaborators() scope:** re-pointed to `artist_profiles` (Pitfall 1 — both functions must move together) but did NOT receive the R2 reverse pre-fill logic — the plan and SPEC scope that addition to the claim path (`claim_collaborators()`) exclusively; `backfill_claimed_collaborators()` stays the forward-fill-only sibling it already was.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for this plan. **However:** migrations 071/072/073 are authored-only and have NOT been pushed to the remote database — that push is plan 19-07's blocking human checkpoint (`supabase db push` + `supabase migration list` LOCAL=REMOTE verification). No runtime behavior changes until Pete pushes.

## Next Phase Readiness

- All three migration files exist on disk, pass their structural greps, and their corresponding parity-twin Jest suites (`rescue-semantic-blank.test.ts`, `claim-prefill.test.ts`) are green (25/25 tests)
- Historical migrations (026/051/053/066) are byte-unchanged — confirmed via `git diff` against the pre-plan commit
- Plan 19-05 (runtime removal — Settings "Rights Identity" section, `/api/user-profiles` route deletion, R2 confirm UI) can now build against these migration bodies as the DB-layer contract; plan 19-07's human-gated checkpoint is the next point at which these three files actually take effect on the live database
- No blockers

---
*Phase: 19-profile-identity-model-cleanup*
*Completed: 2026-07-24*

## Self-Check: PASSED

All created files verified present on disk; all task commit hashes (a6dcf87, 45b19da, 6e2db03) verified present in git log.
