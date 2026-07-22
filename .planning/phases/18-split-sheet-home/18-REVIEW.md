---
phase: 18-split-sheet-home
reviewed: 2026-07-22T00:00:00Z
depth: deep
files_reviewed: 35
files_reviewed_list:
  - app/(artist)/contracts/page.tsx
  - app/(artist)/settings/page.tsx
  - app/(artist)/split-sheets/[id]/attach/page.tsx
  - app/(artist)/split-sheets/[id]/page.tsx
  - app/(artist)/split-sheets/new/page.tsx
  - app/(artist)/split-sheets/page.tsx
  - app/(artist)/vault/[projectId]/documents/page.tsx
  - app/(artist)/vault/[projectId]/readiness/page.tsx
  - app/api/contracts/documents/[id]/hide/route.ts
  - app/api/profile/route.ts
  - app/api/split-sheets/[id]/attach/route.ts
  - app/api/split-sheets/[id]/detach/route.ts
  - app/api/split-sheets/[id]/route.ts
  - app/api/split-sheets/[id]/send-for-approval/route.ts
  - app/api/split-sheets/[id]/mint-envelope/route.ts
  - app/api/approve/[token]/route.ts
  - components/contracts/ContractLocker.tsx
  - components/profile/ProfileForm.tsx
  - components/split-sheets/AttachSheetPanel.tsx
  - components/split-sheets/PartyPicker.tsx
  - components/split-sheets/ReconcileDiff.tsx
  - components/split-sheets/SplitApprovalView.tsx
  - components/split-sheets/SplitSheetBuilder.tsx
  - components/split-sheets/SplitSheetList.tsx
  - components/split-sheets/SplitSheetSigningEmbed.tsx
  - components/vault/LinkSplitSheet.tsx
  - components/vault/SplitSheetCoverage.tsx
  - lib/contracts/locker-attention.ts
  - lib/contracts/locker-rows.ts
  - lib/split-sheets/attachment.ts
  - lib/split-sheets/change-summary.ts
  - lib/split-sheets/live-identity.ts
  - lib/split-sheets/redistribute.ts
  - lib/vault/coverage-fixtures.ts
  - lib/vault/coverage.ts
  - lib/vault/readiness-coverage.ts
  - lib/vault/readiness.ts
  - supabase/migrations/066_split_sheet_identity_foundation.sql
  - supabase/migrations/067_split_sheet_song_attachment.sql
  - supabase/migrations/068_split_sheet_coverage_readiness.sql
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-22T00:00:00Z
**Depth:** deep (cross-file, priority-target verification)
**Files Reviewed:** 35 (Phase 18 commits only — 18-01 through 18-05)
**Status:** issues_found

## Summary

I verified the six priority targets by tracing math and control flow, not by reading code and assuming correctness:

- **`redistribute()`** (split math): traced `applyResidue`/`evenDistribution`/proportional-mode arithmetic through 1, 2, 3, 4, and 12-party cases, the zero-total degrade, and the tie-break rule. All outputs round to exactly 100.000 and match the documented contract. **No defect found.**
- **Coverage scoring** (`lib/vault/coverage.ts`, `lib/vault/readiness-coverage.ts`, migration 068): hand-verified every row in `coverage-fixtures.ts` against both the TS `coverageTier()` derivation and the SQL `CASE`/`MIN`/`ROUND(AVG())` logic (including the zero-tracks→NULL fallback and the LEFT JOIN that keeps uncovered tracks in the denominator). Both sides agree. **No defect found in the derivation itself** — but see WR-01/WR-02 below for two real gaps in how this data reaches the UI.
- **`resolvePartyIdentity()`** (live-identity): pre/post-`esign_pending` branch logic, null/blank-claimed-field fallback, and the never-mutates-frozen-in-place guarantee all check out against the test suite and the callers that feed it. **No defect found.**
- **`summarizePartyChanges()`** (consensus-reset diff): correctly diffs only `id`+`split_percentage` on the FROZEN pre-edit snapshot (`existingSheet.frozenParties`, built server-side from raw DB columns, never live-resolved) — an identity-only change genuinely produces no record, and `[id]/page.tsx` wires this correctly. **The diff math is correct — but see WR-03: the resulting diff is never actually delivered to the parties it's meant to inform.**
- **`derivePartyProgressState()`** (3-state Locker label): verified all reachable `(approval_status, first_viewed_at)` combinations, including that `countered` can never coexist with `firstViewedAt === null` because `/approve/[token]/page.tsx` always stamps `first_viewed_at` before any action (including counter) is possible. No unhandled fourth state. **No defect found.**
- **Attach fuzzy matching / conflict handling** (`attachment.ts`): Levenshtein-based similarity, the `CONFIDENCE_THRESHOLD` gate, and `detectTrackConflicts()` are correct and match the partial unique indexes in migration 067 (`... WHERE track_id IS NOT NULL` / `... WHERE track_id IS NULL`). **No defect found.**

