---
phase: 18-split-sheet-home
plan: 02
subsystem: contracts
tags: [nextjs, supabase, react, contracts, split-sheets, locker, trust-safety]

# Dependency graph
requires:
  - phase: 18-split-sheet-home
    provides: "18-01's /split-sheets/[id] detail page and lib/split-sheets/list.ts's fetchSplitSheetsForUser() initiated+party-of merge; 18-03's /split-sheets/[id]/attach page and split_sheets.track_id/vault_project_id origin fields"
provides:
  - "lib/contracts/locker-attention.ts — buildAttentionSections(), the pure P18-10 attention derivation (awaiting signature, drafts in progress, unattached executed, songs with no sheet, settled archive)"
  - "derivePartyProgressState() — the invited/opened/signed 3-state per-party label, zero new schema"
  - "resolveViewerContext() — P18-11 own-context resolution (share %, signing state) per viewer"
  - "app/api/contracts/documents/[id]/hide/route.ts — per-party, non-destructive soft-hide"
  - "The attention-first Contract Locker landing (components/contracts/ContractLocker.tsx)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildAttentionSections({ viewerUserId, sheets, documents, projects, hiddenDocumentIds }) — a pure, no-I/O derivation over plain row arrays, matching lib/vault/readiness-tiers.ts's convention; an unrecognized sheet status degrades to the archive rather than throwing"
    - "3-state per-party label as its own small exported function (derivePartyProgressState), tested independently of the section-bucketing logic"
    - "Viewer-context resolution (resolveViewerContext) as its own exported function — the P18-11 property that two viewers of one sheet see two different shares from the same input rows"
    - "document_data read-then-merge (never whole-object overwrite) for the hide route, preserving the migration 049 evidence guard's inputs"
    - "A flat, non-nested vault_documents query (id, document_data, scoped by user_id) to resolve hidden state uniformly across nested (project-attached) and standalone documents, without touching lib/contracts/locker-rows.ts's existing project-nested query shape"

key-files:
  created:
    - lib/contracts/locker-attention.ts
    - lib/contracts/locker-attention.test.ts
    - app/api/contracts/documents/[id]/hide/route.ts
    - __tests__/locker-hide-route.test.ts
  modified:
    - "app/(artist)/contracts/page.tsx"
    - components/contracts/ContractLocker.tsx
    - lib/contracts/locker-rows.ts

key-decisions:
  - "Reused 18-01's fetchSplitSheetsForUser() (lib/split-sheets/list.ts) directly for the widened split_sheets read, rather than re-implementing the initiated+party-of merge a second time in lib/contracts/locker-rows.ts — the two files needed the identical shape, and list.ts's version is already unit-tested"
  - "'Songs with no sheet' coverage is computed directly from the fetched sheets' own track_id/vault_project_id (origin fields), not via a second split_sheet_attachments join — keeps the pure module simple and needs no new query; a project-level (track_id null) sheet attached to a project is treated as covering every track in that project, per migration 067's 'covers the whole release' exception"
  - "'Unattached executed' is determined by vaultProjectId === null on the sheet itself (the origin field, set on first attach), not by a separate split_sheet_attachments lookup — consistent with the existing 17-05 'unattached' convention already used for vault_documents rows"
  - "A 'countered' party's 3-state label falls through the same viewed/unviewed branch as 'pending' (opened vs invited) rather than inventing a fourth label — a countered party has necessarily viewed the sheet to counter it, and the spec names only three states"
  - "Widened lib/contracts/locker-rows.ts's project-nested tracks select to include `title` (previously `id, metadata` only) — an additive, low-risk extension needed so the songs-with-no-sheet section can name a track; not in the plan's original files_modified list but required for the section's own stated purpose (Rule 2/3 deviation, documented below)"
  - "Hidden-flag resolution uses a dedicated flat query (id, document_data, scoped by user_id) rather than widening the nested project query's select — covers both project-nested and standalone vault_documents rows in one pass without touching locker-rows.ts's merge logic at all"
  - "The hide action is offered in the archive detail panel (VerifyPanel) on every selected document, not gated to a 'multi-party' flag — ContractRow does not carry a reliable is-shared indicator across all document types, and the action's safety property (never deletes, never affects another party) holds regardless of whether the document happens to be shared"

