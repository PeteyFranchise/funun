---
phase: 261005-pta
plan: 01
type: execute
wave: 1
depends_on: []
branch: fix-per-track-admission-gate
files_modified:
  - lib/deals/catalog-query.ts
  - lib/deals/catalog-query.test.ts
  - lib/deals/request-target.ts
  - lib/deals/request-target.test.ts
  - app/api/buyer/requests/route.ts
  - app/api/admin/deals/route.ts
  - .planning/todos/pending/261005-pta-production-admission-audit.md
  - .planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md
autonomous: true
requirements: [QUICK-261005-PTA]

must_haves:
  truths:
    - "A buyer browsing /sync/catalog (or /api/buyer/catalog) who opens a mixed-admission project's card (one admitted track, one never-reviewed sibling) sees ONLY the admitted track in that card's track list -- the unadmitted sibling never appears there, in /api/admin/selects/catalog's search hits, or in the public /selects/[token] page's Suggested Songs widget, because all three render directly from CatalogCard.tracks (lib/deals/catalog-query.ts) with zero code changes of their own."
    - "POST /api/buyer/requests rejects a request naming the unadmitted sibling's track id (400, 'not available for license requests on this project') because authorizeRequestTarget's returned project.tracks no longer contains it -- and the identical rejection applies to POST /api/admin/deals (staff manual intake, app/api/admin/deals/route.ts:197) and to the track-selection chips rendered by components/buyer/RequestComposer.tsx:110 (reached via app/sync/requests/new/page.tsx), since all three consume authorizeRequestTarget's return value verbatim."
    - "The project itself stays visible and requestable -- isAdmittedToSyncLibrary (lib/deals/catalog.ts:34-36) and isRightsReady are untouched; only the per-track list each caller receives narrows to admitted tracks."
    - "Every production sync_listings row has a real, non-null track_id (migration 096:32, NOT NULL + ON DELETE CASCADE from tracks), so a project that passes the project-level admission check can never resolve to zero admitted tracks -- catalog-query.ts's pre-existing 'no admitted track id resolves' fallback comment (lines ~370-375) describes a structurally unreachable case, confirmed by schema, not a live risk this fix could turn into an empty-tracks card."
    - "lib/deals/catalog.ts's isAdmittedToSyncLibrary is not redefined a third time -- both fixes resolve a fresh per-track sync_listings existence check and still hand the boolean to that one pure predicate, the same pattern lib/selects/persistence.ts's isTrackAdmittedToSyncLibrary (PR #148) already established for the Selects write path."
  artifacts:
    - lib/deals/catalog-query.ts — loadCatalogPage's CatalogCard.tracks is built from the already-computed admittedTracks (per-track, per-project), not the full tracks array
    - lib/deals/request-target.ts — authorizeRequestTarget resolves admittedTrackIds via a sync_listings.vault_project_id+status='admitted' query and filters RequestTargetProject.tracks to that set before returning
    - lib/deals/catalog-query.test.ts — new test proving a mixed-admission project stays visible but lists only its admitted track
    - lib/deals/request-target.test.ts — new test proving authorizeRequestTarget excludes an unadmitted sibling from project.tracks
    - .planning/todos/pending/261005-pta-production-admission-audit.md — two read-only SQL queries for the owner (no DB credentials reachable from this session)
  key_links:
    - "lib/deals/catalog-query.ts's admittedTrackIdsByProject (already computed since 2026-09-10 for the representative-track display pick) now also gates card.tracks -> consumed verbatim by components/buyer/CatalogBrowser.tsx:254, app/api/admin/selects/catalog/route.ts:66, app/selects/[token]/page.tsx:176 (public Suggested Songs), and lib/deals/catalog-sample.ts's mapCardsToLightRows -- four downstream exposures fixed from one change."
    - "lib/deals/request-target.ts's new admittedTrackIds set gates the returned project.tracks -> consumed verbatim by app/api/buyer/requests/route.ts:90, app/api/admin/deals/route.ts:197, and app/sync/requests/new/page.tsx -> components/buyer/RequestComposer.tsx:110's track-chip picker -- four call sites fixed from one change."
    - "lib/selects/persistence.ts's isTrackAdmittedToSyncLibrary (PR #148, not exported) is the precedent pattern, not a reusable import -- it answers the SAME question for a single track id inside the Selects write path. This plan replicates its shape (fresh per-track sync_listings lookup -> isAdmittedToSyncLibrary) at the two call sites #148 did not touch, rather than exporting and sharing the private helper, because catalog-query.ts needs a BATCHED multi-project form (already has one: admittedTrackIdsByProject) and request-target.ts needs a single-project, multi-track form -- two different I/O shapes around the one pure predicate, matching this codebase's existing divide between the per-page batch query and the per-row persistence helper."
