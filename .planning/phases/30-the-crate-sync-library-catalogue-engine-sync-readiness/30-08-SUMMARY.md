---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 08
subsystem: api
tags: [next.js, supabase, typescript, jest, buyer-catalogue, sync-library, staff-access]

# Dependency graph
requires:
  - phase: 30-07
    provides: enriched CatalogCard (real artist/mood/energy/vocal/instruments/rights) on live rows — 30-08 attaches staff layers on top of this real data
  - phase: 30-01
    provides: syncReadinessForTrack()/missingSyncItems() (lib/sync-library/readiness.ts) and rightsBadge() (lib/sync-library/gate.ts) — the readiness/rights authorities this plan's staff layer reuses
  - phase: 30-03
    provides: sync_listings.staff_notes column (migration 107) — the staff-only "artist notes" data source
provides:
  - "loadCatalogPage(staffMode) — attaches a per-card staff object (readinessStatus/rightsDetail/artistNotes/inProgress) via one extra batched sync_listings query, ONLY when a server-resolved staffMode is passed"
  - "CatalogRow.staff + CatalogBrowserLight staffMode prop — the SAME component renders an additional light-theme staff panel per row when both are present, byte-identical buyer render otherwise"
  - "app/sync/catalog/page.tsx resolves staffMode via getStaffRole(user) and threads it through to both loadCatalogPage and CatalogBrowserLight"
affects: [31 (AE workspace / Selects) — will build on this same staff-layered Crate surface]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-aware surface via an optional prop + optional field, never a forked component (RESEARCH Pattern 5) — the buyer render path is unchanged when staffMode is absent, proven by curl smoke test showing zero rendered .staffpanel elements on the anon path"
    - "One additional batched query gated by a server-resolved role, attached only when needed (mirrors the existing admittedRows/ownerRows/termsRows batching discipline already in loadCatalogPage)"
    - "Staff chrome scoped entirely to .fnbl light tokens — no .fncon references inside a light-themed component (Pitfall 4)"

key-files:
  created: []
  modified:
    - lib/deals/catalog-query.ts
    - components/buyer/CatalogBrowserLight.tsx
    - app/sync/catalog/page.tsx

key-decisions:
  - "staffMode is typed as the canonical StaffRole ('leadership' | 'ae' | 'bd' | 'anr') from lib/admin/staff-role.ts, not a locally re-declared 'leadership' | 'ae' | null literal — avoids a second, drifting role vocabulary (the codebase's D-01 single-authority discipline) and means every staff role (not just leadership/ae) sees the layered Crate, matching 30-CONTEXT.md's broader 'team members' language. Sync Library CURATION access (leadership-only admit/reject) is unaffected — this is Crate VIEWING only."
  - "readinessStatus derivation: 'admitted' only when the representative track's own sync_listings row is literally admitted; otherwise syncReadinessForTrack() decides 'needs_completion' (something missing) vs 'pending_admit' (checklist clear, not yet admitted). This does not replicate evaluateInclusionGate()'s quality_ok signal — quality_ok was deliberately left out of this plan's batched columns (task scope: status + track_id + staff_notes only), so readinessStatus is a metadata/rights-adjacent display signal, not the authoritative gate verdict."
  - "The staff-only sync_listings batch query fetches ALL statuses (not just 'admitted') for the page's project ids — a second, separate query from the existing admittedRows query, run ONLY when staffMode is set. Kept as two queries rather than widening the buyer-facing admittedRows query so the buyer-gate query semantics stay untouched."
  - "The staff object is zipped onto CatalogRow by id in page.tsx rather than widening mapCardsToLightRows' signature (catalog-sample.ts is not in this plan's files_modified) — mapCardsToLightRows keeps its existing CatalogCard[] contract untouched."
  - "PROJECT_COLUMNS' tracks select gained isrc/iswc (two columns) — required for syncReadinessForTrack's isrc_codes/pro_registration/mlc_registration checks; harmless to the buyer output since CatalogCard never exposes these fields."

patterns-established:
  - "A CatalogCardWithStaff = CatalogCard & { staff?: CatalogStaffLayer } local intersection type in catalog-query.ts, rather than modifying the shared CatalogCard type in lib/deals/catalog.ts (not in this plan's files_modified) — keeps the staff-only shape scoped to the query layer that produces it."

requirements-completed: [CRATE-07, CRATE-08]

