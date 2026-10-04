---
phase: 261004-wtl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/230_track_work_direct_link.sql
  - __tests__/migration-230-track-work-direct-link.test.ts
  - types/index.ts
  - lib/catalogue/track-work-link.ts
  - lib/catalogue/track-work-link.test.ts
  - .planning/todos/pending/2026-10-04-work-track-link-followups.md
autonomous: false
requirements: [QUICK-261004-WTL]
tags: [migration, rights, ai-provenance, song-passport, crate-eligibility]

must_haves:
  truths:
    - "tracks.work_id is a nullable FK to works(id), and it is writable ONLY by graduate_song_passport_to_release() (service_role) and this migration's own one-time backfill -- a direct authenticated-client INSERT or UPDATE naming work_id is rejected by a column-level REVOKE, not merely discouraged by app-code convention."
    - "Every track song_passport_release_links already names gets work_id backfilled from song_passports.work_id inside migration 230 itself; every track with no release_links row (every legacy upload, confirmed the only path to public.tracks until Song Passport graduation existed) is left NULL -- never guessed from title, project, or date."
    - "resolveTrackAiProvenance(null, ...) always returns status 'unresolved', for ANY input entries, including an empty list -- it is structurally impossible for a null work_id to reach 'clear' in this module (proven by test, not just by convention)."
    - "graduate_song_passport_to_release() writes tracks.work_id from the SAME v_work row it already loaded with FOR UPDATE and already validated (v_work.user_id = p_actor_user_id) at the top of the function, inside the SAME INSERT statement that creates the track -- no second read, no separate write, no window for drift, for any track graduated from this point forward."
    - "A disagreement between tracks.work_id and the song_passport_release_links chain (from a future bug, not from this function) is detectable by a single read-only query, documented in the migration's own header, that returns zero rows when healthy."
    - "The migration file is written and committed but NEVER pushed by the executor -- `supabase db push` is run only by the owner, after review."
  artifacts:
    - supabase/migrations/230_track_work_direct_link.sql
    - lib/catalogue/track-work-link.ts
  key_links:
    - "graduate_song_passport_to_release()'s tracks INSERT -> work_id = v_work.id, in the same statement that already writes metadata.source_work_version_id"
    - "migration 230 backfill UPDATE: tracks.id = song_passport_release_links.track_id -> song_passport_release_links.passport_id = song_passports.id -> song_passports.work_id"
    - "REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon -> only service_role (the graduation function) and the privileged migration connection can write it"
    - "lib/catalogue/track-work-link.ts's resolveTrackAiProvenance() -> lib/catalogue/ai-entries.ts's resolveCrateConsequence() -> the existing two-disqualifier Crate doctrine, reused rather than re-implemented"
---

<objective>
Add the direct, queryable link from a released track back to the Catalogue work that
produced it (`tracks.work_id`), per the owner's 2026-10-04 decision at
`.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` §10 (full
analysis at `.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`,
on a separate branch -- see `<context>` below for how to read it if your checkout does not
have it). The owner was shown the no-migration alternative (resolve the existing
Song-Passport chain backwards, live, at query time) and declined it, choosing this
permanent column instead.

Purpose: Funūn stores a song twice -- the writing side (`public.works`, migration 135)
carries AI-disclosure facts (`ai_entries`); the release side (`public.tracks`, migration
001) is what a sync submission licenses. The only existing bridge,
`works.graduated_project_id`, resolves to a PROJECT, which can hold several tracks, so
"which AI disclosure belongs to which released track" has no per-track answer on an EP.
That blocks the owner's decision that advancing a song into The Crate is rights-bearing:
the advance must enforce eligibility, and it cannot enforce what it cannot resolve per
track.

Output: an unpushed migration (`tracks.work_id`, a one-time backfill, and
`graduate_song_passport_to_release()` writing it atomically going forward), a pure
resolver module specifying exactly how a future reader must treat a null link, a
text-lock test for each, and a todo capturing the two items this link makes possible but
that this plan deliberately does not build.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.claude/CLAUDE.md