patterns-established:
  - "A pure attention-derivation module consumed by both a server component (for data) and a client component (for rendering), with the client deriving zero lifecycle state of its own — every label is a pass-through"

requirements-completed: [HOME-06, HOME-07, HOME-08]

coverage:
  - id: D1
    description: "buildAttentionSections() returns the four P18-10 sections in fixed order plus a settled archive, derived with no I/O and no model call from plain row arrays"
    requirement: "HOME-06"
    verification:
      - kind: unit
        ref: "lib/contracts/locker-attention.test.ts — section ordering test"
        status: pass
    human_judgment: false
  - id: D2
    description: "derivePartyProgressState() derives invited/opened/signed purely from approval_status + first_viewed_at, with zero new schema; all three combinations tested"
    requirement: "HOME-06"
    verification:
      - kind: unit
        ref: "lib/contracts/locker-attention.test.ts — derivePartyProgressState describe block"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolveViewerContext() resolves the viewer's OWN share/state from party rows; two different viewers of one sheet see two different shares; an initiator-only viewer (not a named party) gets a null share, never another party's figure"
    requirement: "HOME-07"
    verification:
      - kind: unit
        ref: "lib/contracts/locker-attention.test.ts — resolveViewerContext describe block"
        status: pass
    human_judgment: false
  - id: D4
    description: "A draft whose initiator is someone else is excluded from every section AND the archive for that viewer"
    requirement: "HOME-07"
    verification:
      - kind: unit
        ref: "lib/contracts/locker-attention.test.ts — buildAttentionSections drafts describe block"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Locker page query reads split_sheets (initiated+party-of, with parties' approval_status and first_viewed_at) and project tracks alongside vault_documents; the P18-12 block exception is documented in-source at the query, citing 17-DUAL-ENTRY-DESIGN.md section 10c; no block filtering is applied anywhere in the read path (confirmed by inspection — no isBlockedRelativeTo/block-check import anywhere in the touched files)"
    requirement: "HOME-08"
    verification:
      - kind: unit
        ref: "grep checks in the plan's own verify block (split_sheets, first_viewed_at, 10c all present in page.tsx); npx tsc --noEmit; npm run lint"
        status: pass
    human_judgment: false
  - id: D6
    description: "POST /api/contracts/documents/[id]/hide is a per-caller, non-destructive marker write: 401 without a session, 404 unless the row belongs to the caller, no DELETE issued on any path, update scoped by user_id, document_data read-then-merged so pre-existing keys (esign evidence, split_sheet_id) survive"
    requirement: "HOME-07"
    verification:
      - kind: unit
        ref: "__tests__/locker-hide-route.test.ts — 401/404/no-delete/user_id-scoping/key-survival/unhide/null-document_data cases"
        status: pass
    human_judgment: false
  - id: D7
    description: "The Locker landing renders the four attention sections above the create section and the pre-existing archive; awaiting-signature rows show per-party signed/total progress AND the 3-state label; drafts link to /split-sheets/[id]; unattached executed sheets link to /split-sheets/[id]/attach; the Ask slot is present and inert; the component derives no lifecycle state itself"
    requirement: "HOME-06"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit / npm run lint / npx jest structural checks per the plan's verify block; grep for AttentionSections in ContractLocker.tsx"
        status: pass
      - kind: manual_procedural
        ref: "human-check: open /contracts with a draft, a sheet out for approval with a mix of signed/opened/not-yet-opened parties, and a project track lacking a sheet; confirm section order, per-party labels, draft link target, inert ask slot, and hide scoped to one view"
        status: unknown
    human_judgment: true
    rationale: "Requires a live browser session against a running app with a real Supabase session — not exercisable in this non-interactive execution context, consistent with every prior Phase 18 plan's own recorded limitation (18-01, 18-03)."

# Metrics
duration: ~20min
completed: 2026-07-22
status: complete
---

# Phase 18 Plan 02: Contract Locker Workspace Summary

**The Contract Locker now reads in-flight `split_sheets` alongside signed `vault_documents` and leads with an attention-first landing — awaiting signature (with a per-party invited/opened/signed label derived from zero new schema), drafts in progress, unattached executed sheets, and songs with no sheet — before the settled archive, with the P18-12 block exception made deliberate in-source and a non-destructive per-party hide.**

## Performance

- **Duration:** ~20 min task execution
- **Tasks:** 3 of 3
- **Files modified:** 7 (4 created, 3 modified)
- **Completed:** 2026-07-22

## Accomplishments

- **The pure attention-derivation module** (Task 1): `lib/contracts/locker-attention.ts`'s `buildAttentionSections()` turns plain, already-fetched row arrays into the four P18-10 attention sections (awaiting signature, drafts in progress, unattached executed, songs with no sheet) plus a settled archive, in fixed order, with no I/O and no model call. `derivePartyProgressState()` derives the invited/opened/signed 3-state label purely from `approval_status` + `first_viewed_at` (research §4 — zero new schema, explicitly distinct from 18-05's roster-level `collaborators.status`). `resolveViewerContext()` resolves each viewer's own share and signing state from the party rows — two different viewers of one sheet see two different shares from the same input, and an initiator who isn't a named party gets a null share rather than someone else's figure. An unrecognized sheet status degrades to the archive rather than throwing, matching `deriveSheetTier()`'s posture. 21 unit tests cover ordering, draft exclusion for non-initiators, per-party progress counts, all three label combinations, whole-release track coverage, and per-viewer hidden documents.
- **The widened query, the P18-12 comment, and the hide route** (Task 2): `app/(artist)/contracts/page.tsx` now reads `split_sheets` (via 18-01's `fetchSplitSheetsForUser()`, the same initiated+party-of merge already built for `/split-sheets`) alongside `vault_documents`, including each in-flight sheet's parties' `approval_status` and `first_viewed_at`, plus the caller's project tracks — the query change that makes the Locker attention-first (18-CONTEXT finding 3). The P18-12 block exception is documented in-source at the query, citing 17-DUAL-ENTRY-DESIGN.md section 10c: block filtering is deliberately NOT applied to this cross-party read. `POST /api/contracts/documents/[id]/hide` is a per-caller, non-destructive marker write — 401/404 gates, no DELETE on any path, update scoped by the caller's `user_id`, `document_data` read-then-merged so the esign evidence block and `split_sheet_id` linkage survive.
- **The attention-first landing** (Task 3): `components/contracts/ContractLocker.tsx` now renders the four attention sections above a create section and the pre-existing archive (list + detail panel), which now serve as the browse-complete surface. Awaiting-signature rows show per-party signed/total progress AND the 3-state label per party, plus the viewer's own share — every label is a pass-through of the attention module's output. Drafts link to `/split-sheets/[id]` (18-01); unattached executed sheets link to `/split-sheets/[id]/attach` (18-03); songs-with-no-sheet rows prompt a new sheet. The Ask slot is present, reserved, and inert (design section 10a item 4). A hide action in the archive detail panel is labelled as removing from the viewer's own view, never as deleting.

## Task Commits

1. **Task 1: buildAttentionSections — the pure derivation, with the 3-state per-party label** — `4bcb80b` (feat)
2. **Task 2: The widened Locker query, the P18-12 comment, and the per-party hide** — `80700ad` (feat)
3. **Task 3: The attention-first landing** — `4cdb900` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `lib/contracts/locker-attention.ts` (+test) — `buildAttentionSections()`, `derivePartyProgressState()`, `resolveViewerContext()`
- `app/(artist)/contracts/page.tsx` — widened split_sheets/tracks/hidden-flags reads, P18-12 comment, buildAttentionSections call
- `lib/contracts/locker-rows.ts` — widened tracks select to include `title` (additive)
- `app/api/contracts/documents/[id]/hide/route.ts` (+test) — per-party soft-hide
- `components/contracts/ContractLocker.tsx` — attention-first landing rebuild

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality] `lib/contracts/locker-rows.ts`'s project-nested tracks select lacked `title`**
- **Found during:** Task 2, while building the songs-with-no-sheet section's project/track input
- **Issue:** The pre-existing query selected only `tracks (id, metadata)`; the songs-with-no-sheet section needs a name to display for each uncovered track, which `metadata` alone cannot reliably provide (title lives in the `tracks.title` column, not in metadata JSON).
- **Fix:** Widened the select to `tracks (id, title, metadata)` — purely additive, no behavior change for any existing caller of `fetchContractRows`.
- **Files modified:** `lib/contracts/locker-rows.ts`
- **Commit:** `80700ad`

