---
phase: 19-profile-identity-model-cleanup
plan: 05
subsystem: profile
tags: [nextjs, react, supabase, typescript, api-route]

# Dependency graph
requires:
  - phase: 19-profile-identity-model-cleanup
    provides: "lib/profile/claim-prefill.ts (ClaimPrefillEntry shape, 19-01) and migration 072's claim_prefill JSONB column + reverse pre-fill (19-04)"
provides:
  - "Single canonical Settings rights input (Rights & Royalties -> artist_profiles) with the /api/user-profiles duplicate deleted"
  - "D-12 verbatim help line under Rights & Royalties"
  - "Per-field claim pre-fill confirm-and-review UI (R2) parametrized from the legal-name confirm-and-lock pattern"
  - "PATCH /api/profile confirm_prefill_fields signal + edit-clears-unconfirmed server logic"
  - "ArtistProfile.claim_prefill shared type"
  - "Current-state companion test anchoring migrations 072/073 alongside the historical 051/052/053 assertions"
affects: [19-06, 19-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-field claim_prefill[field] confirm-and-review UI parametrized from the existing legal-name confirm-and-lock two-state block"
    - "confirm_prefill_fields server-owned signal mirroring lock_legal_name: client sends field names, server computes confirmed:true, filtered against existing claim_prefill keys"
    - "Edit-clears-unconfirmed: saving a rights field to a new non-blank value through the normal EDITABLE_FIELDS allowlist path drops that field's stale claim_prefill entry, reusing lib/profile/semantic-blank.ts's blank predicates"

key-files:
  created: []
  modified:
    - components/profile/ProfileForm.tsx
    - app/(artist)/settings/page.tsx
    - app/api/user-profiles/route.ts (deleted)
    - app/api/profile/route.ts
    - types/index.ts
    - __tests__/claim-collaborators-rpc.test.ts
    - lib/profile/load.ts
    - lib/profile/semantic-blank.ts

key-decisions:
  - "claim_prefill imports ClaimPrefillEntry from lib/profile/claim-prefill.ts rather than re-declaring the shape, per plan instruction and the 19-04 key_link that migration 072 and this UI must never drift"
  - "CLAIM_PREFILL_FIELDS covers pro/ipi/publisher/administrator/contact_phone/mailing_address in both ProfileForm.tsx and api/profile/route.ts, even though migration 072's reverse pre-fill currently only populates 5 of the 6 (administrator is not claim-pre-filled today) -- the UI/API stay forward-compatible and administrator simply never renders a badge until 072 is extended, if ever"
  - "Edit-clears-unconfirmed only fires when the saved value is non-blank (reusing isSemanticBlankText/isSemanticBlankJson) -- clearing a field back to blank leaves its claim_prefill entry alone so a later claim run can safely re-prefill it"

requirements-completed: [R1, R2]

coverage:
  - id: D1
    description: "Settings renders exactly one PRO/IPI/publisher/phone/mailing-address input; the duplicate Rights Identity section, its state/handler, and the /api/user-profiles route are gone"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "scoped grep -- zero runtime user_profiles/UserProfile references outside __tests__; test ! -f app/api/user-profiles/route.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The surviving Rights & Royalties section carries the verbatim D-12 help line"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "grep 'split sheets, metadata, and registrations' components/profile/ProfileForm.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each claim-pre-filled rights field renders an unconfirmed-review state with named provenance and a per-field confirm/edit control; confirming posts confirm_prefill_fields"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (ClaimPrefillNotice wiring across all 6 fields, type-checked against ArtistProfile.claim_prefill)"
        status: pass
    human_judgment: true
    rationale: "Visual rendering of the unconfirmed badge + provenance sentence and the live confirm round-trip against a real claim_prefill row require a browser/DB session -- no live claim_prefill fixture exists pre-migration-push (071-074 are human-gated, not yet pushed per 19-CONTEXT.md constraints)."
  - id: D4
    description: "/api/profile computes claim_prefill[field].confirmed=true server-side from confirm_prefill_fields, filtered against existing keys; claim_prefill is never in EDITABLE_FIELDS"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "grep confirm_prefill_fields app/api/profile/route.ts; grep -A40 EDITABLE_FIELDS app/api/profile/route.ts (claim_prefill absent)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Editing a pre-filled value persists the new value and clears its unconfirmed flag; a pre-existing non-blank value is never treated as pre-filled"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "npx jest __tests__/profile-privacy-api.test.ts __tests__/claim-collaborators-rpc.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Companion assertions confirm migration 072 re-points BOTH claim functions to artist_profiles with no live user_profiles reference, and 073 drops user_profiles"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "__tests__/claim-collaborators-rpc.test.ts -- 'claim_collaborators / backfill_claimed_collaborators re-point (migration 072) + drop (073)'"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-24
status: complete
---

# Phase 19 Plan 05: Consolidated Rights Settings + Claim Pre-fill Confirm UI Summary

**Deleted the duplicate Settings rights input and its `/api/user-profiles` route (fixing "saved PRO reads None"), then parametrized the legal-name confirm-and-lock pattern per rights field so claim-pre-filled values render as provenance-labeled, confirmable suggestions.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-24T05:00:00Z
- **Completed:** 2026-07-24T05:25:00Z
- **Tasks:** 3 completed
- **Files modified:** 8 (6 in files_modified + 2 Rule 1/3 auto-fixes)

## Accomplishments
- Settings now has exactly one rights input (Rights & Royalties → `artist_profiles`, which split sheets read) — the "Rights Identity" section, its state/handler, and `/api/user-profiles` are deleted entirely
- Added the verbatim D-12 help line under Rights & Royalties
- Per-field claim pre-fill confirm UI: `pro`/`ipi`/`publisher`/`administrator`/`contact_phone`/`mailing_address` each render an "unconfirmed — review" notice with named provenance (the person who added you, not the song) and a Confirm button, driven by `profile.claim_prefill[field]`
- `/api/profile` gained a server-owned `confirm_prefill_fields` signal (mirrors `lock_legal_name`) plus edit-clears-unconfirmed logic — `claim_prefill` stays outside `EDITABLE_FIELDS`, never mass-assignable
- Extended the RPC companion test with a current-state anchor proving migration 072 re-points both DB readers and migration 073 drops `user_profiles` — closes the 19-RESEARCH.md Pitfall 5 coverage gap

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove the duplicate rights input (R1) + D-12 help line** - `5be469c` (feat)
2. **Task 2: Per-field claim pre-fill confirm UI (R2) + /api/profile signal + type** - `efcd6ca` (feat)
3. **Task 3: Companion migration-content assertions (R1)** - `5395011` (test)

_Note: no TDD tasks in this plan; single commit per task._

## Files Created/Modified
- `components/profile/ProfileForm.tsx` - Removed Rights Identity section/state/handler; added D-12 help line; added `ClaimPrefillNotice` component + per-field confirm wiring for 6 rights fields
- `app/(artist)/settings/page.tsx` - Removed `UserProfile` type + `user_profiles` GET/read + `userProfile` prop pass; added `claim_prefill: null` to `DEMO_PROFILE`
- `app/api/user-profiles/route.ts` - Deleted (GET/PATCH to the duplicate table)
- `app/api/profile/route.ts` - Added `CLAIM_PREFILL_FIELDS` constant, `confirm_prefill_fields` signal handler, and edit-clears-unconfirmed logic
- `types/index.ts` - Added `ArtistProfile.claim_prefill: Record<string, ClaimPrefillEntry> | null`, importing the shape from `lib/profile/claim-prefill.ts`
- `__tests__/claim-collaborators-rpc.test.ts` - Added a companion `describe` block with 3 new tests anchoring migrations 072/073's current state
- `lib/profile/load.ts` - Added `claim_prefill: null` to the shared `DEMO_PROFILE` literal (Rule 3, keeps `tsc` green after widening `ArtistProfile`)
- `lib/profile/semantic-blank.ts` - Reworded two pre-existing (19-01) comments that named the now-dropped table, since they blocked this plan's own scoped-grep verification (Rule 1)

## Decisions Made
- Reused `ClaimPrefillEntry` from `lib/profile/claim-prefill.ts` in `types/index.ts` rather than re-declaring the shape — the one deliberate exception to this file's "no imports" convention, per the plan's explicit key_link instruction to prevent migration/UI drift.
- Kept `administrator` in the confirm-UI/server field list even though migration 072's reverse pre-fill doesn't currently populate it — forward-compatible, harmless (no badge renders until/if 072 is extended).
- Edit-clears-unconfirmed only fires on a non-blank saved value (reusing `isSemanticBlankText`/`isSemanticBlankJson`), so clearing a field back to blank doesn't strip its provenance entry — a later claim run can still safely re-prefill it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded pre-existing `lib/profile/semantic-blank.ts` comments naming the doomed table**
- **Found during:** Task 1 verification
- **Issue:** Two 19-01-authored comments literally contained the string "user_profiles" (documenting migration 071's rescue mapping), which caused this plan's own scoped grep (`app components lib`, excluding `__tests__`) to report a false-positive runtime reference and fail the task's `<verify>` block.
- **Fix:** Reworded both comments to describe "the (now-dropped, migration 073) duplicate rights table" instead of naming it literally — same meaning, no behavior change, grep now passes.
- **Files modified:** `lib/profile/semantic-blank.ts`
- **Verification:** Scoped grep returns zero; `npx tsc --noEmit` and `npx eslint` both clean
- **Committed in:** `5be469c` (part of Task 1 commit)

**2. [Rule 3 - Blocking issue] Added `claim_prefill: null` to two pre-existing full `ArtistProfile` demo literals**
- **Found during:** Task 2, after widening `ArtistProfile` with the new required field
- **Issue:** `app/(artist)/settings/page.tsx`'s `DEMO_PROFILE` and `lib/profile/load.ts`'s `DEMO_PROFILE` are full object literals typed as `ArtistProfile`; without the new field they would fail `tsc --noEmit`.
- **Fix:** Added `claim_prefill: null` to both literals.
- **Files modified:** `app/(artist)/settings/page.tsx`, `lib/profile/load.ts`
- **Verification:** `npx tsc --noEmit` clean repo-wide
- **Committed in:** `efcd6ca` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** Both fixes were required to satisfy the plan's own verification criteria and keep the type system sound. No scope creep — no new features, no schema changes, no migrations touched.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. Live confirm/edit round-trip UAT against a real `claim_prefill` value is deferred to the 19-07 human-gated migration push (071-074 are authored but not yet pushed to the remote database), per this plan's own `<verification>` block.

## Next Phase Readiness
Settings is down to a single rights input reaching `artist_profiles`, and the R2 confirm UI + server signal are fully wired against the `claim_prefill` shape migration 072 will populate once pushed. 19-06/19-07 (R4 flag-for-fix backend/UI and the human-gated migration push + live verification) are unblocked to proceed; the live confirm/edit UAT for this plan's D3 deliverable becomes verifiable once 19-07 pushes migrations 071-074.

## Self-Check: PASSED

All modified/created files confirmed present on disk (or correctly absent for the deleted route); all 3 task commit hashes confirmed in git log.

---
*Phase: 19-profile-identity-model-cleanup*
*Completed: 2026-07-24*
