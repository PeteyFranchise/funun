---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 05
subsystem: selects
tags: [anthropic, ai-draft, crm, jsonb, saved-search, zod]

# Dependency graph
requires: ["31-02"]
provides:
  - "lib/selects/ai-draft.ts — draftSelectsFromBrief + orderCandidatesRightsReadyFirst (D-11 AI-draft authority)"
  - "app/api/admin/selects/[id]/ai-draft/route.ts — POST populates a rights-ready-first ~10-track starter + cover note into a draft Selects"
  - "app/api/admin/selects/saved-searches/route.ts — GET/POST/PATCH saved + team-shared Crate search presets (D-12)"
affects: [31-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI structured-draft calls mirror lib/buyer/brief-ai.ts EXACTLY (new Anthropic({apiKey}), model claude-sonnet-4-6, TextBlock filter/join, tolerant JSON extraction, ok/error result union, never throw) — no second prompt-scaffolding copy anywhere in the codebase"
    - "Rights-ready-first ordering (not filtering): a candidate list is stable-sorted by lib/deals/catalog.ts's single isRightsReady authority, never hard-dropped, so an AI/curation surface can prioritize cleared tracks while still surfacing near-ready ones (D-11)"
    - "Bounded JSONB write: a saved-search filters object is zod-validated to string/number/boolean/string-array values only, with capped key count and string/array lengths — no arbitrary-depth object reaches the database"

key-files:
  created:
    - lib/selects/ai-draft.ts
    - app/api/admin/selects/[id]/ai-draft/route.ts
    - app/api/admin/selects/saved-searches/route.ts
    - .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md
  modified: []

key-decisions:
  - "AI-draft candidate pool is built directly in the route (not via the 31-04 tracks route, which had not landed in this worktree at execution time — parallel wave siblings) — a bounded, most-recent vault_projects fetch (2x AI_DRAFT_CANDIDATE_CAP) with per-project computeStage3 + batched sync_listings admission, mirroring lib/deals/catalog-query.ts's shape without its hard rights-ready-only filter (D-11 needs near-ready tracks visible to the model)."
  - "isRightsReady is invoked directly inside lib/selects/ai-draft.ts (orderCandidatesRightsReadyFirst), not just in the route — the single-authority import lives where the ordering logic lives, and the plan's own verify grep targets ai-draft.ts specifically."
  - "AI-draft persistence reimplements the idempotent-add / soft-remove-revive contract inline in the ai-draft route (matching 31-04's documented tracks-route contract) rather than calling that route over HTTP from another route handler — both routes converge on the same selects_tracks invariants (idempotent add, source 'crate', soft remove) without a server-to-server call."
  - "Saved-search GET has no own-book/AE-assignment scope check — a saved Crate filter preset is not client data (D-12 explicitly wants no leadership gate on team-shared recall), so requireStaff() alone gates read/write; only PATCH's team-share flip is ownership-scoped (T-31-11)."

requirements-completed: [R11, R5, D-11, D-12]

coverage:
  - id: D1
    description: "AI-draft route produces a rights-ready-first ~10-track starter with per-track reasons and a cover note into a draft Selects, own-book-scoped, reusing the shipped Anthropic pattern; saved-search route persists per-AE searches with owner-only team-share flip and gate-free team recall."
    requirement: "R11, R5, D-11, D-12"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit (clean); grep -q isRightsReady lib/selects/ai-draft.ts; test -f app/api/admin/selects/saved-searches/route.ts"
        status: pass
      - kind: manual
        ref: "Full npm run build blocked by a pre-existing, unrelated failure in app/api/cron/daily-observability-check/route.ts (see deferred-items.md) — not exercised end-to-end against a live Supabase instance in this worktree."
        status: deferred
    human_judgment: true

duration: ~40min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 05: AI-Draft + Saved Crate Searches Summary

**Brief→starter AI-draft (D-11) and per-AE / team-shared Crate search presets (D-12) — both reusing shipped patterns (the `lib/buyer/brief-ai.ts` Anthropic shape, the `requireStaff` staff gate) rather than inventing new scaffolding.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2 (both auto, no checkpoints)
- **Files modified:** 4 (3 new source files, 1 deferred-items log)

## Accomplishments

- `lib/selects/ai-draft.ts` — `draftSelectsFromBrief(brief, candidatePool)` mirrors `lib/buyer/brief-ai.ts`'s Anthropic SDK pattern exactly (`new Anthropic({apiKey})`, `claude-sonnet-4-6`, `TextBlock` filter/join, tolerant JSON extraction, `{ok:true,draft}|{ok:false,error}`, never throws). `orderCandidatesRightsReadyFirst` calls `lib/deals/catalog.ts`'s `isRightsReady` directly to stable-sort candidates rights-ready-first without dropping near-ready ones (D-11: "AI drafts, AE curates," not a hard filter).
- `app/api/admin/selects/[id]/ai-draft/route.ts` — `requireStaff()` + own-book `isAssignedToOrg` re-check (404 on scope denial, no existence leak), resolves the Selects' linked brief, assembles a bounded rights-ready-first-ordered candidate pool from the catalogue, calls `draftSelectsFromBrief`, and idempotently persists the drafted tracks into `selects_tracks` (source `'crate'`, revives soft-removed rows instead of duplicating, fills `cover_note` only if empty).
- `app/api/admin/selects/saved-searches/route.ts` — GET returns the caller's own searches plus every `is_team_shared` search (no leadership gate, D-12); POST zod-validates `{name, filters}` (filters bounded to string/number/boolean/string-array values, capped key/array/string lengths) and creates a private search; PATCH flips `is_team_shared` only on a search the caller owns (404 on ownership mismatch).
- `npx tsc --noEmit` is clean for all three new files (verified with `.next/types` cleared to exclude the unrelated pre-existing failure below).

## Task Commits

Each task was committed atomically:

1. **Task 1: AI-draft helper + route (rights-ready-first starter)** - `b42a785` (feat)
2. **Task 2: Saved / team-shared Crate searches route (D-12)** - `d2e1455` (feat)

Plus one documentation commit: `3dcf127` (docs — deferred-items log, see below).

## Files Created/Modified

- `lib/selects/ai-draft.ts` - the Anthropic structured-draft helper + rights-ready-first ordering (net-new)
- `app/api/admin/selects/[id]/ai-draft/route.ts` - AI-draft route, own-book-scoped, idempotent persistence (net-new)
- `app/api/admin/selects/saved-searches/route.ts` - saved/team-shared Crate search GET/POST/PATCH (net-new)
- `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md` - out-of-scope build failure log (net-new)

## Decisions Made

- The AI-draft candidate pool is assembled directly in the route via a bounded `vault_projects` fetch (2× `AI_DRAFT_CANDIDATE_CAP`), per-project `computeStage3` + batched `sync_listings` admission — mirroring `lib/deals/catalog-query.ts`'s data shape but deliberately NOT its hard rights-ready-only filter, since 31-04's tracks route (a parallel wave-2 sibling) had not landed in this worktree at execution time and D-11 requires near-ready tracks to remain visible to the model.
- `isRightsReady` is called inside `lib/selects/ai-draft.ts` itself (`orderCandidatesRightsReadyFirst`), not only in the route — matches the plan's own verify grep target and keeps the single rights-ready authority co-located with the ordering logic that depends on it.
- AI-draft persistence reimplements the idempotent-add / soft-remove-revive `selects_tracks` contract inline (documented as 31-04's tracks-route contract) rather than making a server-to-server HTTP call to that route — both converge on the same invariants (idempotent add, `source: 'crate'`, soft remove only) independently.
- Saved-search GET/POST have no own-book scoping — a saved Crate filter preset isn't client data, and D-12 explicitly wants team-shared recall gate-free; only the team-share flip (PATCH) is ownership-scoped.

## Deviations from Plan

### Auto-fixed Issues

None — both tasks executed as written. No Rule 1–3 fixes were needed; the candidate-pool self-containment described above (Decisions Made) is a plan-consistent implementation choice, not a deviation from any `<action>` instruction (the plan's `read_first` referenced 31-04's tracks route only as an idempotent-add pattern reference, and this plan's own `depends_on` is `["31-02"]`, not `31-04`).

### Out-of-scope discovery (logged, not fixed)

`npm run build` fails during type-checking on `app/api/cron/daily-observability-check/route.ts` (`DOC_PATH is not a valid Route export field`) — a pre-existing failure in a file this plan never touched (confirmed via `git log -1` showing it untouched at the worktree's base commit). Logged to `deferred-items.md` per the scope-boundary rule; `npx tsc --noEmit` (the plan's actual verify command) is clean for every file this plan created.

## Issues Encountered

31-04 (Selects CRUD + tracks route) is a parallel wave-2 sibling plan and had not merged into this worktree at execution time, so its `app/api/admin/selects/[id]/tracks/route.ts` and `lib/selects/persistence.ts` did not exist to import from. Handled by implementing the ai-draft route's own idempotent `selects_tracks` writes inline (see Decisions Made) rather than depending on files outside this plan's declared `depends_on: ["31-02"]`.

## User Setup Required

None. `ANTHROPIC_API_KEY` is an existing environment variable (already required by `lib/buyer/brief-ai.ts` and other AI tools) — no new secret introduced.

## Next Phase Readiness

31-10 (the Selects builder UI) can call `POST /api/admin/selects/[id]/ai-draft` and the saved-searches GET/POST/PATCH routes as built. When 31-04 merges, its `selects_tracks` writes and this plan's AI-draft writes share the same table invariants (idempotent add, soft remove, `source` values) by construction, so no reconciliation is expected — but a future pass could de-duplicate the idempotent-add logic into `lib/selects/persistence.ts` once both plans are merged, if desired.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: lib/selects/ai-draft.ts
- FOUND: app/api/admin/selects/[id]/ai-draft/route.ts
- FOUND: app/api/admin/selects/saved-searches/route.ts
- FOUND: .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md
- FOUND: b42a785 (feat — AI-draft helper + route)
- FOUND: d2e1455 (feat — saved/team-shared Crate search route)
- FOUND: 3dcf127 (docs — deferred-items log)