@supabase/migrations/135_works_core.sql
@supabase/migrations/154_song_passport_master_graduation.sql
@supabase/migrations/109_reconcile_tracks_sample_columns.sql
@supabase/migrations/084_stripe_connect_payouts.sql
@lib/catalogue/ai-entries.ts
@types/index.ts

A fuller analysis lives at `.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`,
authored on branch `work-track-eligibility-deliberation-2026-10-04` (not merged at plan
time -- it may not exist in your checkout; if it does not, run
`git show work-track-eligibility-deliberation-2026-10-04:.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`
to read it). The owner's decision itself lives at
`.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` §7, §9, §10 --
this file IS present on the branch this plan was written from; if your checkout differs,
fetch it the same way from branch `owner-decisions-2026-10-04`. Every fact this plan
depends on is restated in this PLAN.md directly, so neither file is required reading to
execute correctly -- they are background for anyone who wants the full reasoning.

**Verified facts this plan rests on (do not re-derive, do not assume beyond these):**

- `supabase/migrations/135_works_core.sql:99-121`'s "WHAT IS DELIBERATELY ABSENT" comment
  refuses exactly two things -- a reverse `works`→`split_sheets` pointer, and an
  artist-labels column. A work→track link is not named in it, and no other migration in
  the corpus considers and rejects one. This is an unaddressed gap, not a reversed
  decision.
- `song_passport_release_links` (migration 154) already carries
  `track_id → master_designation_id → work_version_id`, and separately
  `passport_id → song_passports.work_id` (`song_passports.work_id` is `NOT NULL UNIQUE`,
  `151_song_passport_foundation.sql:16`). It is append-only
  (`reject_song_passport_release_links_mutation` trigger, `154:68-70`) and is queried
  today only forwards (`lib/song-passport/repository.ts:32`).
- `graduate_song_passport_to_release()` (`154:199-313`) is the ONLY writer of
  `works.graduated_project_id` in the entire codebase, and it is already structured so
  that a work's SECOND graduation (after its master designation is superseded) inserts a
  SECOND track into the SAME project (`154:274-295`) -- proving the real cardinality is
  one work to MANY tracks, not one-to-one.
- `app/api/vault/[projectId]/tracks/route.ts` is the live legacy track-creation path. It
  never references `works` and its INSERT payload has no `work_id` key -- confirmed by
  reading the full route, not inferred.
- `public.tracks`' write RLS policy (`tracks_write_project_owner_or_editor`,
  `193_workspace_column_allowlist_rpcs.sql:159-178`) is `FOR ALL`, row-level only (keyed
  on project ownership/editor membership) -- it does not and cannot restrict which
  COLUMNS a permitted writer may set. Column-level privilege is the only mechanism that
  can close that gap, and this codebase already uses it once
  (`REVOKE SELECT (stripe_connect_account_id) ON public.user_profiles FROM authenticated, anon;`,
  `084_stripe_connect_payouts.sql:70`).
- No `DELETE` handler exists for `works/[workId]` anywhere in `app/api/works/`. The only
  `works.delete()` call in the codebase (`app/api/works/route.ts:141`) is a same-request
  creation rollback that fires before a work has members, a split sheet, or anything else
  -- a graduated work cannot be deleted through any shipped surface today.
- Migration 229 (`229_team_tier_leads.sql`) is claimed by the concurrent quick task
  `261004-ttq`, authored in its own worktree (`.claude/worktrees/ttq-261004/`), not yet
  merged to `main` as of this plan. 230 was free in the main checkout and in every
  `.claude/worktrees/*/supabase/migrations/` directory at planning time. Re-verify before
  writing (Task 1) and again before pushing (Task 4) -- parallel sessions are active.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration 230 -- the column, the lockdown, the backfill, the atomic write</name>
  <files>supabase/migrations/230_track_work_direct_link.sql, __tests__/migration-230-track-work-direct-link.test.ts, types/index.ts</files>
  <action>
