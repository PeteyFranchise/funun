---
phase: 18-split-sheet-home
plan: 05
subsystem: database
tags: [supabase, postgres, migration, trigger, security-definer, split-sheet, collaborators, identity]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "split_sheet_parties.approval_status lifecycle (lib/split-sheets/lifecycle.ts), agreement.ts's composeLegalNameFromProfile, migration 026's claim_collaborators()/backfill_claimed_collaborators() and 040's private-by-column-grant posture, 063's administrator column precedent"
provides:
  - "Migration 066 (additive) — collaborators.legal_name, collaborators.status (pending/confirmed, DEFAULT confirmed, CHECK), artist_profiles.legal_name_locked_at, plus two status-confirmation triggers (claimed⇒confirmed BEFORE trigger on collaborators; sheet-response⇒confirmed SECURITY DEFINER AFTER trigger on split_sheet_parties)"
  - "lib/split-sheets/live-identity.ts — pure resolvePartyIdentity() overwrite-semantics live-identity resolver, freeze-boundary-aware via lifecycle.ts's SplitSheetStatus"
  - "Settings legal-name confirm-and-lock: ArtistProfile.legal_name_locked_at type, server-owned one-time lock stamp in PATCH /api/profile, ProfileForm.tsx confirm-and-lock control"
affects: [18-01, 18-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Overwrite (not COALESCE) live-identity resolution as a pure read-time function, never a mutation of the existing additive backfill_claimed_collaborators()/claim_collaborators() (026) — the divergence lives entirely in a new module (research Pitfall 5)"
    - "SECURITY DEFINER trigger scoped strictly by a server-owned id read off the row that changed (NEW.collaborator_id), never a client-supplied id — mirrors claim_collaborators()'s cross-user-write discipline, extended here to an unauthenticated token-holder's write path"
    - "Server-owned one-time timestamp stamp (legal_name_locked_at) kept out of the mass-assignment EDITABLE_FIELDS allowlist, written only via new Date().toISOString() when currently null — same discipline as sanitizeCollaborator's archived_at"

key-files:
  created:
    - supabase/migrations/066_split_sheet_identity_foundation.sql
    - __tests__/migration-066.test.ts
    - lib/split-sheets/live-identity.ts
    - lib/split-sheets/live-identity.test.ts
  modified:
    - types/index.ts
    - app/api/profile/route.ts
    - components/profile/ProfileForm.tsx
    - lib/profile/load.ts
    - "app/(artist)/settings/page.tsx"

key-decisions:
  - "collaborators.status is a brand-new column, not an extension of collaborator_invites (018) — that table is scoped to the educational-IPI invite-token flow, not the roster-level pending/confirmed concept deliberation §6 describes"
  - "resolvePartyIdentity() overwrite semantics diverge deliberately from backfill_claimed_collaborators()'s COALESCE convention: a claimed party's own current profile data is verified truth and should replace the frozen snapshot pre-mint; a null/blank live field still falls back to the frozen value rather than blanking it"
  - "The sheet-response-confirms trigger is SECURITY DEFINER with SET search_path = '' (migration 034 precedent) because an unauthenticated /approve/[token] party's response must be able to flip the initiator's collaborators row — safety comes from scoping the UPDATE to NEW.collaborator_id, never a client-supplied id"
  - "legal_name_locked_at follows migration 040's private-by-omission posture (same as 063's administrator) — no new GRANT/REVOKE statement; the column is simply absent from 040's GRANT lists"
  - "Task 4's live DB push verification used LOCAL=REMOTE migration-list parity as the recorded evidence (no psql/pg/psycopg available in the push environment for direct column/trigger introspection) — consistent with this project's established migration-verification convention (09-01b, 10-02, 15-01, 17-01 checkpoints all recorded the same way)"

patterns-established:
  - "Migration-string-assertion test style (mirroring migration-063.test.ts) extended to trigger-bearing migrations: assert both CREATE TRIGGER statements, the DROP TRIGGER IF EXISTS idempotency guard, the CHECK constraint text, and the absence of any GRANT statement"

requirements-completed: []
# HOME-02/HOME-03 intentionally left Pending in REQUIREMENTS.md — this plan is the
# enabling infrastructure layer (schema + resolver + Settings lock gesture); the
# user-facing HOME-02/HOME-03 surfaces ship in 18-01 (living-draft builder).

coverage:
  - id: D1
    description: "Migration 066 adds collaborators.legal_name/status (DEFAULT confirmed, CHECK pending/confirmed) and artist_profiles.legal_name_locked_at, all additive/idempotent, no GRANT emitted, migration 026's functions untouched"
    requirement: "HOME-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-066.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolvePartyIdentity() overwrites a claimed party's PRO/IPI/publishing-designee/administrator/legal-name pre-esign_pending, falls back to frozen on missing live fields, returns frozen unchanged post-mint and for unclaimed parties"
    requirement: "HOME-03"
    verification:
      - kind: unit
        ref: "lib/split-sheets/live-identity.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings Legal Identity section offers a one-time confirm-and-lock control; PATCH /api/profile stamps legal_name_locked_at server-side (new Date(), one-time, no unlock, kept out of EDITABLE_FIELDS)"
    requirement: "HOME-02"
    verification:
      - kind: unit
        ref: "npx jest (full suite, no dedicated ProfileForm unit test — covered by tsc/lint/grep structural checks per the plan's own verify block)"
        status: pass
    human_judgment: true
    rationale: "The plan's own verify block for Task 3 specifies a <human-check> (enter a legal name, confirm-and-lock, reload, confirm persistence) — this requires a live Supabase session and browser interaction, not exercisable by a unit test in this execution context."
  - id: D4
    description: "Migration 066 applied to the live remote database; existing collaborators rows read status='confirmed' via the DEFAULT backfill; no data lost"
    verification:
      - kind: manual_procedural
        ref: "npx supabase migration list — LOCAL=REMOTE for 001-066"
        status: pass
    human_judgment: true
    rationale: "Blocking checkpoint (Task 4) — executor agents never run supabase db push. Direct SQL column/trigger introspection was unavailable in the push environment (no psql/pg/psycopg, no CLI arbitrary-SQL command); LOCAL=REMOTE migration-list parity is the recorded primary evidence, consistent with this project's established migration-verification convention."

# Metrics
duration: ~35min (tasks 1-3, prior executor) + checkpoint resolution (this session)
completed: 2026-07-22
status: complete
---

# Phase 18 Plan 05: Identity Foundation Summary

**Migration 066 live (collaborators.legal_name/status + artist_profiles.legal_name_locked_at + two status-confirmation triggers), the pure overwrite-semantics resolvePartyIdentity() live-identity resolver, and Settings' one-time legal-name confirm-and-lock — the schema/plumbing layer 18-01's living-draft builder depends on.**

## Performance

- **Tasks:** 4 of 4 (3 executor tasks + 1 human-gated checkpoint, now resolved)
- **Files modified:** 9 (4 created, 5 modified)
- **Completed:** 2026-07-22

## Accomplishments

- **Migration 066** (`supabase/migrations/066_split_sheet_identity_foundation.sql`, now LIVE): adds `collaborators.legal_name` (nullable TEXT), `collaborators.status` (NOT NULL DEFAULT 'confirmed', CHECK IN ('pending','confirmed')), and `artist_profiles.legal_name_locked_at` (nullable TIMESTAMPTZ, private by migration-040 omission). Two triggers: a BEFORE INSERT OR UPDATE trigger on `collaborators` forcing `status = 'confirmed'` whenever `claimed_by IS NOT NULL`; a SECURITY DEFINER AFTER UPDATE OF `approval_status` trigger on `split_sheet_parties` that flips the linked `collaborators` row to `confirmed` the instant a party's response leaves `pending`, scoped strictly by the server-owned `NEW.collaborator_id`. All additive/idempotent; string-asserted in `__tests__/migration-066.test.ts`; migration 026's `claim_collaborators()`/`backfill_claimed_collaborators()` left untouched.
- **`lib/split-sheets/live-identity.ts`**: `resolvePartyIdentity(frozenSnapshot, claimedProfile, sheetStatus)` — pre-`esign_pending` with a claimed profile, the claimed user's current PRO/IPI/publishing-designee/administrator/legal-name overwrite the frozen snapshot field-by-field (null/blank live fields fall back to frozen rather than blanking); post-`esign_pending`/`executed`, or for an unclaimed party, the frozen snapshot returns unchanged. Imports `SplitSheetStatus` from `lib/split-sheets/lifecycle.ts` rather than restating the union.
- **Settings confirm-and-lock**: `ArtistProfile.legal_name_locked_at` type added; `PATCH /api/profile` accepts a `lock_legal_name === true` signal and stamps `legal_name_locked_at = new Date().toISOString()` server-side, only when not already locked and alongside a non-empty composed legal name, kept out of `EDITABLE_FIELDS` (no client-supplied timestamp, no unlock path); `ProfileForm.tsx`'s Legal Identity section shows a live-preview confirm action when unlocked and a "confirmed on {date}" state once locked, with name fields still editable for correction.
- **Task 4 checkpoint resolved**: the developer ran `supabase db push`; `npx supabase migration list` confirms migration 066 in both LOCAL and REMOTE columns, with 001-066 all matching. Existing `collaborators` rows backfilled to `status = 'confirmed'` by the column DEFAULT. No data lost.

## Task Commits

1. **Task 1: Migration 066 + string-assertion test** — `882068d` (feat, includes RED+GREEN — migration authored and tested together per this plan's TDD framing)
2. **Task 2: Pure live-identity resolver (`resolvePartyIdentity`)** — `71cce12`
3. **Task 3: Legal-name confirm-and-lock in Settings** — `869d192`
4. **Task 4: Human-gated database push** — resolved by the developer via `supabase db push` (no agent commit; verified via `npx supabase migration list`)

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/migrations/066_split_sheet_identity_foundation.sql` — the three additive columns + two triggers
- `__tests__/migration-066.test.ts` — string-assertion coverage (columns, CHECK/DEFAULT, both triggers, no-GRANT, additive-only guards)
- `lib/split-sheets/live-identity.ts` — pure `resolvePartyIdentity()` resolver
- `lib/split-sheets/live-identity.test.ts` — overwrite/fallback/freeze-boundary/unclaimed coverage
- `types/index.ts` — `ArtistProfile.legal_name_locked_at`
- `app/api/profile/route.ts` — server-owned one-time lock stamp handling
- `components/profile/ProfileForm.tsx` — confirm-and-lock control in Legal Identity section
- `lib/profile/load.ts`, `app/(artist)/settings/page.tsx` — demo-mode `ArtistProfile` fixtures extended with `legal_name_locked_at` (Rule 3 fix, see Deviations)

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Demo-mode ArtistProfile fixtures missing the new required field**
- **Found during:** Task 3
- **Issue:** `types/index.ts`'s `ArtistProfile` type gained `legal_name_locked_at`; the two demo-mode fixture literals (`lib/profile/load.ts`'s `DEMO_PROFILE` and `app/(artist)/settings/page.tsx`'s `DEMO_PROFILE`) did not include it, which would fail `tsc --noEmit` under strict mode.
- **Fix:** Added `legal_name_locked_at: null` to both fixture literals.
- **Files modified:** `lib/profile/load.ts`, `app/(artist)/settings/page.tsx`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `869d192` (part of Task 3 commit)

### Checkpoint resolution (not a deviation — Task 4 as specified)

**Task 4 (human-gated database push):** the developer applied migration 066 via `supabase db push`. Verification: `npx supabase migration list` shows migration 066 present in BOTH LOCAL and REMOTE columns, with 001–066 all matching (LOCAL=REMOTE). The `DROP TRIGGER IF EXISTS` notices seen during push were expected first-creation notices, not errors. Direct SQL column/trigger introspection (e.g., `psql \d collaborators`) was unavailable in the push environment — no `psql`/`pg`/`psycopg`, and the Supabase CLI has no arbitrary-SQL command — so LOCAL=REMOTE migration-history parity is the recorded primary evidence. This matches the established convention this project has used at every prior migration-push checkpoint (09-01b, 10-02, 15-01, 17-01, 17-09). No data loss; pre-existing `collaborators` rows read `status = 'confirmed'` via the column DEFAULT.

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking type error)
**Impact on plan:** Necessary for `tsc --noEmit` to stay clean once the type gained a new field. No scope creep.

## Issues Encountered

None beyond the Rule 3 fixture fix and the expected absence of direct-SQL introspection tooling at push time (both documented above).

## Verification

- `npx jest` (full suite): **73 suites / 871 tests passing**, all green.
- `npx tsc --noEmit`: clean.
- `npm run lint` (`--max-warnings=0`): clean.
- Migration 066: LIVE on the remote database, `npx supabase migration list` confirms LOCAL=REMOTE for 001-066.
- Manual: confirm-and-lock persistence across reload — deferred to the human `<human-check>` in the plan's own Task 3 verify block (not independently re-run this session; no code changed since Task 3's original commit that would invalidate it).

## User Setup Required

None — no external service configuration required. The one manual step (the DB push) was the plan's own designed checkpoint and is now complete.

## Next Phase Readiness

- The schema, resolver, and Settings lock gesture 18-01's living-draft surface depends on are all live and tested. 18-01 (wave 2, depends on 18-05) is unblocked.
- Known cross-phase follow-up (recorded per the plan's instruction, not built here): the live-link promise holds up to `esign_pending`, but the actual freeze-at-mint capture of resolved values into `split_sheet_parties` belongs in `app/api/split-sheets/[id]/mint-envelope/route.ts` (Phase 17 territory, out of this plan's file scope). Not a silent drop — recorded here and in the plan body (research Assumption A4) for whichever future plan adds the mint-envelope write-back.
- REQUIREMENTS.md: HOME-02/HOME-03 intentionally left **Pending** — this plan is the enabling infrastructure layer; they flip to complete when 18-01's user-facing surfaces ship.

---
*Phase: 18-split-sheet-home*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 4 created files confirmed present on disk (`supabase/migrations/066_split_sheet_identity_foundation.sql`, `__tests__/migration-066.test.ts`, `lib/split-sheets/live-identity.ts`, `lib/split-sheets/live-identity.test.ts`); all 3 task commits (`882068d`, `71cce12`, `869d192`) confirmed in git log. Full suite 73/73 suites, 871/871 tests green; `tsc --noEmit` and `npm run lint` clean. Migration 066 confirmed LOCAL=REMOTE via `npx supabase migration list`.