---

<objective>
Close C-01 (`.planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md`): a buyer can see and create a license request for a track that no Funūn staff member ever admitted, as long as a sibling track in the same project has been admitted. Admission is decided per TRACK (`sync_listings.track_id`, migration 096); catalogue visibility (`lib/deals/catalog-query.ts`) and request authorization (`lib/deals/request-target.ts`) currently decide per PROJECT (any admitted row anywhere in the project satisfies `isAdmittedToSyncLibrary`), so an admitted Track A exposes and makes requestable a never-reviewed Track B.

Purpose: this is a rights/money defect, not a cosmetic one -- a `license_requests` row can already be created today naming a track nobody cleared. PR #148 (2026-10-04) closed the identical shape of gap on the Selects write path (`addSelectsTrack`) by resolving admission per track there; this plan closes the two call sites #148 explicitly did not touch -- catalogue visibility and request authorization -- using the same reused predicate (`isAdmittedToSyncLibrary`, `lib/deals/catalog.ts:34-36`), never a second admission definition.

Output: `lib/deals/catalog-query.ts` and `lib/deals/request-target.ts` each resolve and apply a per-track admission filter before returning track data to any caller; both ship with a failing-first test that proves a mixed-admission project (one admitted track, one never-reviewed sibling) keeps the project visible/requestable while excluding the sibling specifically; a todo carries the two read-only production-audit queries this session cannot run itself.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./.claude/CLAUDE.md
@.planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md
@lib/deals/catalog.ts
@lib/deals/catalog-query.ts
@lib/deals/request-target.ts
@lib/deals/catalog-query.test.ts
@lib/deals/request-target.test.ts
@app/api/buyer/requests/route.ts
@app/api/admin/deals/route.ts
@lib/selects/persistence.ts
@app/api/sync-library/submit/route.ts
@supabase/migrations/096_sync_library.sql

## Verified facts this plan rests on (file:line) -- re-checked this session, not assumed from the brief

