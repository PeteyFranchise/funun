---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 07
subsystem: api
tags: [nextjs, supabase, ranking, crate-requests, lead-engine, r10]

# Dependency graph
requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-02 — buyer_briefs (migration 106) + selects/selects_tracks/selects_reactions (migration 111) data model"
provides:
  - "lib/crate-requests/ranking.ts — pure, deterministic rankCrateRequests() intent ranker with de-dup + guest new-lead handling"
  - "GET /api/admin/crate-requests — own-book-scoped, intent-ranked, guest-aware Crate Requests demand inbox (absorbs the read-only Lead Engine)"
affects: [31-11 (Crate Requests room UI), 31-04 (Selects builder — Build Selects action target)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure ranking core + I/O route split (mirrors lib/deals/stage-machine.ts): ranking.ts has zero Supabase import, zero I/O; the route normalizes DB rows into the ranker's item shape and never re-implements ordering."
    - "Deterministic stable tiebreak: every ranking comparator ends on item id ascending, so shuffled/duplicated input always produces the same output order (the R10 concurrency/stability backstop)."
    - "Guest signal never inherits its parent org's identity (T-31-17) — clientOrgId is deliberately forced to null for an anonymous selects_reactions viewer, even though the parent Select's org is technically knowable."

key-files:
  created:
    - lib/crate-requests/ranking.ts
    - lib/crate-requests/ranking.test.ts
    - app/api/admin/crate-requests/route.ts
    - .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md
  modified: []

key-decisions:
  - "Rank order: brief (4) > repeat_search (3) > selects_reopen (2) > tag_browse (1), then a deadline/budget boost, then unactioned-first, then newer-first, then a stable id tiebreak — matches crate-lead-engine-BUILD-SPEC.md §4 exactly."
  - "De-dup key is kind+clientOrgId only; a guest/null-client item never merges with anything (each keyed off its own id) so it can never be silently absorbed into another row."
  - "De-dup window is 24h, walked chronologically per key (not input-order-dependent) so grouping is deterministic regardless of fetch order."
  - "Selects re-open signal (no per-view telemetry exists yet — that's a later R13 plan) is approximated from a status transition to approved/changes_requested after being sent; changes_requested counts as unactioned, approved as actioned."
  - "Guest new-lead source: selects_reactions rows with reacted_by IS NULL (an anonymous /selects/[token] player viewer) on a covered org's sent Selects — the only real anonymous-signal source in the current schema — surfaced with clientOrgId forced to null (T-31-17)."
  - "Search-activity logging and tag-browsing telemetry have no backing table yet (BUILD-SPEC gap, not built by 106/111) — both sources return empty and the route degrades tolerantly, matching the existing Lead Engine page's tolerance for a lagging schema cache."
  - "Per-row one-click action is a structured discriminated descriptor ({type:'build_selects'|'follow_up'|'see_lead', ...ids}), not a hardcoded page URL — the Selects builder UI (31-04/31-10) that would consume it hasn't landed yet in this wave."

patterns-established:
  - "Intent ranker exposes weight on every output row instead of baking in Hot/Warm labels, so the UI (31-11) owns chip-threshold discretion without a second ranking implementation."

requirements-completed: [R10]

coverage:
  - id: D1
    description: "Pure intent ranker: brief > repeat_search > selects_reopen > tag_browse, deadline/budget boost, unactioned-first, newer-first"
    requirement: R10
    verification:
      - kind: unit
        ref: "lib/crate-requests/ranking.test.ts#rankCrateRequests — intent ordering"
        status: pass
    human_judgment: false
  - id: D2
    description: "R10 stability backstop — shuffle-invariant, deterministic ordering via a stable id tiebreak"
    requirement: R10
    verification:
      - kind: unit
        ref: "lib/crate-requests/ranking.test.ts#rankCrateRequests — R10 stability backstop (held-out)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A guest/null-client signal is never dropped and is tagged as a new lead"
    requirement: R10
    verification:
      - kind: unit
        ref: "lib/crate-requests/ranking.test.ts#rankCrateRequests — guest new-lead handling"
        status: pass
    human_judgment: false
  - id: D4
    description: "De-dup collapses repeat same-kind+client signals within a window into one row with a count, deterministically, never across different clients"
    requirement: R10
    verification:
      - kind: unit
        ref: "lib/crate-requests/ranking.test.ts#rankCrateRequests — de-dup"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/admin/crate-requests is own-book-scoped (requireStaff + ae_user_id filter, leadership unscoped) and calls rankCrateRequests rather than re-implementing ordering"
    requirement: R10
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean) + grep -q 'rankCrateRequests' app/api/admin/crate-requests/route.ts (confirmed)"
        status: pass
    human_judgment: true
    rationale: "Own-book scoping and guest-signal wiring touch a live Supabase service-role client with no integration-test harness in this repo (no test DB) — the route's own-book filter and guest-null-clientOrgId logic are code-inspectable and type-clean but not exercised against a real database in this plan; a human/live-DB verification pass (mirroring the existing Lead Engine page's convention) is the appropriate check once migrations 106/111 are pushed."

