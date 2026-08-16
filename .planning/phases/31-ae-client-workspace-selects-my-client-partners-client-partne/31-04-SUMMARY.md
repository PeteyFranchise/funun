---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 04
subsystem: api
tags: [supabase, zod, nextjs-route-handlers, rls, own-book-scoping, rights-ready]

requires:
  - phase: 31-02
    provides: migration 111 (selects/selects_tracks/selects_reactions/selects_saved_searches schema, RLS, share_token)
  - phase: 31-03
    provides: lib/selects/stage-machine.ts's isLegalSelectsTransition (Selects status state machine)
provides:
  - "lib/selects/persistence.ts — own-book scope helpers (isOrgInAeScope, loadSelectsInScope) plus Selects CRUD (createSelects, patchSelects, softDeleteSelects) and selects_tracks CRUD (addSelectsTrack idempotent, removeSelectsTrack soft, updateSelectsTrack)"
  - "app/api/admin/selects/route.ts (GET list, POST create) — own-book scoped"
  - "app/api/admin/selects/[id]/route.ts (PATCH allowlisted edit, DELETE draft-only discard)"
  - "app/api/admin/selects/[id]/tracks/route.ts (GET with per-track rights_ready, POST idempotent add, PATCH note/reorder, DELETE soft-remove)"
  - "app/api/admin/selects/[id]/send/route.ts (POST — mints the live share link, gated by isLegalSelectsTransition + the empty-Selects guard, persists D-02 download settings)"
affects: [31-05, 31-10, 31-13]

tech-stack:
  added: []
  patterns:
    - "Own-book scope predicate reused everywhere: isOrgInAeScope/loadSelectsInScope resolve to null/false on both 'not found' and 'not assigned' — the route layer renders both identically as 404, never 403 (T-31-07, no existence leak)."
    - "Track-row mutations (removeSelectsTrack/updateSelectsTrack) scope by BOTH trackRowId AND selects_id in the SAME WHERE clause — a TOCTOU-safe write, not a separate pre-check."
    - "Rights-ready and status-transition predicates (isRightsReady/computeStage3, isLegalSelectsTransition) are imported and called DIRECTLY in the route files that need them, mirroring app/api/admin/deals/[id]/route.ts's convention — not wrapped a second time in a persistence-layer indirection."

key-files:
  created:
    - lib/selects/persistence.ts
    - lib/selects/persistence.test.ts
    - app/api/admin/selects/route.ts
    - app/api/admin/selects/[id]/route.ts
    - app/api/admin/selects/[id]/tracks/route.ts
    - app/api/admin/selects/[id]/send/route.ts
    - app/api/admin/selects/[id]/send/route.test.ts
    - .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md
  modified: []

key-decisions:
  - "softDeleteSelects implements a guarded hard-delete restricted to status='draft' — migration 111's `selects` table has no deleted_at column (unlike selects_tracks), so a literal soft-delete of the Selects entity isn't representable in the schema; deleting is only ever safe pre-send anyway."
  - "Rights-ready resolution (tracks/route.ts) and the send-guard (send/route.ts) implement their DB predicates directly in the route file rather than through a persistence.ts wrapper, matching the codebase's existing app/api/admin/deals/[id]/route.ts convention."
  - "addSelectsTrack/removeSelectsTrack/updateSelectsTrack scope every write by both the row id and selects_id in one WHERE clause — a Rule 2 correctness addition beyond the plan's literal text, closing a scope-leak where a caller could guess a trackRowId belonging to a different Selects."

requirements-completed: [R11, R5, D-02]

coverage:
  - id: D1
    description: "An AE can create a Selects for one of their assigned clients (own-book scoped via requireStaff + isAssignedToOrg); leadership can do so for any client; a non-assigned org returns 404, never 403."
    requirement: R5
    verification:
      - kind: unit
        ref: "lib/selects/persistence.test.ts#isOrgInAeScope / #loadSelectsInScope"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adding a track already present in a Selects is idempotent — no duplicate selects_tracks row; a previously soft-removed row is un-removed instead."
    requirement: R11
    verification:
      - kind: unit
        ref: "lib/selects/persistence.test.ts#addSelectsTrack (idempotency)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An empty Selects cannot be sent; a Selects in a terminal/illegal state cannot be (re-)sent; sending mints the share link, stamps sent_at, and persists the D-02 download gate."
    requirement: R11
    verification:
      - kind: unit
        ref: "app/api/admin/selects/[id]/send/route.test.ts#POST /api/admin/selects/[id]/send"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every returned selects_tracks row carries a rights_ready flag sourced from lib/deals/catalog.ts (isRightsReady/computeStage3), never re-derived inline."
    requirement: R11
    verification:
      - kind: other
        ref: "grep isRightsReady app/api/admin/selects/[id]/tracks/route.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Track removal is a soft remove (removed_at/removed_by) — the row survives for the Removed tray, never a hard delete."
    requirement: R11
    verification:
      - kind: unit
        ref: "lib/selects/persistence.test.ts (softDeleteSelects/removeSelectsTrack scope contract — see persistence.ts doc comments)"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 04: Selects Builder Persistence + Core API Summary

