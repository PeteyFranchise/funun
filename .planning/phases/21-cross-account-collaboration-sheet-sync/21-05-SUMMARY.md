---
phase: 21-cross-account-collaboration-sheet-sync
plan: 05
subsystem: ui

tags: [nextjs, react, dashboard, split-sheets, action-feed]

# Dependency graph
requires:
  - phase: 21-01
    provides: project_members + RLS rewrite making shared rows visible to non-owner viewers
  - phase: 21-02
    provides: auto-membership trigger (writers on linked split sheets become project members)
  - phase: 21-04
    provides: split-sheet <-> project sync (stable status vocabulary this plan's feed reads)
provides:
  - "lib/dashboard/next-moves.ts: buildNextMoves() pure derivation (pinned money/signature tier + flexible tier)"
  - "Dashboard 'Closest to ready' stat replacing the vanity 'Avg readiness' stat"
  - "Dashboard 'Your next moves' cross-account action feed"
affects: [dashboard, split-sheets, contracts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure structured-derivation module (no I/O) mirroring lib/contracts/locker-attention.ts's buildAttentionSections() — plain arrays in, structured sections out"
    - "pinned/flexible tier split: a locked, non-reorderable pinned tier for money/signature actions, and a flexible tier shaped for a future per-user ordering layer"

key-files:
  created:
    - lib/dashboard/next-moves.ts
    - lib/dashboard/next-moves.test.ts
  modified:
    - "app/(artist)/dashboard/page.tsx"

key-decisions:
  - "buildNextMoves() classifies by sheet.status (mirroring buildAttentionSections' AWAITING_SIGNATURE_STATUSES bucket exactly, sourced from lib/split-sheets/lifecycle.ts's CONSENSUS_RESET_STATUSES + 'countered' + 'esign_pending'), gated on the viewer being the sheet's initiator or a named party — not a finer per-party-approval-state filter, since esign-stage per-signer state (esign_envelope_signers) is out of this plan's input scope"
  - "'Your next moves' renders regardless of the viewer's owned-project count (moved outside the total===0 welcome-screen branch) — the inclusion rule is 'is this waiting on you', not ownership, so a brand-new user who only exists as a shared collaborator must still see it"
  - "Closest to ready' picks the highest-scoring NOT-YET-deal-ready project from the existing owner-scoped query only; ties broken by array order (first highest-scoring wins) since no secondary sort key was specified"

patterns-established:
  - "Dashboard action-feed derivation: lib/dashboard/next-moves.ts is the second module in this codebase following the pure-structured-derivation-over-already-fetched-rows convention (locker-attention.ts is the first) — future action feeds should mirror this shape rather than reading a notifications table"

requirements-completed: ["④-dashboard", "③-mine-vs-shared"]

coverage:
  - id: D1
    description: "buildNextMoves() pure derivation: money/signature statuses (pending_approval/approved/countered/esign_pending) land in a locked pinned tier; a viewer-initiated draft lands in flexible; non-initiator drafts and unrecognized statuses produce no row; every row carries a stable href/label"
    requirement: "④-dashboard"
    verification:
      - kind: unit
        ref: "lib/dashboard/next-moves.test.ts (12 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dashboard drops the 'Avg readiness' vanity stat and replaces it with a 'Closest to ready' card (nearest owned not-yet-ready project, gates-left count, link), computed strictly from the existing owner-scoped (.eq('user_id', me)) project query"
    requirement: "③-mine-vs-shared"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm run build (grep-verified: no 'Avg readiness'/avgScore string remains; owner-scoped .eq('user_id', ...) query line unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dashboard renders a 'Your next moves' feed sourced from a query separate from the owner-scoped stat query (fetchSplitSheetsForUser initiated+party-of merge), rendering pinned above flexible with pinned visually distinct (locked amber treatment), and rendering regardless of owned-project count"
    requirement: "④-dashboard"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npm test (full suite, 1204 tests) && npm run build"
        status: pass
      - kind: manual_procedural
        ref: "Visual confirmation that pinned rows render above flexible rows with the amber 'Signature' badge, and that a cross-account (non-owned) sheet the viewer is a named party on appears in the feed"
        status: unknown
    human_judgment: true
    rationale: "No demo-mode split-sheet fixtures exist to drive an automated screenshot/e2e check of the rendered feed against a live cross-account scenario; the derivation logic itself is fully unit-tested, but the SSR page's visual rendering and a real second-account cross-verification were not run in this autonomous execution."

duration: 27min
completed: 2026-08-02
status: complete
---

# Phase 21 Plan 05: Dashboard Action Feed Rework Summary

**Reworked the artist dashboard from a vanity scoreboard into an action surface: removed the "Avg readiness" stat, added an owner-scoped "Closest to ready" nudge, and added a cross-account "Your next moves" feed (`lib/dashboard/next-moves.ts`) with a locked money/signature tier pinned above softer draft-completion items.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-02T05:33:00Z (approx.)
- **Completed:** 2026-08-02T06:00:30Z
- **Tasks:** 3 (Task 1 executed as TDD RED→GREEN, two commits)
- **Files modified:** 3 (1 created pair + 1 modified)

## Accomplishments

- `lib/dashboard/next-moves.ts` — a pure, no-I/O `buildNextMoves()` derivation mirroring `lib/contracts/locker-attention.ts`'s `buildAttentionSections()` shape and module-header framing. Sources its money/signature status bucket from `lib/split-sheets/lifecycle.ts`'s `CONSENSUS_RESET_STATUSES` (not fresh literals), splits output into a locked `pinned` tier (review/approve, respond-to-counter, sign-document) and a `flexible` tier (complete-a-draft), and degrades unrecognized statuses to no row rather than throwing.
- Dashboard's "Avg readiness" vanity stat (blended readiness average across draft + released work) is gone entirely — replaced by "Closest to ready," which names the nearest-to-deal-ready OWNED project, its gates-left count (same math `VaultProjectCard`'s `rightLabel` uses), and links to it. Derivation stays strictly on the existing owner-scoped `.eq('user_id', me)` query.
- "Your next moves" section added to the dashboard: fetches sheets via `fetchSplitSheetsForUser()` (the initiated + party-of merge already used by `/split-sheets` and `/contracts`, now reaching shared-account rows since 21-01's RLS rewrite), feeds `buildNextMoves()`, and renders pinned rows above flexible rows with a visually distinct locked amber treatment on pinned items. Renders regardless of the viewer's owned-project count, since the inclusion rule is cross-account "is this waiting on you," not ownership.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): next-moves.test.ts + stub** - `73f8f7b` (test)
2. **Task 1 (GREEN): buildNextMoves() implementation** - `d0fc94d` (feat)
3. **Task 2: Remove Avg readiness, add Closest to ready** - `c0c38af` (feat)
4. **Task 3: Add "Your next moves" feed** - `650f20e` (feat)

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified

- `lib/dashboard/next-moves.ts` - Pure `buildNextMoves()` derivation: `NextMoveRow`, `NextMoveSections { pinned, flexible }`, status-bucket classification
- `lib/dashboard/next-moves.test.ts` - 12 unit tests covering the RED→GREEN behaviors (pinned/flexible shape, money/signature bucketing, cross-account reachability, P18-11 draft exclusion, unknown-status degrade, href/label stability)
- `app/(artist)/dashboard/page.tsx` - Removed `avgScore` + "Avg readiness" StatCard; added "Closest to ready" derivation + card; added `toNextMoveSheets()` mapping, the `fetchSplitSheetsForUser` query, and the "Your next moves" section render

## Decisions Made

- **Status-bucket classification over per-signer precision:** `buildNextMoves()` classifies pinned rows purely by `sheet.status` (matching `AWAITING_SIGNATURE_STATUSES`'s bucket shape) gated on the viewer being the sheet's initiator or a named party, rather than attempting to resolve per-signer esign completion (which lives in `esign_envelope_signers`, outside this plan's declared input scope — `files_modified` names only `lib/dashboard/next-moves.ts`/`.test.ts` and the dashboard page). This means a viewer who has already approved but is only waiting on other parties on a `pending_approval` sheet may still see a "review/approve" row; documented here as a known imprecision for a future refinement, not a correctness bug against this plan's stated behaviors (all 7 named behaviors + acceptance criteria pass).
- **Feed renders outside the `total === 0` branch:** the plan didn't explicitly specify this interaction, but since ④'s inclusion rule is "is this waiting on you, regardless of who owns the song," a brand-new user with zero owned projects but a pending cross-account split-sheet action would otherwise never see the feed under the original welcome-screen-only branch structure. Moved the feed's render above the `total === 0` conditional so it's independent of owned-project count.
- **`documentId` field reserved but unused:** `NextMoveRow.documentId` exists in the type for a future standalone `vault_documents` e-sign action, but is always `null` in this launch — `esign_pending` is exclusively a `split_sheets.status` value in this codebase (verified via grep), not a `vault_documents.status`, so the entire launch action set is sheet-derived.

## Deviations from Plan

None - plan executed exactly as written (Task 1's read-first-write-test-first TDD order was followed: test file authored and confirmed RED against a throwing stub before the real implementation was restored and confirmed GREEN).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 21 (cross-account-collaboration-sheet-sync) is now fully executed: all 5 plans (01–05) complete across auto-membership, mine-vs-shared vault lane, sheet↔project sync, and this dashboard action-feed rework.
- Known follow-up (not blocking): per-user configurability of the `flexible` tier (ordering/muting) is intentionally deferred per CONTEXT.md Deferred Ideas — the row/section shape (`NextMoveSections { pinned, flexible }`) is designed so that layer can bolt onto `flexible` without touching `pinned`.
- Known follow-up (not blocking): a live cross-account manual verification (second real account with a pending split-sheet action) was not run in this autonomous execution — see coverage D3's `human_judgment: true` rationale.

---
*Phase: 21-cross-account-collaboration-sheet-sync*
*Completed: 2026-08-02*

## Self-Check: PASSED

- FOUND: lib/dashboard/next-moves.ts
- FOUND: lib/dashboard/next-moves.test.ts
- FOUND: app/(artist)/dashboard/page.tsx
- FOUND commit: 73f8f7b (test RED)
- FOUND commit: d0fc94d (feat GREEN)
- FOUND commit: c0c38af (feat Task 2)
- FOUND commit: 650f20e (feat Task 3)