# Metrics
duration: 25min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 07: Crate Requests Demand Inbox (R10) Summary

**Pure, deterministic intent-ranking core (brief > repeat_search > selects_reopen > tag_browse, shuffle-stable via an id tiebreak) plus an own-book-scoped `/api/admin/crate-requests` feed route that absorbs the read-only Lead Engine.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-16T02:20:00Z (approx.)
- **Completed:** 2026-08-16T02:45:40Z
- **Tasks:** 2
- **Files modified:** 4 (3 created for the plan + 1 deferred-items log)

## Accomplishments
- `lib/crate-requests/ranking.ts` — a pure `rankCrateRequests()` with zero I/O, zero `@/lib/supabase` import: intent-weighted ordering, deadline/budget boost, unactioned-first, newer-first, and a documented stable id tiebreak that makes the ranker's output order immune to input-array shuffling (the R10 backstop).
- Deterministic de-dup: repeat signals of the same kind+client within a 24h window collapse into one row carrying a `count`; a guest/null-client item never merges with anything and is always kept, tagged `isNewLead`.
- `GET /api/admin/crate-requests` — requireStaff-gated, own-book-scoped (non-leadership filtered to `buyer_orgs.ae_user_id = them`, leadership unscoped) feed that normalizes `buyer_briefs` (106) and Selects status-transition re-opens (111) into the ranker's item shape, plus a guest-viewer new-lead signal sourced from anonymous `selects_reactions` (T-31-17: never attributed to the parent org).
- Each output row carries a `clientTag`, the raw intent `weight` (so the UI owns Hot/Warm chip thresholds), and a structured one-click `action` descriptor (`build_selects` / `follow_up` / `see_lead`).

## Task Commits

Each task was committed atomically (Task 1 is TDD — RED then GREEN):

1. **Task 1: RED — failing ranking test** - `eeec27a` (test)
2. **Task 1: GREEN — pure intent ranker** - `d8180c2` (feat)
3. **Task 2: Own-book-scoped Crate Requests feed route** - `a4268bc` (feat)
4. **Deferred-items follow-up (second pre-existing build failure confirmed)** - `40c565c` (docs)

_No plan-metadata commit yet — SUMMARY.md commit follows this file write (worktree mode; orchestrator handles STATE.md/ROADMAP.md centrally)._

## Files Created/Modified
- `lib/crate-requests/ranking.ts` - pure intent ranker (`rankCrateRequests`), de-dup, guest new-lead tagging
- `lib/crate-requests/ranking.test.ts` - 14 tests: intent ordering, R10 stability backstop, guest handling, de-dup
- `app/api/admin/crate-requests/route.ts` - own-book-scoped GET feed route (briefs + Selects re-opens + guest reactions)
- `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md` - logs two pre-existing, out-of-scope build failures found during verification (see Deviations)

