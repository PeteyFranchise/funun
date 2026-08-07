---
phase: 18-split-sheet-home
plan: 03
subsystem: database
tags: [supabase, postgres, migration, split-sheet, track-attachment, join-table, fuzzy-matching]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "17-05's attach route (party-and-owner double authorization check, generic cross-user rejection shape), the executed-only status gate being relaxed here, and lib/split-sheets/reconciliation.ts's name-normalization approach reused by the fuzzy title matcher"
provides:
  - "Migration 067 (additive, LIVE) — split_sheets.track_id/source, split_sheet_attachments join table with two partial unique indexes (track-set / track-null cases), RLS with server-owned writes, idempotent backfill from existing vault_project_id associations"
  - "lib/split-sheets/attachment.ts — suggestTrackMatches (fuzzy, never a confident wrong match), detectTrackConflicts (reports only), describeSignedTitle (signed-as vs current-title record, no reissue implied)"
  - "Attach route v2 (optional track_id, executed-only gate removed) + new detach route, both under the unchanged party-and-owner double check"
  - "Attach UI from both directions: Locker-side (app/(artist)/split-sheets/[id]/attach/page.tsx + AttachSheetPanel.tsx) and Vault-side (components/vault/LinkSplitSheet.tsx wired into vault documents page)"
affects: [18-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique indexes (not a plain composite unique constraint) to close the NULL-comparison trap on the sheet/project/track triple — one index WHERE track_id IS NOT NULL, one WHERE track_id IS NULL"
    - "Deliberately opposite cascade behaviors on sibling foreign keys, each commented at the point of the decision: attachment row CASCADEs away with its project, track reference SET NULLs so a deleted track never deletes the legal record of who wrote the song"
    - "Fuzzy matcher marks a leading candidate only above a confidence threshold and is never preselected in the UI — a wrong confident suggestion on a legal document is treated as worse than no suggestion"
    - "Primary-document-row update guarded (project null or unchanged) so a second/third project attach on the same sheet creates a new attachment row without ever moving or duplicating the caller's vault_documents row"

key-files:
  created:
    - supabase/migrations/067_split_sheet_song_attachment.sql
    - __tests__/migration-067.test.ts
    - lib/split-sheets/attachment.ts
    - lib/split-sheets/attachment.test.ts
    - app/api/split-sheets/[id]/detach/route.ts
    - "app/(artist)/split-sheets/[id]/attach/page.tsx"
    - components/split-sheets/AttachSheetPanel.tsx
    - components/vault/LinkSplitSheet.tsx
  modified:
    - app/api/split-sheets/[id]/attach/route.ts
    - lib/split-sheets/reconciliation.ts
    - lib/split-sheets/distribution.test.ts
    - "app/(artist)/vault/[projectId]/documents/page.tsx"

key-decisions:
  - "Migration numbered 067, not 064 — 064/065 were already consumed by later fixes elsewhere in the phase's migration sequence; renumbered in a dedicated commit (b132887) before authoring to avoid a collision, per this project's established live-schema convention"
  - "The executed-only attach gate is REMOVED, not relaxed conditionally — a sheet at any lifecycle status may attach (P18-04); readiness consequence is bounded because 18-04 scores an attached sheet at the tier its own status has earned, not as fully documented"
  - "Attach v2 updates the caller's own vault_documents row only when it is the primary attachment (project null or unchanged) — a second/third attach on an already-attached sheet writes a new split_sheet_attachments row without moving or duplicating the document row (design section 2c)"
  - "No notification on attach in v1 (design section 9 item 5) and the routes accept no note/reason/message field, closing the free-text-across-a-block vector this plan's threat register names (T-18-20)"
  - "detectTrackConflicts() and the UI's conflict flag report a two-sheets-on-one-track state without blocking either sheet — the artist may be mid-correction, and the flag plus detach is the recovery path rather than a hard stop"

requirements-completed: [HOME-09, HOME-10, HOME-11]

coverage:
  - id: D1
    description: "Migration 067 adds split_sheets.track_id (nullable, ON DELETE SET NULL) and split_sheets.source (default 'funun', CHECK constrained), plus split_sheet_attachments with both partial unique indexes, opposite-cascade FKs, RLS/server-owned writes, and an idempotent backfill — all string-asserted"
    requirement: "HOME-09"
    verification:
      - kind: unit
        ref: "__tests__/migration-067.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Attach v2 accepts an optional track verified to belong to the destination project before any write, at any sheet status (executed-only gate removed), idempotently, without duplicating documents; detach removes only the attachment row and never deletes split_sheets/split_sheet_parties/vault_documents/storage"
    requirement: "HOME-10"
    verification:
      - kind: unit
        ref: "lib/split-sheets/attachment.test.ts (authorization matrix, cross-project track rejection, idempotent re-attach, two-project attach, detach non-destruction)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Locker-side (project-then-track, explicit whole-release option, detach) and Vault-side (unattached-sheet picker with fuzzy suggestion against project tracks) attach surfaces, with visible divergent-title, removed-track, and conflict-flag handling and a permanent source label; no PDF regeneration control anywhere"
    requirement: "HOME-11"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit / npm run lint / npx jest structural + grep checks per the plan's own verify block"
        status: pass
      - kind: manual_procedural
        ref: "Deferred human-check (see Deferred human-checks below) — the plan's Task 3 verify block requires live split_sheet_attachments/split_sheets.track_id/source data, unavailable until Task 4's migration push"
        status: deferred
    human_judgment: true
    rationale: "Task 3's own verify block specifies a <human-check> (attach from both directions, two-project attach, detach survival, renamed-title display) that requires live schema and a browser session — not exercisable in this execution context even now that the schema is live; recorded as a deferred human-check below rather than silently skipped."
  - id: D4
    description: "Migration 067 applied to the live remote database via supabase db push; LOCAL=REMOTE migration-list parity confirmed for 001-067"
    verification:
      - kind: manual_procedural
        ref: "npx supabase migration list (run by the developer) — LOCAL=REMOTE for 001-067"
        status: pass
    human_judgment: true
    rationale: "Blocking checkpoint (Task 4) — executor agents never run supabase db push. Direct SQL introspection was unavailable in the push environment (no psql/pg/psycopg, no CLI arbitrary-SQL command), so the backfill row-count comparison could not be run live; LOCAL=REMOTE migration-list parity is the recorded primary evidence, consistent with this project's established migration-verification convention (09-01b, 10-02, 15-01, 17-01, 17-09, 18-05)."

# Metrics
duration: ~25min (tasks 1-3, prior executor) + checkpoint resolution + regression gate (this session)
completed: 2026-07-22
status: complete
---

# Phase 18 Plan 03: Song-Level Attachment Summary

**Migration 067 live — split_sheets.track_id/source, the split_sheet_attachments join table (with the NULL-comparison-safe partial unique indexes and opposite-cascade FKs), attach v2 with the executed-only gate removed, detach, and attach UI from both the Locker and Vault directions with never-preselected fuzzy title matching.**

## Performance

- **Tasks:** 4 of 4 (3 executor tasks + 1 human-gated checkpoint, now resolved)
- **Files modified:** 12 (8 created, 4 modified)
- **Completed:** 2026-07-22

## Accomplishments

- **Migration 067** (`supabase/migrations/067_split_sheet_song_attachment.sql`, now LIVE): adds `split_sheets.track_id` (nullable UUID, `ON DELETE SET NULL`) and `split_sheets.source` (default `'funun'`, CHECK-constrained to `'funun'`/`'uploaded'`). Creates `split_sheet_attachments` (`split_sheet_id` CASCADE, `vault_project_id` CASCADE, `track_id` SET NULL, `attached_at`, `attached_by`) with two partial unique indexes — one over all three columns where `track_id IS NOT NULL`, one over sheet+project where `track_id IS NULL` — closing the trap where a plain unique constraint lets the project-level (whole-release) case duplicate freely. RLS enabled; INSERT/UPDATE/DELETE revoked from `authenticated`/`anon` so writes happen only through the service-role route; SELECT policies mirror migration 018's initiator/party pair plus a project-owner read path. Idempotent insert-select backfill covers every pre-existing `vault_project_id` association. String-asserted in `__tests__/migration-067.test.ts`.
- **`lib/split-sheets/attachment.ts`**: `suggestTrackMatches()` (normalized-title fuzzy match reusing `reconciliation.ts`'s `normalizeName`, marks a leading candidate only above a confidence threshold — a rename produces a weak/zero match, never a wrong confident one), `detectTrackConflicts()` (reports every track claimed by more than one sheet, resolves nothing), `describeSignedTitle()` (structured signed-as-vs-current-title record, implies no reissue).
- **Attach v2 + detach**: `POST /api/split-sheets/[id]/attach` now accepts an optional `track_id`, verified against the destination project before any write; the executed-only status gate is removed per P18-04 (commented in-source at the removed check); the party-and-owner double authorization check is unchanged and re-asserted by the authorization-matrix test; a second/third project attach on the same sheet writes a new `split_sheet_attachments` row without moving/duplicating the caller's primary `vault_documents` row; re-attaching an identical triple is an idempotent no-op. `POST /api/split-sheets/[id]/detach` is new: removes only the matching attachment row and nulls the caller's own document row when it points at the removed attachment — no delete of `split_sheets`, `split_sheet_parties`, `vault_documents`, or storage. Both routes carry the P18-12 comment at their cross-party reads (17-DUAL-ENTRY-DESIGN §10c: block filtering deliberately not applied to shared executed agreements).
- **Attach UI, both directions**: Locker-side (`app/(artist)/split-sheets/[id]/attach/page.tsx` + `AttachSheetPanel.tsx`) — project first, then track, with the leading fuzzy candidate surfaced as a suggestion (never preselected) plus an explicit "covers the whole release" option, current attachments listed with a detach control. Vault-side (`components/vault/LinkSplitSheet.tsx`, wired into `app/(artist)/vault/[projectId]/documents/page.tsx`) — offers the caller's unattached sheets (a sheet already attached elsewhere still qualifies) with the fuzzy suggestion computed against this project's tracks, listing every sheet covering the release via `split_sheet_attachments` rather than only `vault_documents`. Both surfaces render the divergent signed-as-title, a track-removed indication when the attached track has been deleted, and the two-sheets-on-one-track conflict flag without blocking any state. The `source` provenance value is a plain permanent label on both surfaces; no extraction is built. Attach/detach wiring stays type-agnostic where free, without building an abstraction for a document type that doesn't exist yet.
- **Task 4 checkpoint resolved**: the developer applied migration 067 via `supabase db push`. `npx supabase migration list` shows migration 067 present in BOTH LOCAL and REMOTE columns, with 001-067 all matching (LOCAL=REMOTE).

## Task Commits

1. **Task 0 (prep): renumber migration 064→067** — `b132887` (docs, 064/065 already consumed elsewhere in the phase's migration sequence)
2. **Task 1: Migration 067 — track_id, source, attachments join table, backfill** — `6f4e526` (feat, includes RED+GREEN — migration authored and tested together)
3. **Task 2: Attachment module, attach v2, detach** — `57a909b`
4. **Task 3: Attach UI from both directions (Locker + Vault)** — `45fe7f6`
5. **Task 4: Human-gated database push** — resolved by the developer via `supabase db push` (no agent commit; verified via `npx supabase migration list`)

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/migrations/067_split_sheet_song_attachment.sql` — track_id/source columns, split_sheet_attachments table, both partial unique indexes, RLS, idempotent backfill
- `__tests__/migration-067.test.ts` — string-assertion coverage (both indexes, both cascade behaviors, the REVOKE, the idempotent backfill)
- `lib/split-sheets/attachment.ts` — suggestTrackMatches / detectTrackConflicts / describeSignedTitle
- `lib/split-sheets/attachment.test.ts` — matcher (including rename/no-confident-wrong-match), conflict detection, divergent-title record, authorization matrix, cross-project rejection, idempotency, two-project attach, detach non-destruction
- `app/api/split-sheets/[id]/attach/route.ts` — extended with optional track_id, executed-only gate removed, P18-12 comment at cross-party reads
- `app/api/split-sheets/[id]/detach/route.ts` — new, non-destructive detach
- `lib/split-sheets/reconciliation.ts` — exported `normalizeName` for reuse by the attachment matcher
- `lib/split-sheets/distribution.test.ts` — attach-route suite relocated into `attachment.test.ts` (behavior changed)
- `app/(artist)/split-sheets/[id]/attach/page.tsx`, `components/split-sheets/AttachSheetPanel.tsx` — Locker-side attach direction
- `components/vault/LinkSplitSheet.tsx`, `app/(artist)/vault/[projectId]/documents/page.tsx` — Vault-side attach direction

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

None beyond the pre-authoring migration renumber (064→067), which was necessary scheduling housekeeping rather than a deviation from task behavior — recorded as its own commit (`b132887`) ahead of Task 1.

### Checkpoint resolution (not a deviation — Task 4 as specified)

**Task 4 (human-gated database push):** the developer applied migration 067 via `supabase db push`. Verification: `npx supabase migration list` shows migration 067 present in BOTH LOCAL and REMOTE columns, with 001-067 all matching (LOCAL=REMOTE). Direct SQL introspection (`psql`, column/index/trigger inspection, or the backfill row-count comparison the plan's own `<how-to-verify>` step 2/4 calls for) was unavailable in the push environment — no `psql`/`pg`/`psycopg`, and the Supabase CLI has no arbitrary-SQL command — so LOCAL=REMOTE migration-history parity is the recorded primary evidence. This matches the established convention this project has used at every prior migration-push checkpoint (09-01b, 10-02, 15-01, 17-01, 17-09, 18-05).

### Deferred human-checks (residual UAT, now exercisable against live schema)

Two items could not be exercised without the live schema and are deferred to phase verification, now that migration 067 is live:

1. **Migration-067 backfill row-count spot-check.** The plan's checkpoint `<how-to-verify>` calls for confirming, before and after the push, that `split_sheet_attachments` gained exactly one row per pre-existing `split_sheets` row with a non-null `vault_project_id`, and that no `split_sheets` row lost its `vault_project_id`. This comparison requires a live SQL client against the production database, which was unavailable in this push environment. Needs: a spot-check query (e.g. via the Supabase dashboard SQL editor or a local `psql` session) confirming `count(split_sheet_attachments)` for backfilled rows equals `count(split_sheets WHERE vault_project_id IS NOT NULL)` as of the pre-push snapshot.
2. **Task 3's browser human-check.** From the plan's own Task 3 verify block: attach an existing unattached sheet to a Vault project and confirm the fuzzy suggestion offers the right track without preselecting it; attach the same sheet to a second project from the sheet's attach page and confirm both attachments coexist against one PDF; detach one and confirm the sheet and PDF survive; rename a track after attaching and confirm the signed-as title displays with no reissue control anywhere. This was structurally deferred during Task 3 (no live `split_sheet_attachments`/`track_id`/`source` data existed yet) and is now exercisable in a browser session against the live schema — not run in this non-interactive session.

## Issues Encountered

None beyond the two deferred human-checks documented above and the expected absence of direct-SQL introspection tooling at push time.

## Verification

- `npx jest`: **75 suites / 909 tests passing**, all green.
- `npx tsc --noEmit`: clean.
- `npm run lint` (`--max-warnings=0`): clean.
- Migration 067: LIVE on the remote database, `npx supabase migration list` (run by the developer) confirms LOCAL=REMOTE for 001-067.
- Manual: both attach directions, two-project attach, detach survival, renamed-title display — deferred (see Deferred human-checks above).
- Manual: migration-067 backfill row-count spot-check — deferred (see Deferred human-checks above).

## User Setup Required

None — no external service configuration required. The one manual step (the DB push) was the plan's own designed checkpoint and is now complete. The two deferred human-checks above are recommended before or during phase-level verification.

## Next Phase Readiness

- `split_sheet_attachments` rows are live and readable; 18-04's coverage-based readiness derivation (which scores tracks by whether an attachment reaches them) is unblocked.
- REQUIREMENTS.md: HOME-09/HOME-10/HOME-11 flip to **Complete** — this plan is their sole owner (per REQUIREMENTS.md's Phase 18 traceability table) and all three are fully implemented and live, following the same convention used for ESIGN-11 in Phase 17 (17-05-SUMMARY.md), where a plan's own human-check being deferred to phase verification did not block marking the owned requirement complete.

---
*Phase: 18-split-sheet-home*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 8 created files confirmed present on disk (`supabase/migrations/067_split_sheet_song_attachment.sql`, `__tests__/migration-067.test.ts`, `lib/split-sheets/attachment.ts`, `lib/split-sheets/attachment.test.ts`, `app/api/split-sheets/[id]/detach/route.ts`, `app/(artist)/split-sheets/[id]/attach/page.tsx`, `components/split-sheets/AttachSheetPanel.tsx`, `components/vault/LinkSplitSheet.tsx`); all 4 commits (`b132887`, `6f4e526`, `57a909b`, `45fe7f6`) confirmed in git log. Full suite 75/75 suites, 909/909 tests green; `tsc --noEmit` and `npm run lint` clean. Migration 067 confirmed LOCAL=REMOTE via `npx supabase migration list` (developer-run, per checkpoint resolution above).