Beyond the priority targets, tracing how `split_sheet_attachments` data actually flows into the Contract Locker's UI surfaced two real cross-file bugs (WR-01, WR-02) that the coverage/readiness *derivation* review above wouldn't catch on its own, plus one design-intent gap (WR-03) and one behavioral surprise worth flagging (WR-04). None of these are financial/data-loss defects — they are incorrect-output UI/UX bugs and a shipped-but-inert feature.

## Warnings

### WR-01: Contract Locker's "Songs with no sheet" section ignores `split_sheet_attachments`, producing false positives for a song attached to two releases

**File:** `lib/contracts/locker-attention.ts:250-265` (coverage check), `lib/split-sheets/list.ts:71-105` (`fetchSplitSheetsForUser` — selects `'*, split_sheet_parties(*)'`, never `split_sheet_attachments`), `app/(artist)/contracts/page.tsx:36-54` (`toAttentionSheets` — builds `AttentionSheetInput.trackId`/`vaultProjectId` only from the sheet's own origin columns)

**Issue:** `buildAttentionSections()`'s "songs with no sheet" derivation considers a track covered only when `s.trackId === track.id || (s.vaultProjectId === project.id && s.trackId === null)` — i.e. only the sheet's *origin* `track_id`/`vault_project_id` columns. It never looks at `split_sheet_attachments`, the join table migration 067 built specifically so one split sheet can cover the same composition on two releases ("a single AND an album," per the migration's own header comment). `fetchSplitSheetsForUser()` (feeding this page) doesn't even select the attachments relation.

Meanwhile the Vault readiness page (`app/(artist)/vault/[projectId]/readiness/page.tsx`) and migration 068's SQL trigger *do* correctly join through `split_sheet_attachments` for the readiness score. So the two surfaces disagree on the same fact.

**Concrete failure scenario:** An artist creates a split sheet for "Neon Hours," originating it on the Single project (its track_id/vault_project_id are set to the Single's track). Months later they release an EP containing the same song as track 3, and use the Locker's "Attach to a release" flow (`AttachSheetPanel`/`LinkSplitSheet` → `POST /api/split-sheets/[id]/attach`) to attach the *same* sheet to the EP's track 3. Per the attach route's own comment ("Origin fields… set only when previously null"), this creates a second `split_sheet_attachments` row but does not touch the sheet's origin columns. The EP's readiness page correctly shows the track as covered (it queries the join table). The Contract Locker's "Songs with no split sheet" attention section still lists the EP's "Neon Hours" as needing a sheet — a false nag for a song that demonstrably has one, in exactly the multi-release scenario the join table exists to support.

**Fix:** Have `fetchSplitSheetsForUser` (or a sibling query) also select `split_sheet_attachments(vault_project_id, track_id)` for each sheet, and have `toAttentionSheets`/`buildAttentionSections`'s coverage check consider the full attachment set (origin fields OR any join-table row), not just the origin columns. `AttentionSheetInput` will need an `attachments: { vaultProjectId: string; trackId: string | null }[]` field (or similar) alongside/replacing the single `trackId`/`vaultProjectId`.

### WR-02: Readiness page shows contradictory UI — "Passed" gate alongside a "Not fully documented" coverage widget

**File:** `app/(artist)/vault/[projectId]/readiness/page.tsx:141-256`

**Issue:** `coverage` (from `coverageTier(...)`) is computed unconditionally on every render and rendered under the `split_sheets` gate row whenever it is non-null (line 250: `{item.key === 'split_sheets' && coverage && <SplitSheetCoverage .../>}`). But `readinessItemsForProject()`'s `split_sheets` branch (`lib/vault/readiness.ts:102-155`) short-circuits to `status: 'complete'`/`earnedPoints: 15` the moment the *legacy* signed-`vault_documents` path wins (AM-1's universal fallback) — **before** it ever reaches the coverage-based derivation. The page never checks which branch actually produced the gate's status before deciding whether to show the coverage widget.

**Concrete failure scenario:** A project has one legacy signed split-sheet `vault_documents` row (uploaded/wet-signed, satisfying `signedOf('split_sheet') === 'complete'`) and two tracks, neither of which has any `split_sheet_attachments` row. The gate row renders "Passed" (green check, complete, 15/15) because the legacy path won outright. Immediately below it, `SplitSheetCoverage` renders "0 of 2 songs covered," a "Not fully documented" badge, "Missing a split sheet: Track A, Track B," and a "Create a split sheet →" link — for a gate the UI just told the artist is fully passed. This is the exact fixture scenario `COVERAGE_FIXTURES` names as "legacy signed document present, zero attachments," but that fixture is only asserted at the `earnedPoints`/`status` level, never against the page's own rendering logic.

**Fix:** Only render `SplitSheetCoverage` when the coverage-based branch is what actually produced the item's status — e.g. have `readinessItemsForProject()` return a discriminant (`splitSheetSource: 'legacy' | 'coverage' | 'pipeline' | 'none'`) alongside the item, or re-derive the legacy-wins condition on the page before deciding whether to show the widget, so a legacy-complete gate never sits next to a coverage panel claiming otherwise.

### WR-03: The P18-09 consensus-reset "what changed" diff is computed but never reaches the parties it's meant to inform

**File:** `components/split-sheets/SplitSheetBuilder.tsx:329-340` (only place `summarizePartyChanges()` is called), `app/api/split-sheets/[id]/send-for-approval/route.ts:84-121` (re-send email — no diff included), `app/approve/[token]/page.tsx` / `app/api/approve/[token]/route.ts` (no diff surfaced to the responding party)

**Issue:** `change-summary.ts`'s own module header states the purpose plainly: "each party deserves to be told WHAT changed — who joined, whose share moved and from what to what — not merely 'please re-approve.'" In the actual wiring, `summarizePartyChanges()` is invoked exactly once, client-side, immediately after the initiator's own save succeeds (`SplitSheetBuilder.tsx:338`), and the result is stored only in local React state (`changeSummary`) rendered in the initiator's own browser. It is never persisted, never emailed, and never passed to `send-for-approval`'s email builder (which just re-sends the current flat split table, unchanged from before this phase) or to the `/approve/[token]` page the other parties actually land on to re-approve.

**Concrete failure scenario:** Jamie and Rapper have both approved a 50/50 sheet. The initiator adds a third writer and re-balances to 40/40/20, triggering a consensus reset (both approvals cleared). The initiator sees "Rapper's share moved from 50% to 40%; New Writer added at 20%" on their own screen for as long as that page stays open. When they click "Send for approval," Jamie and Rapper receive the *exact same* generic email as a brand-new sheet ("The song … has the following proposed splits" + a flat table) with no indication anything changed from what they'd already approved — they have to notice the new percentages themselves. The stated goal of P18-09 (never leave a party to just re-approve blind) is not met for the people who actually need to know.

**Fix:** Persist the diff (or pass it through) from the PATCH response into the `send-for-approval` email body — e.g. store `previous_parties` snapshot alongside the reset, or accept a `changeSummary` array in the send-for-approval POST body and render it into the email/approve-page copy — so the actual recipients see what changed, not just the initiator.

### WR-04: Every builder save while a sheet is `pending_approval`/`approved` resets consensus, even when the party set is unchanged

**File:** `app/api/split-sheets/[id]/route.ts:82-83` (`editsParties = Array.isArray(body.parties) && body.parties.length > 0`), `lib/split-sheets/lifecycle.ts:49-74` (`assertEditable`), `components/split-sheets/SplitSheetBuilder.tsx:294-312` (payload always includes the full `parties` array on every save)

**Issue:** `assertEditable`'s `editsParties` gate is driven purely by "did the PATCH body include a non-empty `parties` array," not by whether the submitted parties actually differ from what's persisted. `SplitSheetBuilder` always includes the full `parties[]` in its PATCH payload on every save (draft or send), so there is no way, from this UI, to edit an unrelated sheet-level field (e.g. `record_label`, `album_project_title`) without triggering a full consensus reset on a sheet that already has collected approvals — even though `summarizePartyChanges()` would report an empty diff in that exact case. This is a direct consequence of the route's delete-and-reinsert party-replacement pattern (every `parties[]` PATCH destroys and regenerates `approval_token`s regardless of whether values changed), so the reset may be technically unavoidable given that implementation choice, but it means "Saving will reset approvals collected so far" fires on saves that changed nothing about who's on the sheet or what they're owed.

**Fix:** Either (a) skip the delete-and-reinsert (and the consequent reset) when the incoming `parties[]` is a value-for-value match against the persisted rows (compare via `summarizePartyChanges` returning `[]`), or (b) split sheet-level-only saves (song name, work details) into a payload that omits `parties` entirely so `editsParties` is correctly `false` for those saves.

## Info

### IN-01: `legal_name_locked_at` (migration 066) has no downstream consumer — the "confirm & lock" feature is currently a no-op banner

**File:** `app/api/profile/route.ts:196-215`, `components/profile/ProfileForm.tsx:591-633`, `components/split-sheets/SplitSheetBuilder.tsx:130-148` (`buildInitialParties` — reads `myProfile?.legalName` directly, with no branch on lock state)

**Issue:** The migration/route/UI comments explicitly say this is "a one-time attestation, not a field freeze" — the underlying `legal_first_name`/`legal_middle_name`/`legal_last_name`/`legal_name_suffix` fields stay in `EDITABLE_FIELDS` and remain freely editable after locking, which is stated as intentional. However, grepping the full Phase 18 diff shows `legal_name_locked_at` is written by the PATCH route and read back only to render the "Legal name confirmed on {date}" banner in Settings — it gates nothing else (the split-sheet builder's self-row always shows the live, current `legalName` regardless of lock state; no route checks lock status before anything). If the intent was ever for this signal to gate something downstream (e.g., a "confirmed" badge on the split-sheet self row, or evidence in the executed PDF that the signer had attested to their name), that wiring doesn't exist yet in this phase. Not a bug given the stated design, but worth flagging in case the lock's downstream consumer was simply deferred/forgotten.

**Fix:** No action required if the attestation-only behavior is deliberate and complete; otherwise, wire `legal_name_locked_at` into at least one consumer (e.g., surface "confirmed" on the self-party row in `SplitSheetBuilder`) or remove the column/feature if it's fully superseded.

---

_Reviewed: 2026-07-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