## Decisions Made
- Rank order + tiebreak sequence, de-dup key/window, guest-signal source, and the action-descriptor shape are all captured in the frontmatter `key-decisions` above — see there for the full rationale on each.
- Kept `ranking.ts` free of any UI copy/label logic (no "Hot"/"Warm" strings) — it exposes `weight` and lets the route/UI layer make presentation decisions, per the plan's explicit "Claude's-discretion... belongs in the UI" instruction.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; the plan's own scope was fully buildable from the existing schema (migrations 106/111) and conventions (`lib/admin/gate.ts`, `lib/staff/scope.ts`, the `/admin/my-client-partners` own-book read pattern).

### Out-of-scope discoveries (logged, not fixed — Scope Boundary rule)

**1. `npm run build` fails on two unrelated, pre-existing Phase 32 routes**
- **Found during:** Task 2 verification (`npm run build`).
- **Files:** `app/api/cron/daily-observability-check/route.ts` (Phase 32-05, commit `68f0258`) and `app/api/health/route.ts` (Phase 32-03, commit `32d2d6a`) — both export a plain uppercase `const` (`DOC_PATH`, `SUPABASE_CHECK_TIMEOUT_MS`) from a `route.ts` file, which Next.js App Router's route-export-shape type check rejects. Both errors only surface once `next build` generates `.next/types/` — a plain `tsc --noEmit` run beforehand does not see them.
- **Confirmed pre-existing:** both lines exist verbatim at this worktree's base commit (`e871682`), predating any Phase 31 change; `git log` traces them to their originating Phase 32 commits.
- **Why not fixed here:** out of scope — neither file is in this plan's `files_modified` list, and fixing them would touch Phase 32's observability work from inside a Phase 31 plan.
- **What was used instead to verify this plan's own correctness:** `npx tsc --noEmit` (clean, before `.next/types/` existed) + `npx jest lib/crate-requests/ranking.test.ts` (14/14 green) + `grep -q "rankCrateRequests" app/api/admin/crate-requests/route.ts` (confirmed) — i.e., every automated check this plan's `<verify>` block specifies EXCEPT the final `npm run build` succeeds, which fails purely due to the two unrelated files above.
- **Logged in:** `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md` (includes a suggested one-line fix for whoever resumes Phase 32).
- **Committed in:** `a4268bc`, `40c565c`

---

**Total deviations:** 0 auto-fixed; 1 out-of-scope discovery logged (2 files, same root cause, both pre-existing/Phase 32).
**Impact on plan:** None on this plan's own correctness — `tsc`, targeted jest, and the grep check all pass. `npm run build`'s failure is fully attributable to files outside this plan's scope; the deferred-items log gives Phase 32's resumer a one-line fix.

## Issues Encountered
None beyond the deviation logged above.

## User Setup Required
None - no external service configuration required. (Migrations 106/111 that this route reads are already documented as owner-run/human-gated per prior 31-01/31-02 plans; this plan does not add or modify any migration.)

## Next Phase Readiness
- `lib/crate-requests/ranking.ts` is a stable, tested contract 31-11 (Crate Requests room UI) can render directly (weight → Hot/Warm chips, action → button wiring).
- The `action.type === 'build_selects'` descriptor (`{buyerOrgId, briefId}`) is ready for 31-04's `POST /api/admin/selects` once that plan lands — no coupling exists yet since 31-04's routes are not in this worktree.
- Blocker/concern: the two pre-existing Phase 32 build failures block a clean `npm run build` for the WHOLE repo until fixed (see deferred-items.md) — this does not block Phase 31 plans individually (each verified via `tsc --noEmit` + targeted `jest`), but the orchestrator/owner should be aware the full-build acceptance criterion cannot pass repo-wide until Phase 32 is patched.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*
