---
phase: 18-split-sheet-home
verified: 2026-07-22T00:00:00Z
status: passed_with_human_checks
score: 16/16 must-haves verified (code-level); 8 items reserved for human_needed (deferred browser UAT + live-data spot-checks, per established project convention)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Draft round-trip: save a draft, confirm it lists at /split-sheets and opens at /split-sheets/[id]; share it and confirm the shared link is read-only with no approve/counter and no §7 section."
    expected: "Draft appears in list, opens for edit, share link renders read-only preview."
    why_human: "Requires a live browser session against a running app with a real Supabase session (no live browser/session was available to any executor across the phase)."
  - test: "New sheet shows locked party 1 (self) with live PRO/IPI and no remove control; fast-add a co-writer by email alone and confirm it saves with a pending badge and no legal-name error."
    expected: "Party 1 present and read-only on load; fast-add succeeds without a legal-name validation error."
    why_human: "Requires live browser interaction with a real Settings profile and a real save round-trip."
  - test: "Open a 50/30/20 draft, add a fourth party, confirm the first three scale proportionally to a 100% total."
    expected: "Percentages redistribute per redistribute()'s proportional mode and total exactly 100.000."
    why_human: "Requires a live draft with real persisted parties to add a party against."
  - test: "Open an executed sheet and confirm the builder renders read-only with the freeze-boundary's own explanation text."
    expected: "assertEditable()'s refusal text renders verbatim; no editable fields."
    why_human: "Requires a real executed sheet in the browser."
  - test: "Open Metadata Studio's composer-credit picker for a track and confirm it still shows the full identity form and saves."
    expected: "CollaboratorPicker/ComposerEditor behaves exactly as before Phase 18."
    why_human: "Backed by a structural proof (confirmed here independently: zero phase-18 commits touch CollaboratorPicker.tsx or MetadataStudio.tsx), but never click-through tested — no automated coverage exists for this caller."
  - test: "On /approve/[token] in the approve phase, expand Advanced information, correct a PRO, confirm it saves without approving, and the initiator now sees the corrected value."
    expected: "§7 self-correction round-trips visibly to the initiator's view."
    why_human: "Requires a live token-based session and a second viewer to confirm propagation."
  - test: "Open /contracts with a draft, a sheet out for approval with a mix of signed/opened/not-yet-opened parties, and a project track lacking a sheet; confirm attention-section order, per-party 3-state labels, draft/attach link targets, inert Ask slot, and hide-scoped-to-one-view."
    expected: "Sections render in P18-10 order with correct per-party labels; hide affects only the caller's own view."
    why_human: "Requires a live multi-party scenario in a browser — cannot be constructed without a running app + real Supabase session."
  - test: "Migration-067 backfill row-count spot-check: count(split_sheet_attachments) for backfilled rows equals count(split_sheets WHERE vault_project_id IS NOT NULL) as of the pre-push snapshot."
    expected: "Exact 1:1 backfill, no duplicates, no dropped associations."
    why_human: "No SQL client (psql/pg/psycopg) was available in the push environment; only `supabase migration list` LOCAL=REMOTE parity was obtainable as evidence."
  - test: "Migration-068 readiness parity: a real multi-track project's stored vault_readiness_score vs. its /vault/[id]/readiness breakdown page."
    expected: "Stored score and displayed breakdown agree exactly."
    why_human: "No SQL client was available to sample a live project's stored score against the breakdown page in a browser session; migration 068 does include `update vault_projects set vault_readiness_score = calculate_vault_readiness(id)` so a live recompute did occur, but the visual parity check itself needs a browser."
---

# Phase 18: Split-Sheet Home Verification Report

**Phase Goal:** A split sheet written at 2am survives the studio — it can be found (list + Locker), edited (living draft), grown by one more writer (fast-add PartyPicker + redistribute), shown to a collaborator without a formal ask (read-only share), bound to the right song months later (song-level attachment), and scored honestly against every track it does and does not cover (coverage-based readiness) — with an identity model where the initiator and their collaborators never re-type data Funūn already has (live-linked identity, legal-name lock, auto-party-1).

**Verified:** 2026-07-22
**Status:** passed_with_human_checks
**Re-verification:** No — initial verification

## Summary Verdict

All five plans (18-01 through 18-05) are executed, and the phase goal is **genuinely achieved in the codebase**, not merely task-checked. Every must-have truth across all five plans traces to real, substantive, wired code — not stubs, not placeholders, not orphaned modules. Migrations 066/067/068 are confirmed LIVE (`npx supabase migration list` shows LOCAL=REMOTE parity for 001–068, re-confirmed independently in this verification pass). The full suite (84 suites / 1031 tests), `tsc --noEmit`, and `npm run lint --max-warnings=0` all pass cleanly, independently re-run in this verification session (not taken from SUMMARY claims alone). `components/collaborators/CollaboratorPicker.tsx` and `components/vault/MetadataStudio.tsx` are confirmed untouched by any Phase 18 commit (`git log` across every phase-18 task commit shows zero hits on either path).