Before writing anything, re-run the migration-number check: `ls supabase/migrations/ |
sort -t_ -k1 -n | tail -5` against the main checkout, and the same against every
`.claude/worktrees/*/supabase/migrations/` directory present right now. If anything
numbered 230 or higher already exists anywhere, use the next free number instead and
carry that number through every file/reference below (including the test file name and
this plan's own `files_modified` list in a note in your SUMMARY).

Create `supabase/migrations/230_track_work_direct_link.sql` (HUMAN-GATED -- this project
never runs `supabase db push` from an agent; restate that explicitly in the file's header,
matching the convention every prior migration header uses, e.g. 135's or 229's). Give the
header a plain-language section explaining why this migration exists (the EP ambiguity:
`works.graduated_project_id` resolves to a project, which can hold several tracks, so
per-track AI-provenance cannot be resolved today), a section stating this does not reverse
migration 135's "deliberately absent" comment (cite the verified fact above, with line
numbers), and a section restating the three owner constraints verbatim in your own words:
null means "we do not know", written in the same transaction as graduation from the same
facts as the chain, and the backfill is partial and must say so.

Body, in this order:

1. `ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS work_id` as a nullable `UUID`
   `REFERENCES public.works(id) ON DELETE SET NULL` (matching `works.graduated_project_id`'s
   own `ON DELETE SET NULL` direction at `135:84` -- deleting the composition must never
   corrupt the release that came from it, even though that path is not reachable today per
   the verified fact above). Follow with `CREATE INDEX IF NOT EXISTS idx_tracks_work_id ON
   public.tracks (work_id);` and a `COMMENT ON COLUMN public.tracks.work_id IS '...'`
   stating plainly that NULL means "we do not know" and must never be read as "no work" or
   "no AI-provenance disqualifier", that it is written exactly twice (this migration's
   backfill, and `graduate_song_passport_to_release()` going forward), and that the
   column-level REVOKE below is what enforces that, not app-code discipline alone. In your
   own header comment, justify the column's DIRECTION (on `tracks`, not a
   `works.graduated_track_id`) explicitly from the verified one-work-to-many-tracks fact
   above: a singular column on `works` could only ever name one track, silently losing
   every earlier graduation's track the moment a work graduates a second time.
2. Immediately lock the write path: `REVOKE INSERT (work_id), UPDATE (work_id) ON
   public.tracks FROM authenticated, anon;` -- cite the verified RLS fact above (row-level
   only, cannot restrict columns) and the `084` precedent for the same mechanism, applied
   to `UPDATE`/`INSERT` here instead of `SELECT`. Explain in a comment exactly what this
   prevents: an artist pointing their own track at an unrelated work (including one they do
   not own -- the FK only checks existence) to fabricate AI-provenance eligibility for a
   decision that licenses the master.
3. The backfill: one `UPDATE public.tracks t SET work_id = sp.work_id FROM
   public.song_passport_release_links link JOIN public.song_passports sp ON sp.id =
   link.passport_id WHERE t.id = link.track_id AND t.work_id IS NULL;` -- a single hop from
   `song_passport_release_links.track_id`/`passport_id` to `song_passports.work_id`,
   nothing re-derived. Comment that it is idempotent (`t.work_id IS NULL` guard), that it is
   keyed by `track_id` so a project holding several tracks only some of which trace to a
   work is handled correctly by construction (the untouched siblings simply have no
   `song_passport_release_links` row), and that every legacy-upload track is left NULL on
   purpose, never guessed.