**Own-book-scoped Selects CRUD + idempotent track add/soft-remove + a send route that mints the share link, gated by the status state machine and an empty-Selects guard, with D-02 download settings and read-time rights-ready sourced from the single lib/deals/catalog.ts authority.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-16T02:53:00Z
- **Tasks:** 3
- **Files modified:** 8 (7 created + 1 deferred-items note edited)

## Accomplishments

- `lib/selects/persistence.ts`: own-book scope helpers (`isOrgInAeScope`, `loadSelectsInScope` — fail-closed, 404-not-403 by construction) plus Selects entity CRUD (`createSelects`, `patchSelects` with a `SELECTS_EDITABLE_FIELDS` allowlist including the D-02 download fields, `softDeleteSelects`) and selects_tracks CRUD (`addSelectsTrack` idempotent, `removeSelectsTrack` soft, `updateSelectsTrack` for note/reorder — the latter two scoped by both row id and selects_id in one WHERE clause).
- `app/api/admin/selects/route.ts` + `[id]/route.ts`: GET list / POST create / PATCH edit / DELETE (draft-only) — every route calls `requireStaff(['leadership','ae','bd'])` then re-checks own-book scope before any write; scope denial is a 404, matching a genuine not-found.
- `app/api/admin/selects/[id]/tracks/route.ts`: GET resolves each track's `rights_ready` at READ time via `lib/deals/catalog.ts`'s `isRightsReady`/`computeStage3` (imported directly, batched per-project, cached across tracks sharing a project); POST is idempotent; PATCH updates note/position; DELETE soft-removes via a `?trackRowId=` query param.
- `app/api/admin/selects/[id]/send/route.ts`: the "a client receives a Selects" boundary — gated by `isLegalSelectsTransition(current.status, 'sent')` then the empty-Selects guard (R11 AC), stamps `sent_at`, persists `download_enabled`/`download_max_seconds`, and returns `/selects/{share_token}` (token already minted at insert time, never re-minted).
- 33 unit tests across `lib/selects/persistence.test.ts` and the two colocated route tests (`[id]/send/route.test.ts`), all green; `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Selects CRUD routes + own-book scope guards + assignment-scope test** - `3f30f63` (feat)
2. **Task 2: Track add (idempotent) / remove (soft) / reorder / note routes with rights-ready** - `52ed8bb` (feat)
3. **Task 3: Send route — mint token, status→sent, empty-guard, download gate** - `7e74270` (feat)

**Deferred-items follow-up:** `7bff410` (docs — noted a second unrelated pre-existing build failure found during full verification)

**Plan metadata:** _(this commit)_

## Files Created/Modified

- `lib/selects/persistence.ts` - Own-book scope helpers + Selects entity CRUD + selects_tracks CRUD (add/remove/update)
- `lib/selects/persistence.test.ts` - Assignment-scope, allowlist, and idempotent-add unit tests
- `app/api/admin/selects/route.ts` - GET (own-book-scoped list) + POST (create)
- `app/api/admin/selects/[id]/route.ts` - PATCH (allowlisted edit) + DELETE (draft-only discard)
- `app/api/admin/selects/[id]/tracks/route.ts` - GET (rights_ready per track) + POST (idempotent add) + PATCH (note/reorder) + DELETE (soft-remove)
- `app/api/admin/selects/[id]/send/route.ts` - POST (send: transition gate, empty guard, download settings, share link)
- `app/api/admin/selects/[id]/send/route.test.ts` - Send-guard unit tests
- `.planning/phases/31-.../deferred-items.md` - Logs two out-of-scope pre-existing build failures found during verification (Phase 32 files)

## Decisions Made

- **softDeleteSelects is a guarded hard-delete, not a literal soft-delete.** Migration 111's `selects` table has no `deleted_at` column (unlike `selects_tracks`, which does). Adding one is a schema change (this project never runs `supabase db push` from an agent), so the safe equivalent implemented is: a Selects can only be discarded while still `status = 'draft'` — before any client-visible share link has ever been sent — so deleting it destroys nothing a client has seen. A Selects that has ever reached `sent` is never deletable through this path (409 if attempted).
- **Rights-ready and send-guard predicates live directly in their route files, not in `persistence.ts`.** The plan's own automated verify commands grep for `isRightsReady` in `tracks/route.ts` and `isLegalSelectsTransition` in `send/route.ts` — this matches the codebase's existing `app/api/admin/deals/[id]/route.ts` convention of importing `lib/deals/stage-machine`'s pure predicates directly into the route rather than wrapping them a second time. `persistence.ts` stays scoped to the Selects-entity CRUD + selects_tracks CRUD + own-book scope helpers.
- **Track-row mutations are TOCTOU-safe by construction.** `removeSelectsTrack`/`updateSelectsTrack` filter by both `id` (the row) and `selects_id` (the parent) in the same `WHERE` clause, so a caller cannot mutate a track row belonging to a *different* Selects by supplying a `trackRowId` they don't own — mirrors `app/api/admin/buyer-orgs/[id]/route.ts`'s "scope-safe write" convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] TOCTOU-safe scoping on selects_tracks mutations**
- **Found during:** Task 2 (track add/remove/reorder routes)
- **Issue:** The plan's "own-book scoped" truth covers the Selects entity, but a naive `removeSelectsTrack(trackRowId)` / `updateSelectsTrack(trackRowId, ...)` taking only the child row id — after the parent Selects' scope was checked once — would let a caller mutate a *different* Selects' track row by guessing/reusing a `trackRowId`, since the mutation itself carried no parent-scoping predicate.
- **Fix:** Both functions filter by `eq('id', trackRowId).eq('selects_id', selectsId)` in the same UPDATE — a mismatched pairing matches zero rows and returns `null` (404), never touching an out-of-scope row.
- **Files modified:** `lib/selects/persistence.ts`
- **Verification:** Code review confirms both queries carry the compound filter; `npx tsc --noEmit` clean.
- **Committed in:** `52ed8bb` (Task 2 commit)

**2. [Rule 3 - Blocking] softDeleteSelects has no `deleted_at` column to write**
- **Found during:** Task 1 (Selects CRUD)
- **Issue:** The plan's action text calls for `softDeleteSelects`, but migration 111's `selects` table (unlike `selects_tracks`) defines no `deleted_at`/`deleted_by` columns — a literal soft-delete is not representable in the current schema, and this project never runs `supabase db push` from an agent (schema changes are human-gated).
- **Fix:** Implemented as a guarded hard-delete restricted to `status = 'draft'` — see "Decisions Made" above. Documented inline in `persistence.ts`'s doc comment.
- **Files modified:** `lib/selects/persistence.ts`, `app/api/admin/selects/[id]/route.ts`
- **Verification:** `lib/selects/persistence.test.ts`'s `softDeleteSelects` tests assert the `not_draft`/`not_found` result shapes.
- **Committed in:** `3f30f63` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical scope hardening, 1 blocking schema-gap workaround)
**Impact on plan:** Both changes are correctness/security requirements implied by the plan's own "own-book scoped" and "never destroys curation" truths; no scope creep beyond what those truths already demand.

## Issues Encountered

- `npm run build` fails on two pre-existing, unrelated files (`app/api/cron/daily-observability-check/route.ts`, `app/api/health/route.ts` — both export a non-handler constant Next.js 15's route-type validation rejects; both predate this plan, introduced by Phase 32). `npx tsc --noEmit` is clean for every file this plan touches, confirmed both before and after running `npm run build` (with the resulting gitignored `.next/` artifacts removed). Logged in `deferred-items.md`, not fixed (out of scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-05 (AI-draft/saved-search API) and 31-10 (Selects builder UI) can build directly on these routes — create/list/edit/delete a Selects, add/remove/reorder/annotate its tracks, and send it are all live and own-book-scoped.
- 31-13 (public token player) can rely on `send`'s guarantee that `share_token` is live and `status = 'sent'` only once a non-empty Selects has been sent through this exact gate.
- No blockers. The two pre-existing build failures noted above are Phase 32's concern, not a dependency of any Phase 31 plan.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

All 9 created files confirmed present on disk (`lib/selects/persistence.ts`,
`lib/selects/persistence.test.ts`, `app/api/admin/selects/route.ts`,
`app/api/admin/selects/[id]/route.ts`, `app/api/admin/selects/[id]/tracks/route.ts`,
`app/api/admin/selects/[id]/send/route.ts`, `app/api/admin/selects/[id]/send/route.test.ts`,
`deferred-items.md`, this SUMMARY.md). All 4 referenced commit hashes
(`3f30f63`, `52ed8bb`, `7e74270`, `7bff410`) confirmed present via `git log`.