| Claim | Status | Evidence |
|---|---|---|
| `isAdmittedToSyncLibrary` collapses admission to a project-level boolean at its call sites | TRUE, but the pure function itself is correct | `lib/deals/catalog.ts:34-36` just returns `project.has_admitted_sync_listing === true` -- a fail-closed boolean check, not the collapse. The collapse is in how CALLERS resolve that boolean: `catalog-query.ts:313` (`admittedProjectIds.has(project.id)`, true if ANY row in the project is admitted) and `request-target.ts:94-103` (an existence query with no track_id filter). Neither this plan nor its fix touches `catalog.ts`. |
| `catalog-query.ts` evaluates `isRightsReady` once per project and the resulting card lists every project track | TRUE | `catalog-query.ts:313` (`hasAdmittedSyncListing`), `:339-345` (`isRightsReady(...)` gate, once per project), `:399` (`tracks: tracks.map(t => ({ id: t.id, title: t.title, bpm: t.bpm, keySignature: t.key_signature }))` -- `tracks` is `project.tracks ?? []`, every track, not `admittedTracks`). |
| `request-target.ts` checks only project-level admission, and the route checks only project membership | TRUE | `request-target.ts:94-103` (one existence query, no `track_id` filter, `.limit(1).maybeSingle()`); `:137-143` returns `tracks: (project.tracks ?? []).map(...)`, every project track. `app/api/buyer/requests/route.ts:90` (`validTrackIds = new Set(target.project.tracks.map(t => t.id))`) and `:92` (`trackIds.some(id => !validTrackIds.has(id))`) check membership in that unfiltered set only -- never a track's own admission. |
| `app/api/admin/deals/route.ts` has the IDENTICAL gap, via the SAME shared function | TRUE, not named in the original brief | `app/api/admin/deals/route.ts:189` calls `authorizeRequestTarget`, `:197` builds `validTrackIds` the same way, `:201` has the byte-identical error string. Fixing `authorizeRequestTarget` fixes this route too, with zero changes to its file beyond the shared error-message wording (see below). |
| `sync_listings` is already per-track in the data model, not per-project | TRUE | `supabase/migrations/096_sync_library.sql:32` -- `track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE`. `:63-65`'s partial unique index is `ON sync_listings (track_id)`, not `vault_project_id`. A null or dangling `track_id` is impossible: NOT NULL plus cascade-delete from `tracks`. |
| A whole-project submission creates ONE `sync_listings` row PER track, never one row for the whole project | TRUE | `app/api/sync-library/submit/route.ts:134-140` -- `toInsert.map(trackId => ({ vault_project_id: projectId, track_id: trackId, ... }))`, one row per id in the batch (cap 50, line 19). No legitimate flow writes a single project-wide listing, so a per-track admission check cannot hide a track that staff genuinely admitted as part of a batch -- every batched track gets its own row and its own staff admit/reject decision later. |
| PR #148 does NOT already fix this; it fixed a different call site with the same shape | TRUE | `gh pr view 148` body: scope is explicitly "`addSelectsTrack` performed a straight insert ... zero query against `sync_listings`" and states `loadCatalogPage`/`authorizeRequestTarget` "resolve it **per project**" as the existing (unfixed) baseline it is NOT changing. Its helper `isTrackAdmittedToSyncLibrary` (`lib/selects/persistence.ts:204-213`) is a private, unexported async function scoped to one track id, delegating to `isAdmittedToSyncLibrary` -- the pattern to replicate, not a function this plan can import. |
| `catalog-query.ts` already computes per-track admission data, just doesn't apply it to `card.tracks` | TRUE, and the precise bug | `catalog-query.ts:200-219` batches `sync_listings` (`vault_project_id, track_id`) and builds `admittedTrackIdsByProject: Map<string, Set<string>>`; `:376-377` already derives `admittedTracks = tracks.filter(t => admittedTrackIds.has(t.id))` for picking the DISPLAY representative track (dated 2026-09-10, predating #148). Line 399's `tracks:` field simply doesn't use that same `admittedTracks` variable -- the fix is a one-line substitution, not new I/O. |
| No existing test in either file asserts on `card.tracks` / `project.tracks` contents | TRUE | `grep -n "\.tracks\b"` over `lib/deals/catalog-query.test.ts` matches only an unrelated fixture assertion (line 236, checks the raw `projectRow()` input, not a `result.data[...].tracks` output). No existing assertion will break; the new tests are additive. |
| This session cannot query production directly | TRUE | Reading `.env.local` was denied by the sandbox permission system. `supabase projects list` returned `LegacyProjectsListUnexpectedStatusError: Missing required permission(s): projects_read` for the locally cached CLI token. No safe path to run even a read-only query exists from here -- the two audit queries go to the owner as a todo, per this task's explicit instruction. |
| The readiness-aggregation compounding issue is real but out of scope here | TRUE, scoped out deliberately | `lib/vault/readiness.ts:190-192` -- `case 'audio_files': status = tracks.length > 0 ? 'complete' : 'missing'` (project-level: any track's audio makes the item complete, not "every requested track has audio"). This feeds the SIX-item entry gate (`isSyncEntryComplete`) that is a PREREQUISITE for admission eligibility, not the admission decision itself, and fixing it means changing `readinessItemsForProject`'s inputs -- which is "touching the admission gate," explicitly forbidden by this task's constraints. Filed as a separate followup todo, not built here. |

No migration is required: `sync_listings.track_id`/`status` already exist and are already queried this exact way by three other call sites (`catalog-query.ts`, `lib/selects/persistence.ts`, the submit route). This plan only adds read queries and narrows return shapes.

The current branch (`pass-5-rights-review`) carries unrelated uncommitted changes (nav/header files) from other work -- do not touch, stage, or commit them. This plan's branch (`fix-per-track-admission-gate`) should be cut from `main`, not from the dirty working branch.
</context>

<source_audit>

| Source | Item | Coverage |
|---|---|---|
| THE DEFECT | catalog.ts/catalog-query.ts/request-target.ts/buyer-requests-route collapse admission to project level | COVERED -- Task 1 (catalog-query.ts) + Task 2 (request-target.ts); `catalog.ts` is deliberately untouched (the collapse is at call sites, not in the pure predicate) |
| VERIFY #1 | Does the buyer requests route really perform no per-track check? | COVERED -- Context's verified-facts table, confirmed TRUE |
| VERIFY #2 | Can `sync_listings` hold a row per track? | COVERED -- confirmed TRUE, schema-verified, no migration needed |
| VERIFY #3 | Does any legitimate behaviour depend on the project-level collapse? | COVERED -- confirmed NO; submission writes one row per track, never one row per project |
| VERIFY #4 | Does #148 already resolve this; is its predicate reusable? | COVERED -- confirmed NO (different call sites) and NOT directly importable (private, single-track-scoped); its PATTERN is replicated at both new sites |
| SHAPE OF FIX | Resolve admission per track wherever exposed/requested, reuse the single admission authority | COVERED -- both tasks delegate to `isAdmittedToSyncLibrary`, no second definition |
| SHAPE OF FIX | The request route must not be missed | COVERED -- Task 2, plus the two additional call sites (`admin/deals`, composer page) discovered to share the same function |
| SHAPE OF FIX | Say what a mixed project shows | COVERED -- `must_haves.truths` #1-3, and Task 1/2 actions state it explicitly |
| OWNER DECISION | Count live rows hidden by the fix, or supply the query | COVERED -- Task 3 files the two read-only queries as an owner todo; this session has no DB access (verified-facts table) |
| CONSTRAINT | A test that fails without the fix is mandatory, proving the mixed-project case | COVERED -- Task 1 and Task 2 each add exactly this test |
| CONSTRAINT | No migration unless genuinely required | COVERED -- none created; verified-facts table states why |
| CONSTRAINT | Do not change what "admitted" means or touch the admission gate | COVERED -- `isAdmittedToSyncLibrary`/`isRightsReady` untouched; readiness-aggregation issue explicitly deferred (separate todo, Task 3) |
| CONSTRAINT | Full Verification Gate; sixth command is `npm run audit:gate`; never `npm run build` | COVERED -- Task 3 |
| CONSTRAINT | Never `git add -A` | COVERED -- Task 3 names exact files |
| DISCOVERED (not in original brief) | `app/api/admin/deals/route.ts` has the identical gap via the same shared function | COVERED -- Task 2 fixes it as a byproduct, wording-only direct edit |
| DISCOVERED | Buyer-visible exposure also reaches `CatalogBrowser.tsx`, the staff Selects-catalog search, and the public Suggested Songs widget | COVERED -- all three fixed by Task 1 with zero code changes of their own (documented in `key_links`) |
| DISCOVERED | Readiness aggregation is project-level, compounding the defect | NOTED, explicitly out of scope -- Task 3 files a followup todo rather than fixing it here (would require touching the admission gate's inputs) |

No gaps.

</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scope CatalogCard.tracks to admitted tracks only (the "listed" half of C-01)</name>
  <files>lib/deals/catalog-query.ts, lib/deals/catalog-query.test.ts</files>
  <behavior>
    - A project with one admitted track and one never-reviewed sibling: `loadCatalogPage` still returns one card for the project (admission at the project level is unchanged), but that card's `tracks` array contains ONLY the admitted track -- the sibling is absent.
    - A project where every track is admitted: `tracks` is unchanged (every track still appears) -- this is the existing, already-passing behavior and must not regress.
    - The representative-track display fields (mood/energy/vocal/instruments) are unaffected -- they already resolve from `admittedTracks`, not the full list.
  </behavior>
  <action>
In `lib/deals/catalog-query.ts`, locate the card-construction block (the `const card: CatalogCardWithStaff = { ... }` literal, currently ending with `tracks: tracks.map(t => ({ id: t.id, title: t.title, bpm: t.bpm, keySignature: t.key_signature })),`). `admittedTracks` is already computed two statements earlier (`const admittedTracks = tracks.filter(t => admittedTrackIds.has(t.id))`, used today only to pick `representativeTrack`). Change the `tracks:` field's source array from `tracks` to `admittedTracks` -- same `.map` shape, same output fields, only the source array changes. Do not touch `admittedTrackIds`, `admittedTrackIdsByProject`, `representativeTrack`, or anything upstream of this literal.

Add a short comment directly above the changed `tracks:` line explaining why: admission is song-level (26-06), so the card buyers/staff see must never imply a track is licensable just because a project sibling is admitted (C-01, `.planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md`). Name, in that comment, the downstream consumers that inherit this fix with no code change of their own: `components/buyer/CatalogBrowser.tsx`'s card renderer, `app/api/admin/selects/catalog/route.ts`'s staff search (whose own header comment already claims "nothing not-admitted can be searched here at all" -- that claim becomes true only after this change, worth noting so a future reader does not mistake the prior comment for a fix), `app/selects/[token]/page.tsx`'s public Suggested Songs widget, and `lib/deals/catalog-sample.ts`'s `mapCardsToLightRows`.

In `lib/deals/catalog-query.test.ts`, write the RED test first (confirm it fails against the pre-fix code, then apply the one-line fix above, then confirm it passes). Add a new test, in a section comment headed with this repo's dash-divider convention naming C-01, to the existing `describe('loadCatalogPage — the six-item entry gate, not the aggregate score', ...)` block or a new sibling `describe`: build a `projectRow()` override whose `tracks` array holds two entries -- reuse the existing `ENTRY_COMPLETE_TRACKS[0]` shape for `track-1`, and add a second object with `id: 'track-2'`, a distinct `title` (e.g. `'Unreviewed B-Side'`), and the same null/false defaults for every other field (`bpm`, `key_signature`, `metadata`, `writers`, `producers`, `mixing_engineer`, `mastering_engineer`, `has_sample`, `sample_details`, `isrc`, `iswc`). Call `makeService([project], [{ id: 'owner-1', profile_visibility: 'public' }], [{ id: 'proj-1', trackId: 'track-1' }])` -- the existing third-argument shape already supports naming exactly one admitted track per project; no helper changes needed. Call `loadCatalogPage(service as never, null, BASE_FILTER, 1)`. Assert `result.data` has length 1 (the project stays visible) AND `result.data[0].tracks.map(t => t.id)` equals `['track-1']` exactly (the sibling is absent, not merely de-prioritized).
  </action>
  <verify>
    <automated>npx jest lib/deals/catalog-query.test.ts</automated>
  </verify>
  <done>
    The new test fails against the pre-fix `tracks: tracks.map(...)` line (confirm this before editing), passes after the one-line substitution to `admittedTracks`, and every pre-existing test in the file still passes unmodified.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scope authorizeRequestTarget's returned tracks to admitted tracks only (the "requested" half of C-01)</name>
  <files>lib/deals/request-target.ts, lib/deals/request-target.test.ts, app/api/buyer/requests/route.ts, app/api/admin/deals/route.ts</files>
  <behavior>
    - A project with one admitted track and one never-reviewed sibling: `authorizeRequestTarget` still returns `ok: true` for the project (project-level admission, visibility, block, and Stage 3 checks are all unchanged), but `result.project.tracks` contains ONLY the admitted track.
    - A project with zero admitted tracks: unchanged behavior, `ok: false` (the existing "no admitted listing" test).
    - Stage 3 (`computeStage3`)'s `canContinue` check continues to run against the FULL `project.tracks` array (the artist's own release-readiness question, unrelated to which track a buyer may request) -- only the final returned `project.tracks` is filtered, never the input to `computeStage3`.
  </behavior>
  <action>
In `lib/deals/request-target.ts`, replace the admission-existence query (currently `const { data: admittedListing } = await service.from('sync_listings').select('id').eq('vault_project_id', project.id).eq('status', 'admitted').limit(1).maybeSingle()`, followed by the `isAdmittedToSyncLibrary({ has_admitted_sync_listing: admittedListing != null })` check) with a query selecting `track_id` instead of `id`, dropping `.limit(1).maybeSingle()` so it returns every admitted row for this project (mirrors `catalog-query.ts:200-207`'s existing batched-query shape, just scoped to one project instead of a page of them). Build `admittedTrackIds` as a `Set<string>` from the returned rows' `track_id` values. Keep the `isAdmittedToSyncLibrary({ has_admitted_sync_listing: admittedTrackIds.size > 0 })` call exactly as before, just fed from `admittedTrackIds.size > 0` instead of `admittedListing != null` -- the project-level admission decision itself is unchanged, only how the per-track ids get collected changes.

Leave the `computeStage3(project, project.tracks ?? [], project.vault_documents ?? [], project.vault_readiness_score)` call completely untouched -- it must keep receiving every track, because `canContinue` answers the artist's distribution-readiness question, not the buyer's per-track admission question (same separation `lib/deals/catalog.ts`'s `isRightsReady` header comment already documents for a different gate).

At the final `return { ok: true, project: { ... } }`, change `tracks: (project.tracks ?? []).map(t => ({ id: t.id, title: t.title }))` to filter by `admittedTrackIds` before mapping -- `(project.tracks ?? []).filter(t => admittedTrackIds.has(t.id)).map(t => ({ id: t.id, title: t.title }))`.

Update the function's header comment (the block starting "26-06: the admission check now delegates to...") to state plainly that the admission check AND the returned track list are now both resolved per track, not per project, and name the four call sites that inherit this with no further code change: `app/api/buyer/requests/route.ts`, `app/api/admin/deals/route.ts` (staff manual intake -- discovered during this fix to share the identical gap via this same function), `app/sync/requests/new/page.tsx` (via `components/buyer/RequestComposer.tsx`'s track-selection chips), and `app/api/buyer/shortlists/route.ts` (unaffected in practice -- it only reads the `ok` boolean, never `.tracks`, but still routes through the same gate).

In both `app/api/buyer/requests/route.ts` (the line reading `{ error: 'One or more selected tracks do not belong to this project.' }`) and `app/api/admin/deals/route.ts` (the byte-identical line), change the message to `'One or more selected tracks are not available for license requests on this project.'` -- the old wording asserts the track isn't part of the project, which is no longer true for the new rejection case (a track that DOES belong to the project but isn't individually admitted); the new wording is accurate for both the pre-existing case (wrong project) and the newly-caught case (right project, unadmitted track). No other logic in either route changes.

In `lib/deals/request-target.test.ts`, write the RED test first. The existing `tableBuilder(row)` helper only supports a chain ending in `.maybeSingle()` (used for the `vault_projects` and `user_profiles` branches) -- the new `sync_listings` query no longer calls `.limit()`/`.maybeSingle()`, so add a second helper (name it `arrayTableBuilder(rows: unknown[])`) whose `select`/`eq` methods return itself and which exposes a `.then(resolve)` method resolving `{ data: rows, error: null }` directly (mirrors `catalog-query.test.ts`'s own `tableBuilder` shape, which already does exactly this for its `sync_listings` branch). In `makeService`, replace the `admittedListing` option with `admittedTracks?: { track_id: string }[] | null`, defaulting to `[{ track_id: 'track-1' }]` (preserves every existing test's current pass/fail outcome, since the existing fixture's one track is `track-1`), and route the `sync_listings` table lookup through `arrayTableBuilder(admittedTracks ?? [])` instead of the old single-row `tableBuilder`. Update the existing "returns ok:false when the project has no admitted sync listing" test to pass `admittedTracks: []` instead of `admittedListing: null` -- same assertion, same outcome.

Add a new test: build `projectRow({ tracks: [{ id: 'track-1', title: 'Track One' }, { id: 'track-2', title: 'Unreviewed Track' }] })`, call `makeService({ project, admittedTracks: [{ track_id: 'track-1' }] })`, call `authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')`, assert `result.ok` is `true` and `result.project.tracks.map(t => t.id)` equals `['track-1']` exactly. State in a comment above this test that this is the shared authority both `POST /api/buyer/requests` and `POST /api/admin/deals` consume verbatim, so proving `track-2` is absent here proves neither route can build a license request naming it (both routes derive their `validTrackIds` directly from this return value, with no other admission check of their own).
  </action>
  <verify>
    <automated>npx jest lib/deals/request-target.test.ts</automated>
  </verify>
  <done>
    The new test fails against the pre-fix unfiltered `tracks:` mapping (confirm before editing), passes after the filter is added, every pre-existing test in the file still passes with the `admittedTracks` option substituted for `admittedListing`, and both route files' error strings read the new, accurate wording.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full Verification Gate, production-audit todo, readiness-aggregation followup todo, git staging</name>
  <files>.planning/todos/pending/261005-pta-production-admission-audit.md, .planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md</files>
  <action>
Run the full Verification Gate, in this exact order, and fix forward on any failure (never weaken a check to make it pass): `npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`, `npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`, `npm run audit:gate`. Do NOT run `npm run build`.

Write `.planning/todos/pending/261005-pta-production-admission-audit.md` recording, for the owner: this session could not query production (reading `.env.local` was denied by sandbox permissions; the locally cached `supabase` CLI token lacks the `projects_read` scope needed for any remote access path tried). Include, as literal runnable SQL in a fenced block, two read-only queries for the owner to run in the Supabase SQL editor against production: (1) a SELECT joining `tracks` to `sync_listings` that returns every track currently exposed/requestable only because a PROJECT sibling is admitted while the track itself has no admitted `sync_listings` row of its own (`EXISTS` a sibling admitted row on `t.project_id`, `NOT EXISTS` an admitted row on `t.id` via `sync_listings.track_id`) -- this is the exact set this fix stops exposing going forward; (2) a SELECT joining `license_request_tracks` to `license_requests` that returns every EXISTING license request already created (before this fix shipped) naming a track with no admitted `sync_listings` row of its own -- the literal, already-happened instances of C-01's worst-case harm, which this fix does NOT retroactively clean up (matches PR #148's own precedent of leaving existing violating rows alone and deferring that call to the owner). State plainly that production was described as currently having zero tracks, so both queries are expected to return zero rows, but that this must be CONFIRMED, not assumed, and ask the owner to paste the results back.

Write `.planning/todos/pending/261005-pta-readiness-aggregation-project-level-followup.md` recording the compounding issue named in the pass-5 review and confirmed during this plan's investigation: `lib/vault/readiness.ts:190-192`'s `audio_files` item is complete whenever `tracks.length > 0` (any track has audio) rather than when every track a buyer might request has its own audio; metadata/split/copyright signals feeding `readinessItemsForProject` are similarly computed across all fetched project tracks rather than per requested track. This is a separate, pre-existing gap in what makes a project eligible to enter the sync library at all (the entry gate `isSyncEntryComplete` consumes these project-level items) -- distinct from C-01's per-track exposure/request bug this plan fixes, and explicitly NOT touched here because fixing it means changing the admission gate's own inputs, which this plan's constraints forbid. Recommend a future deliberation/plan scoped to making `readinessItemsForProject`'s six entry items track-aware.

Stage only this plan's `files_modified` entries -- `lib/deals/catalog-query.ts`, `lib/deals/catalog-query.test.ts`, `lib/deals/request-target.ts`, `lib/deals/request-target.test.ts`, `app/api/buyer/requests/route.ts`, `app/api/admin/deals/route.ts`, and the two new todo files -- never `git add -A` (the current branch carries unrelated uncommitted nav/header changes from other work; do not touch them).
  </action>
  <verify>
    <automated>npm run typecheck:strict && npm run lint && npm test -- --runInBand</automated>
  </verify>
  <done>
    The full Verification Gate (security:migrations:verify, typecheck:strict, lint --max-warnings=0, test --runInBand, npm audit --omit=dev --audit-level=moderate, audit:gate) is green; both todo files exist under `.planning/todos/pending/`; `git status --porcelain` shows no file outside this plan's eight `files_modified` entries staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| buyer (authenticated, `buyer_members` row) -> catalogue read (`GET /api/buyer/catalog`, `/sync/catalog`) | Untrusted read access; must never surface a track staff never admitted. |
| buyer -> `POST /api/buyer/requests` | Untrusted write; the request payload's `track_ids` is attacker-controlled and must be validated server-side against the SAME admission authority the catalogue uses. |
| staff (AE/BD/leadership) -> `POST /api/admin/deals` (manual intake) and `GET /api/admin/selects/catalog` | Semi-trusted internal write/read, but still must not create a licence record or surface a search hit for an unadmitted track -- staff error is not a defense. |
| public, unauthenticated -> `/selects/[token]` Suggested Songs widget | Fully untrusted read of a shared link; must never suggest an unadmitted track to whoever holds the link. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|------------------|
| T-pta-01 | Information Disclosure | `CatalogCard.tracks` (`lib/deals/catalog-query.ts`), consumed by `CatalogBrowser.tsx`, `admin/selects/catalog/route.ts`, public `selects/[token]/page.tsx` Suggested Songs | high | mitigate | Task 1: `card.tracks` built from `admittedTracks` (per-track admission, already computed) instead of every project track. |
| T-pta-02 | Elevation of Privilege / Tampering | `authorizeRequestTarget`'s returned `project.tracks`, consumed by `POST /api/buyer/requests`, `POST /api/admin/deals`, the request composer | critical | mitigate | Task 2: `project.tracks` filtered to `admittedTrackIds` before return; both routes' validation (`validTrackIds`/`trackIds.some(...)`) is unchanged but now operates on the correct, narrowed set -- a persisted `license_requests`/`license_request_tracks` row naming an unadmitted track can no longer be created through either route. |
| T-pta-03 | Information Disclosure (compounding, pre-existing) | `readinessItemsForProject` / `audio_files` and related six-item entry-gate signals (`lib/vault/readiness.ts:190-192`) computed project-wide rather than per track | medium | accept | Deferred to a follow-on todo (Task 3) -- fixing it means changing the admission gate's own readiness inputs, which this plan's constraints explicitly forbid touching. The per-track checks this plan adds (T-pta-01/02) are the final gate regardless of this signal's accuracy, so no new exposure is introduced by deferring it. |
| T-pta-SC | Tampering | npm/pip/cargo installs | n/a | n/a | No package installs in this plan -- no new dependency, no migration. |

</threat_model>

<verification>
Each fix task (1, 2) carries its own RED-then-GREEN Jest test proving the exact mixed-admission scenario the deliberation describes. Task 3 runs the full six-command Verification Gate from CLAUDE.md. Production-impact verification (are any currently-live rows affected) is explicitly deferred to the owner via a todo, because this session has no path to query production (`.env.local` read denied by sandbox; `supabase` CLI token lacks `projects_read`).
</verification>

<success_criteria>
- A mixed-admission project (one admitted track, one never-reviewed sibling) stays visible in the buyer catalogue but lists only the admitted track, everywhere `CatalogCard.tracks` is consumed.
- The same project's unadmitted sibling cannot be named in a successful `POST /api/buyer/requests` or `POST /api/admin/deals` call, and does not appear as a selectable chip in the request composer.
- `isAdmittedToSyncLibrary` and `isRightsReady` are byte-for-byte unchanged; no second admission predicate is introduced.
- No migration is created.
- Both new tests fail against the pre-fix code and pass after the fix; every pre-existing test in both files still passes.
- Full Verification Gate green (security:migrations:verify, typecheck:strict, lint, test, npm audit, audit:gate); `npm run build` not run.
- Two todos filed: the production-row audit (with runnable SQL) and the readiness-aggregation followup, both explicitly out of this plan's scope.
- `git status --porcelain` shows no file outside this plan's eight `files_modified` entries staged; the unrelated uncommitted changes already on `pass-5-rights-review` are untouched.
</success_criteria>

<output>
Create `.planning/quick/261005-pta-per-track-admission/261005-pta-SUMMARY.md` when done.
</output>