**2. [Rule 3 — blocking, ESLint] Internal navigation links using `<a>` instead of `next/link`**
- **Found during:** Task 3, `npm run lint`
- **Issue:** `@next/next/no-html-link-for-pages` flagged plain `<a href="/split-sheets/new">`-style internal navigation in the new attention sections.
- **Fix:** Converted every internal-nav anchor in `ContractLocker.tsx` to `next/link`'s `Link`, matching the rest of the codebase's established convention (`ArtistNav.tsx`, `SplitSheetList.tsx`, etc.).
- **Files modified:** `components/contracts/ContractLocker.tsx`
- **Commit:** `4cdb900`

### Auth gates

None.

## Known Stubs

None. The Ask slot is intentionally inert per the plan's explicit instruction (design section 10a item 4) — it is documented in-source as a reserved slot for Contract Locker Intelligence, not a stub standing in for missing wiring.

## Threat Flags

None. This plan's own threat register (T-18-07 through T-18-12, T-18-SC) covers every trust boundary the plan's files touch; no new surface outside that register was introduced.

## Manual Verification Required (not exercised in this session)

This execution ran without a live browser/Supabase session, consistent with every prior Phase 18 plan.

1. Open `/contracts` with at least one draft, one sheet out for approval with a mix of signed/opened/not-yet-opened parties, and one project track lacking a sheet.
2. Confirm the attention sections appear in P18-10 order above the archive.
3. Confirm the awaiting row names which party has not acted and whether they have even opened the request.
4. Confirm the draft links to its detail page and the unattached-executed row links to the attach flow.
5. Confirm the Ask slot is present but inert (no input, no route).
6. Confirm hiding a shared agreement removes it from this view only — the underlying document and the other party's copy are untouched.