4. `CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release(...)`: read
   `supabase/migrations/154_song_passport_master_graduation.sql` lines 199-318 in full (the
   function signature, body, and its trailing `REVOKE EXECUTE`/`GRANT EXECUTE` pair) and
   reproduce it VERBATIM in this migration, with exactly two surgical textual changes and no
   others: (a) append `, work_id` to the end of the `INSERT INTO public.tracks (...)` column
   list, immediately after `metadata`; (b) append `, v_work.id` to the end of the matching
   `VALUES (...)` list, immediately after the closing parenthesis of the
   `jsonb_build_object(...)` call. Do not alter any identifier, condition, comment, or the
   `REVOKE EXECUTE`/`GRANT EXECUTE` statements (reissue them exactly as 154 has them --
   `service_role` only, matching the established "restate the grant posture after every
   replace" convention this codebase already uses for `green_room_can_view_post` and
   others). In your own comment immediately above the function, state why this one-line
   change satisfies the atomicity constraint: `v_work` is already loaded with `FOR UPDATE`
   and already validated (`v_work.user_id = p_actor_user_id`) before the function reaches
   this INSERT, so reusing `v_work.id` here is not a new read and cannot introduce a window
   for drift.
5. End with a header-comment block titled "DETECTING DRIFT" containing the read-only
   verification query (a `SELECT` joining `tracks`, `song_passport_release_links`, and
   `song_passports`, comparing `t.work_id` against `sp.work_id` via `IS DISTINCT FROM`,
   that returns zero rows when healthy) -- explain that it can only ever find a bug, never
   a legitimate disagreement, because both the chain and the column are now written from
   the same `v_work` inside the same statement for every future graduation. Close with
   `NOTIFY pgrst, 'reload schema';`.

Create `__tests__/migration-230-track-work-direct-link.test.ts` following the exact
text-lock convention of `__tests__/migration-154.test.ts` and
`__tests__/migration-226-track-metadata-atomic-merge.test.ts` (read both for the pattern):
read the raw SQL file with `fs.readFileSync`, and assert (via `toContain`/`toMatch`, no
negative assertions needed) that it: adds `work_id` as a nullable FK with `ON DELETE SET
NULL`; creates the index; contains the two column-level `REVOKE` clauses for `work_id`;
contains the backfill `UPDATE` joining `song_passport_release_links` and
`song_passports`, guarded by `work_id IS NULL`; contains `CREATE OR REPLACE FUNCTION
public.graduate_song_passport_to_release`; contains the INSERT's column list ending in
`metadata, work_id` and the VALUES list ending in the `jsonb_build_object(...)` call
followed by `v_work.id`; contains the restated `REVOKE EXECUTE`/`GRANT EXECUTE TO
service_role` pair; and ends with the `NOTIFY pgrst` call.

