# Task 3 re-scope — the handoff warning was right about the risk and wrong about the fix

**Date:** 2026-10-11 · **Plan:** 50-05 Task 3 · **Status:** re-scoped, proceeding without an H-2 collision

## What the handoff said

> Task 3 is not a function swap. `catalog-query.ts:304` iterates PROJECTS and picks a
> representative track at `:386`, so the per-track pivot changes `loadCatalogPage` row
> CARDINALITY, hence pagination, filters and the buyer UI. Worse, `loadCatalogPage` has FOUR
> consumers and TWO ARE SELECTS — so changing its shape touches Selects surfaces WITHOUT editing
> any `lib/selects/` file. Consider merging Tasks 3 and 7 into one H-2-gated unit.

## What is actually true (verified 2026-10-11)

**The consumer count was low.** Five call expressions across four files, two of them Selects:

| call site | surface |
|---|---|
| `app/api/buyer/catalog/route.ts:50` | buyer API |
| `app/sync/catalog/page.tsx:58` and `:71` | buyer SSR (anon branch + member/staff branch) |
| `app/api/admin/selects/catalog/route.ts:62` | **Selects** — staff Crate-search pane |
| `app/selects/[token]/page.tsx:174` | **Selects** — public player's Suggested Songs |

**But both Selects consumers already flatten `card.tracks` into per-track rows**, and neither
reads project cardinality:

- `app/api/admin/selects/catalog/route.ts:65-81` — `for (const card of result.data) for (const
  track of card.tracks)`, emitting `SelectsCatalogTrackHit`. Its own header already says
  "flattened to TRACK-level rows since a Selects add operates on track_id, not project id".
- `app/selects/[token]/page.tsx:175-177` — the same nested loop into `SuggestedTrack`.

So the per-track correctness D-11 demands does **not** require changing row cardinality. It
requires two things, both inside `lib/deals/`:

1. decide inclusion from `trackExposure` **per track** instead of from a project-level readiness
   aggregate (the aggregate is the actual D-11 defect: `readinessItemsForProject` spans every
   track, so one incomplete sibling fails the list and `continue`s the whole project, hiding the
   admitted complete track);
2. make `card.tracks` the **exposed** track list rather than the merely-admitted one.

Both Selects flatteners then inherit correct per-track behaviour **with no edit to either file**.

## Decision

Task 3 proceeds as scoped, with cardinality preserved. Tasks 3 and 7 stay separable.

- **No H-2 collision to flag.** The named H-2 clusters are `admin/selects/page.tsx:60-70` (A) and
  `lib/selects/persistence.ts:47-79` (B); neither is touched. No file under `lib/selects/` or
  `app/selects/` is edited.
- **Task 7 remains genuinely blocked and genuinely necessary.** Its three `isRightsReady`
  expressions (`lib/selects/tracks-query.ts:163`, `lib/selects/ai-draft.ts:71` and `:154`) are
  reached by the Selects *reload* and *AI drafting* paths, which do not go through
  `loadCatalogPage` at all. They stay wrong until H-2 unblocks.
- **The deployment gate narrows but does not disappear.** Task 3 fixes the Selects *search* pane
  for free (it routes through `loadCatalogPage`), so the worst partial-model case the plan
  described — an AE unable to add a song the supervisor can already request — is resolved by Task 3
  alone. What remains partial is the rights-ready *ordering/badge* inside an existing Selects.

## Three things found while verifying, each of which would have shipped a defect

1. **`audio_file_url` is selected by none of the three query files** (`catalog-query.ts`,
   `shortlists.ts`, `request-target.ts`). `trackExposure` requires it. Omitting it fails CLOSED —
   every track reads `no_playable_master` and the catalogue goes empty — so it would not have been
   silent, but it had to be added to all three selects.
2. **Terminal listing rows accumulate.** `sync_listings_active_track_uniq`
   (`supabase/migrations/096_sync_library.sql:63`) is a PARTIAL unique index over the five active
   statuses only, and its comment states that re-submission after any terminal outcome is
   deliberately allowed. So a track may hold a withdrawn row from last month **and** an admitted
   row now. `trackExposure` ranks terminal first — correct for one row, wrong if the caller hands
   it history. The caller must resolve the **active** row and fall back to the latest terminal row
   only when no active row exists. Added as `resolveListingStatus` in the authority module so the
   precedence has one definition rather than three.
3. **`request-target.ts` refuses on `stage3.canContinue`** (`:138`), not on readiness coverage.
   That is the refusal D-11 removes there — it is a rights-document question, and D-11 says request
   intake may proceed while clearance is open.

## Consequence to state out loud

`trackClearance` treats null AI provenance as unresolved and never returns `rights_ready` for it.
Plan 50-02 has not landed, so `aiProvenance: null` is the only available argument today and **every
catalogue track will read `clearance_required` → the `req` "contact Funūn" badge** until 50-02
lands. That is honest rather than degraded — AI involvement genuinely is not established — it fails
closed, and it changes no exposure outcome. It is also invisible in practice: the catalogue is
empty (D-4).