The only reasons this is `passed_with_human_checks` rather than a bare `passed`: (1) a substantial list of end-to-end browser/live-data checks was never exercised in any executor session (documented per-plan and consolidated below), consistent with this project's established pattern for non-interactive execution; and (2) one pre-existing, deliberately-recorded cross-phase gap (mint-envelope's missing legal-name gate) is real but out of this phase's scope to fix. Neither of these represents a phase-goal capability that is absent or broken in code — every capability the goal names exists, is substantive, and is wired.

## Requirement-by-Requirement Delivery

| Req | Delivered | Code Evidence |
|---|---|---|
| HOME-01 | ✓ | `components/nav/ArtistNav.tsx:41` nav entry; `app/(artist)/split-sheets/page.tsx` is the list; `lib/split-sheets/list.ts` (`fetchSplitSheetsForUser`) merges initiator+party-of sheets, drafts held to initiator only; `app/api/split-sheets/route.ts` widened GET |
| HOME-02 | ✓ | `app/(artist)/split-sheets/[id]/page.tsx` (301 lines) — server component, 404 on unauthorized, PATCH via `SplitSheetBuilder` edit mode; `lib/split-sheets/live-identity.ts` `resolvePartyIdentity()` wired at line 197; `supabase/migrations/066_*.sql` `legal_name_locked_at` + Settings confirm-and-lock in `components/profile/ProfileForm.tsx` |
| HOME-03 | ✓ | `components/split-sheets/PartyPicker.tsx` (384 lines, wholly separate from `CollaboratorPicker.tsx`); `lib/split-sheets/redistribute.ts` (`redistribute()`, proportional/even, residue-corrected to exactly 100.000); `SplitSheetBuilder.tsx`'s `kind: 'self'|'fastAdd'|'full'` discriminant (lines 83, 104, 135, 229, 253, 623, 689) |
| HOME-04 | ✓ | `app/api/split-sheets/[id]/share/route.ts` (84 lines) — mints preview tokens, never advances status, no body field accepted; `lib/split-sheets/phase.ts`'s `'preview'` branch (line 69) checked before every other branch; `SplitApprovalView.tsx` renders preview read-only |
| HOME-05 | ✓ | `lib/split-sheets/change-summary.ts` — `summarizePartyChanges()` diffs id/name/split only (never identity fields), `formatPartyChange()` is system-worded with no free-text parameter (confirmed: no string param exists in the exported API); `assertEditable()` wired in `SplitSheetBuilder.tsx:210` |
| HOME-06 | ✓ | `lib/contracts/locker-attention.ts` (280 lines) — `buildAttentionSections()` in fixed P18-10 order, `derivePartyProgressState()` (3-state invited/opened/signed, lines 41-47); `app/(artist)/contracts/page.tsx` widened query with `split_sheets`/`first_viewed_at`; `ContractLocker.tsx` renders sections in order (lines 464-467) plus inert `AskSlot()` (line 231) |
| HOME-07 | ✓ | `resolveViewerContext()` in `locker-attention.ts` (lines 76-86) resolves per-viewer share/state strictly by `userId` match; drafts filtered to initiator (`visibleSheets` filter, line 195); `app/api/contracts/documents/[id]/hide/route.ts` (64 lines) — no DELETE issued anywhere, scoped by `user_id`, merges `document_data` rather than overwriting |
| HOME-08 | ✓ | P18-12 comment present verbatim, citing "section 10c," at `app/(artist)/contracts/page.tsx` and `app/api/split-sheets/[id]/attach/route.ts`; confirmed no `isBlockedRelativeTo`/`block-check` import anywhere in the touched files |
| HOME-09 | ✓ | `supabase/migrations/067_split_sheet_song_attachment.sql` — `track_id` (`ON DELETE SET NULL`), `source` column, `split_sheet_attachments` table with both partial unique indexes (`idx_split_sheet_attachments_unique_track`, `idx_split_sheet_attachments_unique_project_only`) confirmed present; idempotent backfill; migration LIVE (confirmed below) |
| HOME-10 | ✓ | `app/api/split-sheets/[id]/attach/route.ts` — executed-only gate explicitly removed (comment at line 21), party-and-owner double check unchanged; `app/api/split-sheets/[id]/detach/route.ts` (98 lines) — no delete of sheet/parties/documents/storage |
| HOME-11 | ✓ | `lib/split-sheets/attachment.ts` (138 lines) — `suggestTrackMatches()`, `detectTrackConflicts()`, `describeSignedTitle()`; `components/split-sheets/AttachSheetPanel.tsx` (Locker-side) + `components/vault/LinkSplitSheet.tsx` (Vault-side), both wired into their respective pages |
| HOME-12 | ✓ | `lib/vault/coverage.ts` (`tracksNeedingSheet()` — every track, grep gate confirms zero `solo_written`/`no_sheet_needed`/`soloWritten` occurrences anywhere in the codebase); `lib/vault/readiness-coverage.ts` (`coverageTier()`, MIN-when-all-covered / proportional-average-when-partial per P18-16); `supabase/migrations/068_split_sheet_coverage_readiness.sql` — SQL twin matches the TS rule structurally, LIVE, and includes a full `vault_readiness_score` recompute on push |