Finally, edit `types/index.ts`'s `Track` type (around line 549) to add `work_id: string |
null` immediately after the `metadata` field, with a one-line comment matching this
plan's null-means-unknown framing.
  </action>
  <verify>
    <automated>npm test -- --runInBand __tests__/migration-230-track-work-direct-link.test.ts</automated>
  </verify>
  <done>Migration 230 exists, unpushed, text-locked by its test; types/index.ts's Track type carries work_id.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The read path -- resolveTrackAiProvenance(), null-safe by construction</name>
  <files>lib/catalogue/track-work-link.ts, lib/catalogue/track-work-link.test.ts</files>
  <behavior>
    - A null `workId` input returns `{ status: 'unresolved' }` for ANY `aiEntries` array,
      including an empty one -- there must be no code path by which a null workId reaches
      `'clear'`.
    - A resolved `workId` with zero `aiEntries` returns `{ status: 'clear' }`.
    - A resolved `workId` whose entries are all eligible under
      `resolveCrateConsequence()` (e.g. a generated instrument, or a performed vocal with
      a human source) returns `'clear'`.
    - A resolved `workId` with at least one disqualifying entry (a wholly generated
      `'full'` master, or a performed vocal with NO human source) returns
      `{ status: 'disqualified', reasons: [...] }`, even when eligible entries are also
      present -- any single disqualifier disqualifies the whole verdict.
    - Every disqualifying entry's reason is collected, not just the first one found.
  </behavior>
  <action>
Create `lib/catalogue/track-work-link.ts` as a pure module (no Supabase client, no
framework import, no I/O -- same posture as `lib/catalogue/ai-entries.ts`, which this
module imports `resolveCrateConsequence` and the `AiEntryInput`/`CrateConsequence` types
from). Export a `TrackAiProvenanceVerdict` discriminated union with three members:
`{ status: 'unresolved'; reason: string }`, `{ status: 'clear' }`, and
`{ status: 'disqualified'; reasons: string[] }`. Export `resolveTrackAiProvenance(workId:
string | null, aiEntries: AiEntryInput[]): TrackAiProvenanceVerdict` implementing exactly
the behavior above: a falsy `workId` short-circuits to `'unresolved'` before any entry is
inspected; otherwise map every entry through `resolveCrateConsequence()`, filter to the
ones where `eligible` is false, and return `'clear'` when that filtered list is empty or
`'disqualified'` with every filtered entry's `reason` otherwise.

Give the module a header comment specifying the READ PATH a future caller must follow,
concretely: first resolve `tracks.work_id` with a plain `SELECT work_id FROM tracks WHERE
id = :trackId`; if that value is null, call this function with `workId: null` and it
returns `'unresolved'` without the caller ever needing to query `ai_entries` at all; if
present, fetch that work's `ai_entries` rows (at minimum every `level = 'work'` row; a
caller that also has the graduated master's `work_version_id` on hand may additionally
scope `level = 'version'` rows to it, but passing EVERY version-level row for the work
when that identifier is unavailable is the safe direction, since it can only ever surface
MORE disqualifiers, never fewer) and map each to an `AiEntryInput` before calling this
function. State explicitly that no code in this module fetches anything itself -- that
responsibility, and the RLS/ownership gating that comes with it, belongs to whichever
future caller wires this in (none does yet; see this plan's Task 3).

Create `lib/catalogue/track-work-link.test.ts` (relative import from `./track-work-link`
and `./ai-entries`, matching `lib/catalogue/ai-entries.test.ts`'s own colocated-test
convention) covering every case in `<behavior>` above, written RED-first: commit the test
file with the module exporting only type stubs that make every assertion fail, confirm
the failure, then implement the function and confirm green.
  </action>
  <verify>
    <automated>npm test -- --runInBand lib/catalogue/track-work-link.test.ts</automated>
  </verify>
  <done>resolveTrackAiProvenance exists, is pure, and its test proves a null workId can never produce 'clear'.</done>
</task>

<task type="auto">
  <name>Task 3: Record what this link makes possible but does not build</name>
  <files>.planning/todos/pending/2026-10-04-work-track-link-followups.md</files>
  <action>
Create a todo file matching this repo's existing format (read
`.planning/todos/pending/2026-10-03-ipi-check-digit-validation.md` for the convention:
captured date, status, owner framing where relevant, plain sections, a "Related" list).
Title it "Follow-ups the direct work→track link makes possible". Capture status "open,
not blocking". Write two numbered sections:

1. Wiring `resolveTrackAiProvenance()` into an actual admit decision. Name the real call
   site (`app/api/sync-library/admin/[listingId]/route.ts`'s admit path, alongside the
   existing `GateSignal`/`evaluateInclusionGate()` check) and state plainly that whether an
   `'unresolved'` verdict should block admit, surface a non-blocking "check by hand" note
   to staff, or do something else entirely is a product decision the owner has not made --
   the owner's decision only established that "cannot determine" must never read as
   "clean", not what the admit route does with that state. This plan deliberately stops at
   building the resolver, not wiring it, because that policy call is undecided.
2. `lib/song-passport/legacy.ts`'s `legacyFactsForWork()` and its caller
   (`app/api/works/[workId]/passport/discovery/route.ts:143-150`) enumerate every track in
   a work's `graduated_project_id` project, which can include tracks unrelated to that
   work once a project holds more than one work's output. State that the deliberation
   confirmed this is read-only, owner-only, display-only tooling that nothing downstream
   treats as authoritative -- not a live bug -- and that `tracks.work_id` now makes an
   exact fix possible (filter `project.tracks` to `work_id = workId`) but that fix was left
   out of this plan's scope deliberately, since the decided scope was the schema link only.

Link both deliberation documents and `supabase/migrations/230_track_work_direct_link.sql`
and `lib/catalogue/track-work-link.ts` in a closing "Related" section.
  </action>
  <verify>
    <automated>test -f .planning/todos/pending/2026-10-04-work-track-link-followups.md && echo exists</automated>
  </verify>
  <done>The todo file exists, naming both deferred items and exactly why each was left out.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Full Verification Gate, commit, PR, and the owner's migration push</name>
  <what-built>
    An unpushed migration (`tracks.work_id`, locked down, backfilled, and written
    atomically by `graduate_song_passport_to_release()` going forward); a pure, tested
    resolver (`resolveTrackAiProvenance()`) specifying the null-safe read path for a future
    caller; and a todo naming the two things this link enables but does not itself build.
  </what-built>
  <action>
Run the full CI `validate` sequence from `.claude/CLAUDE.md`'s Verification Gate, in exact
order: `npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`
(zero warnings), `npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`,
`npm run audit:gate`. Do NOT run `npm run build` (a dev server may be live on :3000) and do
NOT run `supabase db push` at any point -- that is the owner's step, below, never the
executor's. Before staging, run `git status --porcelain` and list any pre-existing
unrelated modifications or untracked files in the SUMMARY (parallel worktrees are active)
-- never `git add -A`; stage only this plan's exact file list by name. Commit on a new
branch, push, and open a PR against `main` (protected; direct pushes are rejected). Then
pause for the checkpoint below.
  </action>
  <how-to-verify>
    1. Confirm the migration has NOT been applied yet -- a direct check against the
       production database (`\d tracks` via the Supabase SQL editor or CLI, or an
       equivalent read-only inspection) should show no `work_id` column. It must stay
       owner-gated.
    2. Review `supabase/migrations/230_track_work_direct_link.sql` (or its re-verified
       number, if Task 1 had to rename it) and, if approved, run `supabase db push`
       yourself -- never the executor -- against the project's Supabase instance.
    3. After pushing, run the drift-detection query from the migration's own "DETECTING
       DRIFT" header comment. Zero rows is healthy.
    4. After pushing, run `SELECT COUNT(*) FILTER (WHERE work_id IS NOT NULL) AS linked,
       COUNT(*) FILTER (WHERE work_id IS NULL) AS unresolved FROM public.tracks;` and
       record the actual counts -- this plan could not determine them in advance (no
       production database access from the planning session), and the backfill's real
       coverage should be known rather than estimated.
    5. Optionally, as a sanity check on the column-level REVOKE: attempt a direct
       authenticated-client `UPDATE tracks SET work_id = '<any-uuid>' WHERE id = '<a track
       you own>'` (e.g. via the Supabase client in a browser console, signed in as a real
       artist account) and confirm it is rejected with a permission error, not silently
       accepted.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| authenticated client -> `public.tracks` | Any project owner/editor already has row-level write access to their own tracks via RLS (`tracks_write_project_owner_or_editor`); column-level privilege is the only thing that can additionally restrict WHICH columns that access covers. |
