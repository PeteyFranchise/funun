---
phase: 17-split-sheet-esign
plan: 05
subsystem: api
tags: [split-sheets, contract-locker, vault-documents, reconciliation, jest, tdd, docuseal]

# Dependency graph
requires:
  - phase: 17-split-sheet-esign
    provides: "17-01 (SPLIT_SHEET_TIER_MAP, reconcileSplits, EsignState.provider='docuseal'); 17-02 (migration 062 esign tables, tiered readiness — schema-only, not required at runtime by this plan)"
provides:
  - "fetchContractRows()/mergeContractRows() (app/(artist)/contracts/page.tsx) — Contract Locker's second, direct vault_documents query that finally reaches project_id IS NULL rows"
  - "buildFanoutRows() (lib/split-sheets/distribution.ts) — account-holder-only cross-account vault_documents fan-out builder for 17-07's webhook"
  - "POST /api/split-sheets/[id]/attach — party-AND-owner double-checked standalone-sheet attach route"
  - "GET/POST /api/split-sheets/[id]/reconcile — never-silent composers[] write-back diff + confirm route"
  - "ReconcileDiff.tsx — client component rendering the diff with manual re-map + explicit confirm/dismiss"
affects: [17-06, 17-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Second direct query + de-dup merge (mergeContractRows) as the fix for a project-nested query's structural blind spot (RESEARCH Pitfall 2)"
    - "document_data.split_sheet_id as the join key from a vault_documents row back to its originating split_sheets row, since no FK exists on that JSONB column"
    - "Party-AND-owner double-check helper (attach route + reconcile route's authorize()) mirroring send-for-approval's session-client-then-service-write shape for cross-user document surfaces"
    - "GET-computes/POST-confirms split as the 'distinct request shape' guarantee for never-silent write-back (a GET can never trigger the write)"

key-files:
  created:
    - lib/split-sheets/distribution.ts
    - lib/split-sheets/distribution.test.ts
    - app/api/split-sheets/[id]/attach/route.ts
    - app/api/split-sheets/[id]/reconcile/route.ts
    - components/split-sheets/ReconcileDiff.tsx
    - __tests__/contracts-standalone-docs.test.ts
  modified:
    - app/(artist)/contracts/page.tsx
    - components/contracts/ContractLocker.tsx

key-decisions:
  - "document_data.split_sheet_id carries the join from a fanned-out vault_documents row back to its split_sheets row (no FK on JSONB) — both buildFanoutRows and Contract Locker's standalone-row builder read/write this same key, so 17-07's webhook must populate it exactly this way for the attach affordance to resolve."
  - "The attach route requires split_sheets.status = 'executed' before allowing attach (not explicitly stated in the plan's behavior block, but required by the must_haves truth 'A standalone EXECUTED sheet can be attached') — Rule 2 (missing validation), since attaching a still-pending sheet would move readiness/documents prematurely."
  - "Reconcile route picks the target track by normalized song_name<->title match, falling back to the project's single track when unambiguous, else 400s asking for disambiguation — the plan left the project/track mapping to discretion; this degrades to an explicit error rather than guessing when multiple same-titled or untitled-mismatch tracks exist."
  - "Reconcile GET and POST share one authorize() double check (party-on-sheet AND owner-of-attached-project) rather than the plan's looser 'initiator/party and target project's owner' wording, so only a caller who can both see the sheet AND legally edit that project's composers[] can view or apply the diff."
  - "ReconcileDiff's confirm() only re-maps an unmatched party onto an EXISTING composer row the artist explicitly picks from a dropdown — it never fabricates a new composer entry, since a synthesized entry would be missing role/PRO/IPI data the reconcile diff doesn't have."
  - "Dismissing the diff in ReconcileDiff keeps a persistent, reopenable mismatch banner instead of unmounting — satisfies the 'visible mismatch warning ... until resolved' truth without touching ContractLocker.tsx a second time (scoping note below)."

patterns-established:
  - "Server components export a testable async fetch+merge function (fetchContractRows) alongside the default page export, so query-shape/merge logic can be unit tested against a mocked Supabase client without rendering the page (no prior server-component test precedent existed in this repo)."

requirements-completed: [ESIGN-10, ESIGN-11, ESIGN-12]

coverage:
  - id: D1
    description: "Contract Locker surfaces a standalone (project_id IS NULL) split-sheet document via a second direct vault_documents query merged into the existing rows, with no duplication and an Unattached affordance; DEMO mode unaffected."
    requirement: "ESIGN-10"
    verification:
      - kind: unit
        ref: "__tests__/contracts-standalone-docs.test.ts (3 tests: direct-query shape, standalone row surfaced, no duplication across sources)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildFanoutRows() emits one vault_documents row per Funun-account party, all sharing the same storage path, each satisfying the evidence guard."
    requirement: "ESIGN-10"
    verification:
      - kind: unit
        ref: "lib/split-sheets/distribution.test.ts (6 buildFanoutRows tests: account-holder-only, zero-account-holders, same-path invariant, evidence-guard shape, split_sheet_id/project_id propagation, full signer list)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The attach route enforces the party-AND-owner double check plus an executed-sheet gate before moving the sheet + document."
    requirement: "ESIGN-11"
    verification:
      - kind: unit
        ref: "lib/split-sheets/distribution.test.ts (5 attach-route authorization-matrix tests: 401, not-a-party 403, not-owner 403, not-executed 400, success path)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The reconcile route computes the name-matched diff and applies only artist-confirmed changes via a distinct action; the UI shows matched/unmatched/mismatch, supports manual re-map, and never mutates composers[] without confirmation."
    requirement: "ESIGN-12"
    verification:
      - kind: unit
        ref: "reconcileSplits itself is covered by lib/split-sheets/reconciliation.test.ts (17-01, 8 tests, unchanged); the reconcile route/ReconcileDiff wiring has no new automated test in this plan"
        status: unknown
      - kind: manual_procedural
        ref: "Human-check per plan: open the reconcile diff for an executed sheet whose composers[] differs; confirm the mismatch warning shows, dismiss leaves composers[] untouched, only explicit confirm writes"
        status: unknown
    human_judgment: true
    rationale: "The plan's own verify block designates this a human-check item (no live DocuSeal account or seeded executed sheet was available in this credential-free, no-server execution to drive the flow end-to-end); the route/component code is grep- and type-verified but not exercised through a browser session."

duration: 55min
completed: 2026-07-20
status: complete
---

# Phase 17 Plan 05: Distribution, Standalone Locker Fix, Attach-Later, Write-Back Summary

**Contract Locker now reaches project_id IS NULL vault_documents rows via a second direct query with an Unattached/Attach affordance, plus a pure account-holder-only cross-account fan-out builder, a party-AND-owner double-checked attach route, and a GET-computes/POST-confirms reconciliation route + UI that never silently touches tracks.metadata.composers[].**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-20T05:22:00Z
- **Completed:** 2026-07-20T06:17:02Z
- **Tasks:** 3 of 3 completed
- **Files modified:** 8 (2 modified, 6 created)

## Accomplishments
- `app/(artist)/contracts/page.tsx` exports `fetchContractRows()` (project-nested query + a SECOND direct `vault_documents` query filtered `user_id = user.id AND project_id IS NULL`) and `mergeContractRows()` (dedup-by-id merge) — closing RESEARCH Pitfall 2, the gap that made a standalone executed split sheet structurally invisible in Contract Locker no matter how correctly it was inserted.
- `components/contracts/ContractLocker.tsx` renders an "Unattached" pill on standalone rows and an `AttachPanel` (project picker + Attach button) in the detail panel, wired to the new attach route.
- `lib/split-sheets/distribution.ts` exports `buildFanoutRows()` — a pure builder producing one `vault_documents` insert shape per Funūn-account party, all sharing the same storage path, every row pre-satisfying `vault_documents_status_requires_evidence_chk`; ready for 17-07's webhook to apply verbatim.
- `app/api/split-sheets/[id]/attach/route.ts` — double ownership check (party-of-sheet AND owner-of-project, T-17-12) plus an executed-status gate; on success moves `split_sheets.vault_project_id` and the caller's own standalone document's `project_id`, firing the existing readiness trigger.
- `app/api/split-sheets/[id]/reconcile/route.ts` — `GET` computes a display-only diff via 17-01's `reconcileSplits`; `POST` applies ONLY an explicit `{action:'confirm'}` payload's composer set (T-17-13). Both share a party-AND-owner `authorize()` check.
- `components/split-sheets/ReconcileDiff.tsx` — fetches and renders the diff, lets the artist manually re-map an unmatched party onto an existing composer row, and only writes on explicit confirm; dismiss keeps a reopenable mismatch banner rather than hiding it.

## Task Commits

1. **Task 1: Contract Locker standalone (projectless) document query** - `b349e5a` (feat)
2. **Task 2: Cross-account fan-out row builder + attach-later route** - `8d3752d` (feat)
3. **Task 3: Offered (never-silent) reconciliation diff route + UI** - `cebf086` (feat)

_Each task's tests were written and run to green before its commit; test/impl were authored together per task rather than as separate RED/GREEN commits, consistent with 17-01's "single feat commit per completed task" convention noted in that plan's summary._

## Files Created/Modified
- `app/(artist)/contracts/page.tsx` - Added `fetchContractRows()`/`mergeContractRows()`; the standalone direct query; passes `projects` to `ContractLocker`
- `components/contracts/ContractLocker.tsx` - `unattached`/`splitSheetId` fields on `ContractRow`; Unattached badge; `AttachPanel` client-side attach flow
- `__tests__/contracts-standalone-docs.test.ts` - 3 tests: direct-query shape assertions, standalone row surfacing, no-duplication merge
- `lib/split-sheets/distribution.ts` - `buildFanoutRows()` + `FanoutParty`/`FanoutSheet`/`FanoutVaultDocumentRow` types
- `lib/split-sheets/distribution.test.ts` - 11 tests: 6 `buildFanoutRows` + 5 attach-route authorization matrix
- `app/api/split-sheets/[id]/attach/route.ts` - Party-AND-owner double check, executed-status gate, service-client move
- `app/api/split-sheets/[id]/reconcile/route.ts` - `GET` diff / `POST` confirm-only write, track-picking helper
- `components/split-sheets/ReconcileDiff.tsx` - Diff UI, manual re-map, confirm/dismiss

## Decisions Made
- `document_data.split_sheet_id` is the join key from a fanned-out `vault_documents` row back to its `split_sheets` row (no FK exists on a JSONB column) — `buildFanoutRows` writes it, Contract Locker's standalone-row builder and the attach route's own-document lookup both read it. 17-07's webhook must populate this key exactly, or the attach affordance silently has nothing to attach.
- Attach route requires `split_sheets.status = 'executed'` before allowing attach — not spelled out in the plan's behavior block verbatim, but required by the must_haves truth ("A standalone EXECUTED sheet can be attached"); added under Rule 2 (missing validation) since attaching a still-pending sheet would move readiness/documents on unfinished paperwork.
- Reconcile route resolves the target track by normalized `song_name` ↔ track `title` match, falling back to the project's single track when unambiguous, else returns a 400 rather than guessing — the plan left song↔track mapping to discretion, and an executed split sheet's `song_name` is the only signal available without a schema link.
- Reconcile `GET`/`POST` share one `authorize()` (party-on-sheet AND owner-of-attached-project) rather than the plan text's slightly looser phrasing ("initiator/party and target project's owner") — read tighter than write here since the diff itself can reveal another party's percentages, and only the owner can ever legally write `composers[]` per `tracks` RLS.
- `ReconcileDiff`'s confirm step only re-maps an unmatched party onto an **existing** composer row picked from a dropdown; it never synthesizes a new composer entry, since a synthesized row would be missing `role`/`pro`/`ipi` data the diff doesn't carry.
- Dismissing the diff keeps a persistent, reopenable "mismatch unresolved" banner instead of unmounting to nothing — satisfies the "visible … until resolved" requirement without re-touching `ContractLocker.tsx` (see scoping note below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Attach route requires `executed` status before allowing attach**
- **Found during:** Task 2 (attach route)
- **Issue:** The plan's behavior block for the attach route didn't explicitly list a status check, but the plan's own `must_haves.truths` requires "A standalone EXECUTED sheet can be attached" — without a status gate, a `pending_approval`/`countered` sheet's placeholder document row could be attached prematurely.
- **Fix:** Added a `sheet.status !== 'executed'` → 400 check before the service-client write.
- **Files modified:** `app/api/split-sheets/[id]/attach/route.ts`
- **Verification:** `lib/split-sheets/distribution.test.ts` "400s when the sheet is not yet fully executed"
- **Committed in:** `8d3752d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical validation)
**Impact on plan:** Necessary for correctness (the must_haves truth already required this; the behavior block simply omitted stating the check explicitly). No scope creep.

## Issues Encountered
- **cwd drift into the main checkout mid-session:** initial context-gathering (`Read`/`Bash` calls to load CONTEXT/RESEARCH/prior summaries) ran against `/Users/peterzora/Desktop/funun` (the main repo checkout on a different branch) rather than this worktree, because the harness's default `cd` target didn't match the assigned worktree path. Caught before any `Write`/`Edit` landed (the first `Write` call errored with "Edit the worktree copy of this file instead"), confirmed the worktree was at the identical commit (`7f25b44`) via `diff <(git -C <main> show HEAD:<path>) <worktree file>`, wrote a spawn-time sentinel, and re-verified every subsequent file path was under the worktree root before any mutation. No edits were made from the wrong location.
- No other issues — full suite (`npx jest`) stayed green throughout (55/555 baseline → 57/569 after this plan's 2 new suites/14 tests, exactly accounting for the delta), `tsc --noEmit` and `npm run lint` stayed clean after every task.

## User Setup Required
None - no external service configuration required. This plan is explicitly credential-free (no DocuSeal API calls, no `supabase db push`, no network).

## Next Phase Readiness
- `buildFanoutRows()` is ready for 17-07's webhook to call directly after a DocuSeal `submission.completed` event, using the executed file URL/audit URL/`completedAt`/`requestId` the webhook resolves.
- The attach route and Contract Locker's standalone query are ready for 17-06/17-07 to exercise end-to-end once a real DocuSeal account produces an executed sheet.
- `ReconcileDiff` is built but not yet mounted on a page — a later plan (likely wherever the split-sheet detail/project view lands) needs to render `<ReconcileDiff sheetId={...} />` somewhere reachable, per this plan's `key_links`.
- Outstanding human-check from the plan's own verify block (D4 above): opening the reconcile diff for a real executed sheet with a composers[] mismatch, confirming the warning/dismiss/confirm behavior live — deferred to whenever 17-06/17-07 produce a real executed sheet to test against (no live DocuSeal account in this credential-free execution).
- No blockers. 17-02's `supabase db push` human checkpoint remains open per that plan's own gating (not this plan's concern) — this plan's routes do not depend on migration 062's tables at runtime (only on `split_sheets`/`split_sheet_parties`/`vault_documents`/`tracks`, all pre-existing).

---
*Phase: 17-split-sheet-esign*
*Completed: 2026-07-20*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commit hashes (b349e5a, 8d3752d, cebf086) verified present in git log.