coverage:
  - id: D1
    description: "loadCatalogPage(staffMode=null) — the default — produces byte-identical CatalogCard output to before this plan; no extra sync_listings query runs, no card carries .staff"
    requirement: "CRATE-07"
    verification:
      - kind: unit
        ref: "lib/deals/catalog-query.test.ts (existing suite, unmodified — 134 tests still green against the widened return type)"
        status: pass
      - kind: manual_procedural
        ref: "curl http://localhost:3000/sync/catalog (anon/no-cookie request) — 200 OK; grep confirms zero `class=\"staffpanel\"` elements rendered (only the CSS rule text is present, injected unconditionally as part of the component's <style> block)"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadCatalogPage(staffMode='leadership'|'ae'|'bd'|'anr') attaches a staff object per card — readinessStatus/rightsDetail/artistNotes/inProgress — via one additional batched sync_listings query scoped to the page's project ids"
    requirement: "CRATE-07"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (type-level proof the staff object assembly compiles against syncReadinessForTrack's SyncReadinessInput and the CatalogStaffLayer union)"
        status: pass
      - kind: manual_procedural
        ref: "No live staff session/DB with sync_listings rows was reachable in this sandbox (no .env.local access, consistent with prior 30-03..30-07 executor findings) — the staff-attachment code path itself was not exercised against a real logged-in staff session or seeded sync_listings data"
        status: pending
    human_judgment: true
    rationale: "A logged-in STAFF session is not available in this sandbox (flagged explicitly in the task prompt). tsc proves the staff-layer assembly type-checks correctly against syncReadinessForTrack/missingSyncItems/rightsBadge's real signatures, and the existing catalog-query.test.ts integration suite proves the staffMode=null default path is unaffected. A human with a real leadership/ae/bd/anr staff session and at least one project with a mix of admitted + in-progress sync_listings rows should visit /sync/catalog and confirm: the staff panel renders with correct readiness/rights/notes/in-progress values, and a buyer session on the same URL sees none of it."
  - id: D3
    description: "CatalogBrowserLight renders an additional .staffpanel per row ONLY when staffMode is set AND the row carries .staff, using exclusively .fnbl light tokens; the buyer .trow markup is completely untouched (wrapped in a Fragment, not restructured)"
    requirement: "CRATE-08"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit; grep '.fncon' components/buyer/CatalogBrowserLight.tsx — only appears inside code comments explaining the prohibition, never in an actual CSS rule"
        status: pass
      - kind: manual_procedural
        ref: "curl http://localhost:3000/sync/catalog — confirmed 9 .trow rows render, 0 .staffpanel divs render (anon/staffMode-absent path)"
        status: pass
    human_judgment: true
    rationale: "Visual confirmation that the staff panel reads correctly (contrast, layout, badge legibility) against the light Crate surface needs a human eyeball with a real staff session — the automated checks here prove absence-when-absent and token-scoping correctness, not visual polish."
  - id: D4
    description: "app/sync/catalog/page.tsx resolves staffMode via getStaffRole(user) server-side only; a pure staff account (no buyer_members row) bypasses the /sync/access redirect; a buyer session's staffMode stays null and the code path is unchanged from before this plan"
    requirement: "CRATE-08"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: manual_procedural
        ref: "curl (anon, no session) confirms the unauthenticated branch is untouched (200, isPublic render, no staff markup)"
        status: pass
    human_judgment: true
    rationale: "The buyer-member and staff-member branches (both requiring a real session) could not be exercised end-to-end in this sandbox — only the code path's type-correctness and the always-reachable anonymous branch were verified. A human should confirm both a real buyer session (clean storefront, unchanged) and a real staff session (layered Crate) on /sync/catalog, and confirm a buyer cannot force staff layers via any URL/query param (there is no client-input path to staffMode by construction — getStaffRole reads only the server session's app_metadata)."

# Metrics
duration: ~35min
completed: 2026-08-13
status: complete
---

# Phase 30 Plan 08: Role-Aware Crate — Staff Layers on the Same /sync/catalog Surface Summary

**The Crate stays ONE component and ONE surface: `loadCatalogPage`/`CatalogBrowserLight`/`app/sync/catalog/page.tsx` now optionally attach and render a server-resolved staff-only layer (rights detail, readiness status, artist notes, in-progress) for logged-in team members, while buyers keep the exact clean storefront they had before this plan.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 3 (`lib/deals/catalog-query.ts`, `components/buyer/CatalogBrowserLight.tsx`, `app/sync/catalog/page.tsx`) — exactly the plan's declared `files_modified`, no others touched

## Accomplishments
- `loadCatalogPage` (`lib/deals/catalog-query.ts`) gained an optional `staffMode: StaffRole | null = null` parameter. When set, ONE additional batched `sync_listings` query (all statuses, scoped to the page's project ids — a second, separate query from the existing `admittedRows` admission check) resolves a per-project listing map, and each card in the buyer-gate loop optionally gets a `staff` object: `readinessStatus` (derived from `syncReadinessForTrack`/`missingSyncItems`, 30-01, composed with the representative track's own listing status), `rightsDetail` (a human summary of the SAME `stage3` already computed for the `isRightsReady` gate), `artistNotes` (`sync_listings.staff_notes`, migration 107), and `inProgress` (a non-admitted/non-terminal listing exists elsewhere in the project, T-30-12). `PROJECT_COLUMNS`' tracks select gained `isrc`/`iswc` — required inputs for `syncReadinessForTrack`'s ISRC/PRO/MLC checks. Buyer/anon calls (`staffMode` absent) run zero extra queries and produce byte-identical `CatalogCard`s.
- `CatalogBrowserLight` (`components/buyer/CatalogBrowserLight.tsx`) gained `CatalogRow.staff` (optional) and a `staffMode` prop (`StaffRole | null`). Row rendering was wrapped in a `Fragment` so a new, purely additive `.staffpanel` block can render as a sibling below a row — `.trow`'s own markup is completely untouched, so there is no risk of buyer-path drift. The panel (readiness label, rights detail, artist notes, an "Other tracks in progress" badge) is styled with ONLY `.fnbl` light-theme CSS custom properties (`--wash`, `--line-2`, `--ink`, `--ink-2`, `--part-fg/bg/line`) — no `.fncon` dark-token references anywhere in the file.
- `app/sync/catalog/page.tsx` resolves `staffRole` via `getStaffRole(user)` — the same authority `app/(admin)/admin/sync-library/page.tsx` uses — immediately after loading the session, before any membership check. A pure staff account (staff but not a `buyer_members` row) now bypasses the `/sync/access` redirect and sees the layered Crate on the exact same URL a buyer would use; the staff object is zipped from `loadCatalogPage`'s result onto each `CatalogRow` by id. A buyer or logged-out visitor's code path is unchanged — `staffRole` is `null`, no staff data is fetched or rendered.

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side staff-layer resolution in loadCatalogPage** - `d97b6f7` (feat)
2. **Task 2: Optional staff layers in CatalogBrowserLight (staffMode prop, light-theme chrome)** - `32d6fb9` (feat)
3. **Task 3: Resolve staffMode server-side on /sync/catalog** - `57e9dd7` (feat)

_No plan-metadata commit was made — this session was instructed to skip `gsd-tools state.*`/`roadmap.*` updates (STATE.md stale) and not touch `main`._

## Files Created/Modified
- `lib/deals/catalog-query.ts` — `loadCatalogPage` gained the `staffMode` param, the `CatalogStaffLayer` type, the staff-batch query, and the per-card staff-attachment block; `PROJECT_COLUMNS` tracks select gained `isrc`/`iswc`.
- `components/buyer/CatalogBrowserLight.tsx` — `CatalogRow.staff`, the `staffMode` prop, the `READINESS_STATUS_LABEL` map, the `Fragment`-wrapped row render + additive `.staffpanel` block, and the light-theme-only `.staffpanel`/`.sp-badge` CSS rules.
- `app/sync/catalog/page.tsx` — resolves `staffRole` via `getStaffRole(user)`, widens the `/sync/access` redirect condition to `!member && !staffRole`, passes `staffRole` into `loadCatalogPage` and `staffMode` into `CatalogBrowserLight`, and zips the staff object onto each row by id.

## Decisions Made
- Used the canonical `StaffRole` union (`lib/admin/staff-role.ts`: `'leadership' | 'ae' | 'bd' | 'anr'`) for `staffMode` everywhere, rather than the plan text's illustrative `'leadership' | 'ae' | null` literal — this avoids introducing a second, locally-drifting role vocabulary and means every staff role (not only leadership/ae) can view the layered Crate, consistent with 30-CONTEXT.md's "team members see the same surface with staff-only layers" (a viewing permission, distinct from Sync Library curation access which stays leadership-gated elsewhere).
- `readinessStatus` is a display-only signal derived from `syncReadinessForTrack`/`missingSyncItems` plus the listing's own status — it deliberately does NOT replicate `evaluateInclusionGate`'s `quality_ok` input (that column was out of this plan's declared batch-query scope: `status + track_id + staff_notes` only, per the task's `<action>`). The authoritative admit/reject gate verdict still lives in the existing quality-review route (30-04/30-06), not here.
- Kept the staff-layer `sync_listings` query separate from the existing buyer-facing `admittedRows` query rather than widening the latter — the buyer admission-gate query's semantics (status = 'admitted' only) stay exactly as they were before this plan.
- Zipped the staff object onto rows inside `page.tsx` (by id, via a `Map`) instead of widening `mapCardsToLightRows`' signature in `lib/deals/catalog-sample.ts`, since that file is not in this plan's `files_modified`.

## Deviations from Plan

**1. [Discretion, not Rule 1-4] `staffMode` typed as the full `StaffRole` union instead of the plan's literal `'leadership' | 'ae' | null` example.**
- **Found during:** Task 2 (writing the `CatalogBrowserLight` prop signature) and Task 1 (the `loadCatalogPage` parameter).
- **Why:** 30-RESEARCH.md's own Pattern 5 code example uses the narrower literal, but the codebase's single-authority discipline (D-01, and the "Don't Hand-Roll" table's explicit warning against a second role vocabulary) argues for reusing `lib/admin/staff-role.ts`'s real `StaffRole` type rather than re-declaring a parallel, narrower one that could drift. 30-CONTEXT.md's decision text ("team members see the same surface with staff-only layers") is role-set-agnostic — it does not say only leadership/ae may VIEW the layered Crate (that restriction applies specifically to Sync Library CURATION actions, a different feature).
- **Files modified:** `lib/deals/catalog-query.ts`, `components/buyer/CatalogBrowserLight.tsx`, `app/sync/catalog/page.tsx`.
- **Commits:** `d97b6f7`, `32d6fb9`, `57e9dd7`.

No Rule 1/2/3/4 auto-fixes were needed — the plan's task actions were otherwise implemented as written.

## Issues Encountered
- **No live staff session reachable in this sandbox.** Per the task prompt's explicit instruction, a logged-in STAFF session is not available here. `tsc --noEmit` is clean across all three files, the existing `lib/deals/catalog-query.test.ts` integration suite (134 tests, unmodified) stays green against the widened `loadCatalogPage` signature, and `curl` against the running dev server confirms the always-reachable anonymous/buyer path renders cleanly with zero `.staffpanel` elements. The staff-attachment code path itself (a real `leadership`/`ae`/`bd`/`anr` session viewing `/sync/catalog` with seeded `sync_listings` rows in mixed states) was NOT exercised end-to-end — flagged as `D2`/`D3`/`D4` (`human_judgment: true`) above.
- **`.env.local` unreachable**, consistent with prior 30-03 through 30-07 executor findings in this project — no direct Supabase network round-trip was possible from this sandbox.

## User Setup Required
None — no external service configuration required. No new packages, no migrations (this plan reads `sync_listings.staff_notes` etc., all columns already live per migrations 107/108/109).

## Next for a human staff-session pass (flagged per the task prompt)
1. Log in as a `leadership`, `ae`, `bd`, or `anr` staff account and visit `/sync/catalog`.
2. Confirm the layered Crate renders: each admitted-and-visible row shows a `.staffpanel` beneath it with a readiness label, a rights-documents-signed summary, any `staff_notes` text, and an "Other tracks in progress" badge when applicable.
3. Confirm a buyer session on the exact same URL sees the clean storefront with no staff panel anywhere, and that there is no URL/query-param way to force staff layers (there is none by construction — `staffMode` only ever comes from `getStaffRole(session_user)`).
4. Seed at least one project with a mix of an admitted track and a separate in-progress (`applied`/`pending_admit`) listing to confirm `inProgress` and the `needs_completion`/`pending_admit`/`admitted` readiness states all render distinctly.
5. Confirm a pure staff account (staff role but no `buyer_members` row) reaches `/sync/catalog` directly instead of being redirected to `/sync/access` — and note that such an account currently renders inside the `embedded` branch without `BuyerTopNav` (the `app/sync/layout.tsx` nav only mounts for an actual buyer-org member); this is a minor nav-chrome gap, not a data-correctness issue, and was left out of this plan's scope (`app/sync/layout.tsx` is not in `files_modified`).
- `.claude/launch.json` was left untouched per this session's explicit instructions (pre-existing local modification unrelated to this plan).

---
*Phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

All 3 modified source files + this SUMMARY.md verified present on disk; all 3 task commit hashes (`d97b6f7`, `32d6fb9`, `57e9dd7`) verified present in `git log`.