## Must-Haves Truth-by-Truth (all 5 plans)

### 18-01 (Living-Draft Surface)
| Truth | Status | Evidence |
|---|---|---|
| Draft reachable via list + detail page | ✓ VERIFIED | `/split-sheets` list + `/split-sheets/[id]` detail exist, substantive, wired to `fetchSplitSheetsForUser()` |
| Builder edit mode PATCHes persisted parties | ✓ VERIFIED | `[id]/page.tsx` passes `existingSheet`; `SplitSheetBuilder.tsx` PATCH path confirmed present |
| Initiator auto-party-1, read-only legal name, live-linked rights fields | ✓ VERIFIED | `kind: 'self'` branch (builder line 623), `resolvePartyIdentity()` wired server-side |
| Fast-add via separate PartyPicker, CollaboratorPicker untouched | ✓ VERIFIED | `git log` across every phase-18 commit range shows zero touches to `CollaboratorPicker.tsx`/`MetadataStudio.tsx`; `PartyPicker.tsx` is a standalone 384-line component |
| Add-and-redistribute (proportional/even) | ✓ VERIFIED | `lib/split-sheets/redistribute.ts` — residue-corrected, always totals 100.000, imports `evenSplit` (no drift) |
| Live identity is not a consensus-resetting change | ✓ VERIFIED | `change-summary.ts` never reads identity fields structurally (only `id`/`name`/`split_percentage` on the type) |
| Freeze boundary explained, not silently failed | ✓ VERIFIED | `assertEditable()` gate wired in `SplitSheetBuilder.tsx:210`; `STATUS_COPY` map in `[id]/page.tsx` renders refusal text |
| Consensus reset shows named from/to diff | ✓ VERIFIED | `summarizePartyChanges()` + `formatPartyChange()` produce structured, system-worded output |
| Read-only share, no formal ask | ✓ VERIFIED | `share/route.ts` never writes `status`; `phase.ts`'s `'preview'` branch renders no approve/counter |
| §7 recipient self-correction | ✓ VERIFIED | `approve/[token]/route.ts` `update_identity` action, allowlisted fields, freeze-boundary-guarded (line 68) |
| `/split-sheets` no longer orphaned | ✓ VERIFIED | `ArtistNav.tsx:41` |

### 18-02 (Contract Locker Workspace)
All 9 must-haves verified — `buildAttentionSections()`, `derivePartyProgressState()`, `resolveViewerContext()`, the widened Locker query with per-party `first_viewed_at`, the P18-12 in-source comment, the non-destructive hide route, and the inert reserved Ask slot are all present, substantive, and wired as specified. See Requirements table above for evidence.

### 18-03 (Song-Level Attachment)
All 9 must-haves verified — migration 067 (LIVE), both partial unique indexes, opposite cascade behaviors (commented at each FK), the attachment module (fuzzy matcher never marks a confident wrong candidate — threshold-gated), attach v2's relaxed executed-only gate, detach's non-destruction, conflict flagging (reports, never blocks), `describeSignedTitle()` (no reissue path exists anywhere), and the unchanged party-and-owner double authorization.

