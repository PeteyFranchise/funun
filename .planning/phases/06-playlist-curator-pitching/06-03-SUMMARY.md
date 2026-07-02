---
phase: 06-playlist-curator-pitching
plan: 03
subsystem: ui
tags: [nextjs, supabase, curator-directory, response-rate, filter-bar, route-groups]

# Dependency graph
requires:
  - phase: 06-01
    provides: curators + pitch_history tables (RLS-enabled), Curator/PitchHistory/CuratorPlatform/PitchStatus types
  - phase: 06-02
    provides: PLATFORM_VALUES/PLATFORM_LABELS from lib/curators/schema.ts, admin curator CRUD, reach + drift utilities
provides:
  - "GET /api/curators -- authenticated-artist directory read with 90-day response-rate join"
  - "lib/curators/response-rate.ts -- computeResponseRates() and the DirectoryCurator/CuratorWithRate types"
  - "CuratorCard / CuratorDirectory display components (reused by the 06-04 pitch composer's multi-select)"
  - "/curators -- artist-facing browse+filter directory page (PITCH-01)"
affects: [06-04-pitch-composer-send, 06-05-curator-claim-portal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Response-rate aggregation computed in app code over a 90-day pitch_history window (JS Map, curators with zero pitches omitted -- never a 0% entry), mirrors lib/vault/readiness.ts's in-app aggregation style"
    - "Directory-safe explicit column projection (never select('*')) shared identically between the GET route and the server-component page, collapsing claimed_by to a boolean before it leaves the server"
    - "Filter bar drives URL searchParams (aria-pressed buttons + useRouter().push), server component re-fetches -- no client-side array filtering"

key-files:
  created:
    - lib/curators/response-rate.ts
    - app/api/curators/route.ts
    - components/curators/CuratorCard.tsx
    - components/curators/CuratorDirectory.tsx
    - app/(artist)/curators/page.tsx
  modified:
    - .planning/phases/06-playlist-curator-pitching/deferred-items.md
  renamed:
    - app/(admin)/curators/page.tsx -> app/(admin)/admin/curators/page.tsx

key-decisions:
  - "Moved the admin curators page from app/(admin)/curators/ (bare /curators URL) to app/(admin)/admin/curators/ (/admin/curators URL) to resolve a Next.js duplicate-route collision with this plan's locked /curators artist artifact -- an unplanned, blocking discovery, not part of the original plan scope"
  - "Exported both CuratorWithRate (full Curator + response_rate, as the plan specified verbatim) and a separate DirectoryCurator type (the actual directory-safe projection shape used by the route, page, and both components) since the two are structurally different -- the directory never carries claim_token/email/baseline_genre_focus"

requirements-completed: [PITCH-01, PITCH-04]

coverage:
  - id: D1
    description: "computeResponseRates() aggregates pitch_history over the last 90 days in app code; curators with zero pitches in the window are omitted from the returned Map (never a 0% entry)"
    requirement: "PITCH-04"
    verification:
      - kind: unit
        ref: "grep -Eq '90|24 \\* 60 \\* 60 \\* 1000' lib/curators/response-rate.ts -- window present; code review: totals Map only populated from rows actually returned by the 90-day-filtered query, so zero-pitch curators never enter the rates Map"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/curators is authenticated-artist-only (401 unauthenticated), uses an explicit directory-safe column projection, and never returns email/claim_token/raw claimed_by"
    requirement: "PITCH-01"
    verification:
      - kind: unit
        ref: "grep -Eq getUser app/api/curators/route.ts; grep -v '^\\s*//' app/api/curators/route.ts | grep -Fc \"select('*')\" -> 0; code review: claimed_by destructured off the returned object and replaced with a claimed boolean"
        status: pass
    human_judgment: false
  - id: D3
    description: "CuratorCard hides the response-rate badge (not '0%') when response_rate is null, and shows 'Reach signal not yet available' (never '0') when reach_signal is null"
    requirement: "PITCH-04"
    verification:
      - kind: unit
        ref: "grep -q 'Reach signal not yet available' components/curators/CuratorCard.tsx; grep -q 'response rate' components/curators/CuratorCard.tsx; code review: both are guarded by `!== null` conditionals, no fallback to 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "CuratorDirectory filter chips are aria-pressed buttons that push genre/platform values to URL searchParams for a server re-fetch, not client-side filtering; empty state uses verbatim UI-SPEC copy"
    requirement: "PITCH-01"
    verification:
      - kind: unit
        ref: "grep -Eq aria-pressed components/curators/CuratorDirectory.tsx; grep -q 'No curators in the directory yet' components/curators/CuratorDirectory.tsx; code review: toggleParam() only calls router.push(), never filters initialCurators client-side"
        status: pass
    human_judgment: false
  - id: D5
    description: "/curators renders the directory for an authenticated artist and redirects unauthenticated visitors to /signin; fetches server-side with the directory-safe projection; genre + platform searchParams filter the rendered list"
    requirement: "PITCH-01"
    verification:
      - kind: unit
        ref: "grep -q force-dynamic app/(artist)/curators/page.tsx; grep -Eq getUser|redirect app/(artist)/curators/page.tsx; grep -v '^\\s*//' 'app/(artist)/curators/page.tsx' | grep -Fc \"select('*')\" -> 0; npm run build (tail) -- no type errors, /curators and /admin/curators both listed as distinct routes"
        status: pass
    human_judgment: true
    rationale: "Full manual smoke (actually opening /curators in a browser as a signed-in artist, toggling filters, and confirming an unauthenticated redirect) was not exercised in this sandbox -- no live dev server / browser session available. Build-time route resolution, auth-gate code presence, and copy/behavior greps were verified automatically, but the live filter-toggle-then-server-refetch round trip needs a human session to confirm end-to-end."

# Metrics
duration: ~20min
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 03: Artist-Facing Curator Directory Summary

**`/curators` browse+filter directory (server component), authenticated-artist `GET /api/curators` with a 90-day response-rate join computed in app code, and the `CuratorCard`/`CuratorDirectory` display components reused later by the pitch composer's multi-select**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-02T01:37:00Z
- **Completed:** 2026-07-02T01:55:32Z
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 7 (5 created, 1 renamed, 1 doc modified)

## Accomplishments
- `lib/curators/response-rate.ts` exports `computeResponseRates()` -- aggregates `pitch_history` over the last 90 days in application code (no test framework in this project; mirrors `lib/vault/readiness.ts`'s aggregation style), returning a `Map<curatorId, percent>` that OMITS zero-pitch curators entirely (never a `0%` entry)
- `app/api/curators/route.ts` is authenticated-artist-only (401 when unauthenticated), uses an explicit directory-safe column projection (`select('*')` count is 0), never returns `email`/`claim_token`/the raw `claimed_by` UUID, validates `?platform=` against `PLATFORM_VALUES`, and filters `?genre=` via `.overlaps()`
- `components/curators/CuratorCard.tsx` renders name -> playlist/platform -> genre chips (max 3 + overflow) -> reach line -> status pills -> response-rate badge, with every locked hidden/never-zero display state from the UI-SPEC, plus a `selectable`/`disabled` mode ready for the 06-04 pitch composer to reuse
- `components/curators/CuratorDirectory.tsx` renders genre + platform filter chips (`aria-pressed`) that push URL searchParams for a server re-fetch (not client-side filtering), and the verbatim empty-state copy
- `app/(artist)/curators/page.tsx` fetches the directory server-side directly (no self-fetch of `/api/curators`), applies the same projection/filter/response-rate logic, and gates on `getUser()` + redirect

## Task Commits

Each task was committed atomically:

1. **Task 1: Response-rate helper + authenticated-artist directory GET API** - `089ecd6` (feat)
2. **Task 2: CuratorCard display component + CuratorDirectory client (filter bar + grid)** - `43a9bb7` (feat) -- also includes the blocking-issue route move (see Deviations)
3. **Task 3: /curators page server component (fetch + filter + render)** - `f98db29` (feat)

**Plan metadata:** committed alongside this SUMMARY (docs: complete plan)

## Files Created/Modified
- `lib/curators/response-rate.ts` - `computeResponseRates()`, `CuratorWithRate` type (as specified), `DirectoryCurator` type (actual directory-safe shape)
- `app/api/curators/route.ts` - GET handler: auth gate, directory-safe projection, genre/platform filters, response-rate join
- `components/curators/CuratorCard.tsx` - directory card with all locked display states
- `components/curators/CuratorDirectory.tsx` - filter bar + grid + empty state
- `app/(artist)/curators/page.tsx` - server component: auth gate, server-side fetch, Topbar + CuratorDirectory
- `app/(admin)/curators/page.tsx` -> `app/(admin)/admin/curators/page.tsx` - renamed to free the bare `/curators` path (see Deviations)
- `.planning/phases/06-playlist-curator-pitching/deferred-items.md` - updated to record the partial resolution of the pre-existing route-group mismatch

## Decisions Made
- Exported both `CuratorWithRate` (full `Curator & { response_rate }`, matching the plan's literal instruction) and a separate `DirectoryCurator` type from `lib/curators/response-rate.ts`. The actual GET route and page both return the narrower directory-safe projection (never `email`/`claim_token`/`baseline_genre_focus`/`submission_notes`, plus a `claimed` boolean instead of raw `claimed_by`), which is structurally incompatible with the full `Curator` type `CuratorWithRate` extends -- `DirectoryCurator` is the type actually consumed by the route, the page, and both components.
- Reach-signal formatting uses `Number.toLocaleString()` (e.g. "~12,345 followers/subscribers") rather than K/M-abbreviated notation -- satisfies the "formatted N" instruction in the plan's action text without introducing an additional rounding-display decision not specified in the UI-SPEC's literal copy contract (`"~{N} {followers/subscribers}"`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved the admin curators page off the bare `/curators` path to resolve a Next.js duplicate-route collision**
- **Found during:** Task 3 (verifying the build after scaffolding `app/(artist)/curators/page.tsx`)
- **Issue:** `app/(admin)/curators/page.tsx` was already silently resolving to the bare `/curators` URL (a pre-existing bug logged in `deferred-items.md` during 06-02: `(admin)` is a route group, so its pages serve at bare paths, not `/admin/*`). This plan's locked artifact is also `/curators` (artist-facing) -- both route-group folders resolving to the identical URL is a genuine Next.js build-breaking duplicate-route conflict, not a cosmetic issue. Confirmed via `npm run build` before the fix: only the admin page appeared at `/curators`; after adding the artist page, the build would fail outright.
- **Fix:** `git mv "app/(admin)/curators/page.tsx" "app/(admin)/admin/curators/page.tsx"` -- nests the page under a literal `admin/` segment inside the existing `(admin)` route group. It now resolves to `/admin/curators` (matching its own sidebar `href` exactly, a bonus partial fix of the pre-existing bug) while still inheriting `app/(admin)/layout.tsx`'s shared sidebar and auth gate unchanged. `Checklist Items` and `Tips` were left untouched -- fixing all three admin pages remains the dedicated follow-up documented in `deferred-items.md`.
- **Files modified:** `app/(admin)/curators/page.tsx` -> `app/(admin)/admin/curators/page.tsx` (rename), `.planning/phases/06-playlist-curator-pitching/deferred-items.md` (status update)
- **Verification:** `npm run build` lists `/curators` (artist) and `/admin/curators` (admin) as two distinct routes with no compile error.
- **Committed in:** `43a9bb7` (Task 2 commit -- the rename was staged automatically by `git mv` before the Task 2 files were added, and Task 2's build check was the point at which the collision was caught)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to ship this plan's locked `/curators` artifact at all; also incidentally repairs one of the three pre-existing broken admin sidebar links documented in 06-02's `deferred-items.md`. No scope creep beyond the single collision.

## Issues Encountered
None beyond the route collision documented above. `npm run build` compiled cleanly after every task with no manual dev server running in this sandbox, so the live browser smoke test (filter toggling, unauthenticated redirect) is deferred to human verification per coverage item D5.

## User Setup Required

None. This plan introduces no new environment variables or external service dependencies -- it reads exclusively from the `curators`/`pitch_history` tables and types already live from 06-01/06-02.

## Next Phase Readiness
- `CuratorCard` and `CuratorDirectory` are ready for 06-04's pitch composer to reuse in a compact multi-select mode (`selectable`/`disabled`/`disabledLabel`/`onToggle` props already support the "Already pitched · {status}" and "Unsubscribed" disabled states).
- `computeResponseRates()` and the directory-safe projection pattern in `app/api/curators/route.ts` are directly reusable by 06-04's curator selection and by any future curator-facing surface that needs the same 90-day formula.
- The `/curators` -> `/admin/curators` route collision is fully resolved for this plan's scope; no blockers remain for 06-04 (pitch composer) or 06-05 (curator claim portal).

---
*Phase: 06-playlist-curator-pitching*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: lib/curators/response-rate.ts
- FOUND: app/api/curators/route.ts
- FOUND: components/curators/CuratorCard.tsx
- FOUND: components/curators/CuratorDirectory.tsx
- FOUND: app/(artist)/curators/page.tsx
- FOUND: app/(admin)/admin/curators/page.tsx
- FOUND: commit 089ecd6 (feat(06-03): add curator response-rate helper and directory GET API)
- FOUND: commit 43a9bb7 (feat(06-03): add CuratorCard display component and CuratorDirectory filter bar)
- FOUND: commit f98db29 (feat(06-03): add /curators directory page server component)