| `service_role` SQL function -> `public.tracks`/`public.works` | `graduate_song_passport_to_release()` runs `SECURITY DEFINER` as its definer (`service_role`-granted), already gated on actor/work ownership inside its own unchanged body. |
| privileged migration connection -> `public.tracks` | The one-time backfill `UPDATE` runs under the connection that applies migrations (the owner's `supabase db push`), outside RLS and outside the `authenticated`/`anon` grants entirely. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|------------------|
| T-wtl-01 | Tampering | `tracks.work_id` direct client write | high | mitigate | Column-level `REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon` in migration 230. RLS on `tracks` is row-level only and would otherwise let any project editor point their own track at an arbitrary work (including one they do not own -- the FK only checks existence), fabricating AI-provenance eligibility for a decision that licenses the master. |
| T-wtl-02 | Tampering / Repudiation | `tracks.work_id` vs. `song_passport_release_links` (drift) | medium | mitigate | T-wtl-01's REVOKE plus `song_passport_release_links`'s existing append-only trigger (migration 154) make drift structurally unreachable for any track graduated going forward. The read-only cross-check query documented in migration 230's own header lets the owner verify zero drift at any time, starting immediately after push. |
| T-wtl-03 | Information Disclosure | `tracks.work_id` SELECT exposure | low | accept | `tracks`' existing SELECT policy (`tracks_select_project_owner_or_member`) already scopes row visibility to the track's own project members; `work_id` is a bare UUID a non-member could not dereference (the referenced `works` row's own RLS blocks them), and no new SELECT grant is added by this migration. |
| T-wtl-04 | Tampering | Future caller of `resolveTrackAiProvenance()` supplying fabricated `ai_entries` | low | accept | Out of scope for this plan -- no caller is wired yet (Task 3's todo names this explicitly). Whichever route eventually calls it is responsible for fetching `ai_entries` itself under that table's own existing RLS/ownership policies (migration 136), not this pure module. |
| T-wtl-SC | Tampering | npm/pip/cargo installs | n/a | mitigate | No new dependency is introduced by this plan (verify: `package.json`/`package-lock.json` untouched) -- the Package Legitimacy Gate does not apply. |
</threat_model>

<verification>
Run the full Verification Gate from `.claude/CLAUDE.md` (Task 4 is where this happens for
real, but any task's own changes should pass it incrementally):

1. `npm run security:migrations:verify`
2. `npm run typecheck:strict`
3. `npm run lint`
4. `npm test -- --runInBand`
5. `npm audit --omit=dev --audit-level=moderate`
6. `npm run audit:gate`

Do NOT run `npm run build` (a dev server may be live on :3000) and do NOT run `supabase db
push` at any point in this plan's execution -- the migration file is a deliverable for the
owner to review and push, not something any task here applies.

Re-verify the migration number is still free immediately before Task 1 writes the file,
and again immediately before Task 4's checkpoint: `ls supabase/migrations/ | sort -t_ -k1
-n | tail -5`, and the same glob against every `.claude/worktrees/*/supabase/migrations/`
directory present. If 230 (or whatever number Task 1 ended up using) has been claimed by
another session since, rename the file and every reference to its number before
proceeding.
</verification>

<success_criteria>
- `supabase/migrations/230_track_work_direct_link.sql` (or its re-verified number) exists,
  is never edited after this plan's own commit, and is never pushed by any task here.
- `__tests__/migration-230-track-work-direct-link.test.ts` passes and text-locks the
  column, the column-level REVOKE, the backfill, the replaced function's two surgical
  changes, the restated grant posture, and the schema-cache reload.
- `types/index.ts`'s `Track` type includes `work_id: string | null`.
- `lib/catalogue/track-work-link.ts` exports `resolveTrackAiProvenance()`; its test proves
  by assertion (not just by reading the code) that a null `workId` can never reach
  `'clear'`.
- `.planning/todos/pending/2026-10-04-work-track-link-followups.md` exists, naming both
  deferred items and why each was left out of this plan's scope.
- Full Verification Gate (6 commands) passes.
- No npm dependency added; `package.json`/`package-lock.json` untouched.
- A PR against `main` exists, and the owner has been told explicitly which file to review
  and push themselves.
</success_criteria>

<output>
Create `.planning/quick/261004-wtl-work-track-direct-link/261004-wtl-SUMMARY.md` when done
</output>