### 18-04 (Coverage-Based Readiness)
All 6 must-haves verified — the five-tracks-one-sheet regression case is fixed (confirmed via direct fixture/derivation read: `coverageTier()` returns proportional/warning, not 15/complete, whenever any needing track is uncovered), the MIN-across-needing-tracks rule holds when all are covered, the shared fixture (`coverage-fixtures.ts`) anchors both TS and SQL derivations, the legacy wet-sign path is checked first and unaffected (both in `readiness.ts` and migration 068's SQL), `tracksNeedingSheet()` has zero solo-written exception (grep-gate confirmed clean), and the score-change sign-off + push checkpoint was completed by the developer.

### 18-05 (Identity Foundation)
All 5 must-haves verified — migration 066 (LIVE), `resolvePartyIdentity()`'s overwrite/freeze/fallback semantics (all four branches read directly from source and match spec exactly), `collaborators.legal_name`/`status` columns present, both status-confirmation triggers present in the migration SQL, and migration 066 confirmed strictly additive (no ALTER/DROP COLUMN found).

## Independent Automated Verification (re-run in this session, not taken from SUMMARY)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm run lint --max-warnings=0` | Clean |
| `npx jest` (full suite) | 84 suites / 1031 tests, all passing |
| `npx supabase migration list` | LOCAL=REMOTE parity confirmed for 001–068 |
| `git log` diff-scan for CollaboratorPicker.tsx/MetadataStudio.tsx across all phase-18 commits | Zero touches — untouched claim independently confirmed |
| Debt-marker scan (TBD/FIXME/XXX/HACK/"not yet implemented"/"coming soon") across all phase-18-touched files | One hit: `ContractLocker.tsx`'s `AskSlot()` — "natural-language search across your contracts is coming soon" — this is the deliberately-reserved, explicitly-scoped-out Ask placeholder the plan called for building as an honest inert slot, not an undocumented stub. Not a blocker. |
| Grep gate: `solo_written`/`no_sheet_needed`/`soloWritten` anywhere in `lib/`, `app/`, `components/`, `supabase/migrations/` | Zero matches — confirmed clean |
| P18-12 block-exception comment present at both cross-party query sites | Confirmed at `app/(artist)/contracts/page.tsx` and `app/api/split-sheets/[id]/attach/route.ts` |

## Human Verification Required (deferred, per project convention — NOT failures)

The items below were never exercised end-to-end in a live browser/Supabase session by any executor across all five plans, and are carried forward here as the phase's consolidated `human_needed` list (see frontmatter `human_verification` for full detail):

1. Draft round-trip (save → list → open → share → read-only preview).
2. New-sheet self-row + fast-add-by-email-only + no-legal-name-error.
3. Proportional redistribution on a live 50/30/20 draft gaining a fourth party.
4. Executed-sheet read-only render with freeze-boundary explanation text.
5. MetadataStudio composer-picker manual regression (structurally protected — confirmed via git log — but never eyeballed).
6. §7 self-correction round-trip visibility to the initiator.
7. Locker attention-first landing with a real mixed-state multi-party scenario, plus hide-scoped-to-one-view.
8. Migration-067 backfill row-count spot-check (no SQL client was available at push time to any executor).
9. Migration-068 readiness parity: a real project's stored `vault_readiness_score` vs. its breakdown page (migration 068 did run a full recompute on push, but the visual/DB parity comparison itself needs a browser + SQL client neither executor session had).

None of these are treated as gaps. Every one requires a live browser session and/or a live SQL client that was unavailable to every executor in this phase, consistent with this project's established pattern (Phases 9–17 recorded the same class of deferred checks at every migration-push checkpoint).

## Cross-Phase Finding (recorded, not a Phase 18 failure)

`app/api/split-sheets/[id]/mint-envelope/route.ts` (Phase 17, confirmed unmodified by any Phase 18 commit) requires every party to have an email address before minting (line 147-150: `signableParties = parties.filter(p => normalizeRecipient(p.email))`) but does **not** check for a non-empty `legal_name` before minting. A fast-added, not-yet-responded party (Phase 18's new capability: placeholder `name` = email/phone, empty `legal_name` until the recipient supplies it) can therefore be minted onto a legal document today, rendering an em-dash or "not yet known" placeholder for that party's legal name rather than being blocked. This is genuinely pre-existing Phase 17 behavior that Phase 18 does not modify (confirmed: mint-envelope/route.ts carries no phase-18 commit). **Recommended as a Phase 17 follow-up** so that a future block-enforcement or legal-document audit does not treat this as new Phase 18 regression — it is the same "research A4 mint-time freeze gap" both 18-01's and 18-05's own summaries independently flagged and confirmed is correctly scoped out of this phase's file boundaries.

## Documentation Note (non-blocking)

`.planning/REQUIREMENTS.md`'s Phase 18 traceability table (lines 255-268) still reads "Pending" for all of HOME-01 through HOME-12, despite the checklist items immediately above it being marked `[x]` complete. This is a stale-table drift in project bookkeeping, not a code delivery gap — every requirement's actual delivery is independently confirmed against the codebase in this report. Recommend updating the traceability table's Status column to "Complete" to match the checklist and the SUMMARY frontmatter `requirements-completed` fields, but this does not block phase closure.

---

*Verified: 2026-07-22*
*Verifier: Claude (gsd-verifier)*