## Issues Encountered

None blocking beyond the two deviations documented above (both resolved inline, both low-risk/additive).

## Verification

- `npx jest lib/contracts/locker-attention.test.ts __tests__/locker-hide-route.test.ts __tests__/contracts-standalone-docs.test.ts`: all green (21 + 5 + 3 tests).
- `npx tsc --noEmit`: clean.
- `npm run lint` (`--max-warnings=0`): clean.
- Full suite: **84 suites / 1031 tests passing** (up from the 82 suites / 1005 tests baseline recorded in 18-01-SUMMARY.md — suite/test count rose, per the plan's regression gate, no previously-passing test now fails).
- P18-12 audit gate: confirmed by inspection — `grep -rn "isBlockedRelativeTo\|block-check"` across `app/(artist)/contracts/page.tsx`, `lib/contracts/locker-attention.ts`, and `lib/split-sheets/list.ts` returns no matches (no block filtering applied), and the in-source comment recording this as deliberate is present at the query site in `page.tsx`, citing 17-DUAL-ENTRY-DESIGN.md section 10c.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- HOME-06, HOME-07, HOME-08 are structurally complete; REQUIREMENTS.md is updated accordingly.
- **This was the final outstanding plan in Phase 18** (18-01, 18-03, 18-04, 18-05 were already complete). Phase 18 is now 5/5 plans complete.
- The eight manual-verification items carried forward from 18-01-SUMMARY.md, plus this plan's six manual-verification items above, should be picked up together in the next `/gsd-verify-work` pass before Phase 18 is considered fully human-verified.

---
*Phase: 18-split-sheet-home*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 4 created files confirmed present on disk; all 3 task commits (`4bcb80b`, `80700ad`, `4cdb900`) confirmed in git log. Full suite 84/84 suites, 1031/1031 tests green; `tsc --noEmit` and `npm run lint` clean.
