# Deliberation: the work ↔ track modelling gap for Crate eligibility

**Status:** DELIBERATION ONLY. No decision made here, no code or migration changed. The
owner decides which option (if any) to build.

**Why this exists:** `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md`
§6 named "the one real structural problem" blocking a safe "advance into The Crate" action:
per-track AI-provenance eligibility cannot be resolved today for a specific submitted track.
This document is the dedicated look at that gap, as requested, with the schema-history
question ("was a work↔track link deliberately refused?") settled first.

---

## 1. The "deliberately absent" comment — read in full, quoted verbatim

`supabase/migrations/135_works_core.sql:99-121` reads, verbatim:

> ```
> -- ─── WHAT IS DELIBERATELY ABSENT FROM public.works ───────────────────────
> -- Two columns a later reader will look for are missing on purpose. Both are
> -- resolved open questions from 37-RESEARCH.md, not oversights.
> --
> -- (a) NO REVERSE POINTER TO THE SPLIT SHEET. The researcher's Open Question
> -- 1 asked whether a work stores its sheet's id or the sheet stores its
> -- work's id. Resolved: the sheet side only, added in migration 137. It
> -- matches the direction migration 067 already established (a sheet points at
> -- its vault project and at its track, never the reverse), it avoids the FK
> -- cycle a bidirectional pair would create, and it turns work creation into
> -- one insert per row instead of insert-then-update-the-other-row. A work's
> -- living sheet is resolved by selecting from public.split_sheets where the
> -- work matches and status is 'draft' — an indexed lookup, exactly as cheap
> -- as a stored id.
> --
> -- (b) NO ARTIST-LABELS COLUMN. Open Question 2 asked whether the labels
> -- system (demo / beat / track / idea / instrumental / concept, plus custom)
> -- ships in 37.1. Resolved: DEFER to 37.2. A plain TEXT array is cheap to add
> -- later against a table that will still have very few rows, no backfill will
> -- ever be needed because the absence of a label is a legitimate state, and
> -- 37.1 ships no surface that would consume one — the volume view whose
> -- filters labels exist to power is itself deferred. Adding the column now
> -- would ship a schema commitment ahead of the design that uses it.
> ```

**Verdict: a work→track (or track→work) link is NOT among the things this comment
deliberately refuses.** The two refusals are (a) a reverse pointer from `works` to
`split_sheets`, and (b) an artist-facing labels column. Neither is the correspondence this
deliberation is about. The comment's scope is narrow and explicit — "two columns," named and
closed — not a general statement that `works` carries no outward pointers at all (it already
carries one: `graduated_project_id`, added two sections above this comment, `135:84`).

I searched the rest of the migration corpus for the same rhetorical pattern (`grep -l
"DELIBERATELY\|deliberately absent\|on purpose"` across `supabase/migrations/*.sql`) to check
whether some *other* migration refused a work↔track link elsewhere. Twenty-three files matched
the phrase; none of the ones touching `works`, `tracks`, `vault_projects`, or the Song Passport
tables (`137_split_sheets_work_link.sql`, `140_split_party_writer_designation.sql`,
`151`–`157_song_passport_*.sql`) frame a track correspondence as a considered-and-rejected
option. I read `135` and `154` in full (below) and `151` in full; none of them raises "should a
track point back at a work" as a question at all, let alone answers it no.

**So this is not a case of quietly reversing a prior decision.** The gap is a real absence, but
it is an *unaddressed* absence, not a *refused* one. That changes the shape of this
deliberation: none of the options below need to justify overturning anything. (Compare: if the
comment had said "no track pointer — a track is a release artifact, not a composition fact,
and the two must stay decoupled," every option here would need to answer that argument before
anything else. It didn't say that.)

---

## 2. What a work and a track actually are, and the real cardinalities

### Definitions, with evidence

- **`works`** (`135_works_core.sql:77-87`) is the composition entity from Phase 37 ("The
  Songwriter"). Per its own header comment (`135:50-54`): *"A work is a SONG, not a release. It
  carries no release date, no distributor, no ISRC, no readiness score, and nothing else from
  the vault_projects world."* One row per song-in-progress, owned by `user_id`.
- **`vault_projects`** (`001_initial_schema.sql:81-99`) is, per its own header comment, *"An
  artist's full discography — singles, snippets, EPs, albums, unreleased"* — *"THE CENTRAL
  ENTITY"* of Wave 1. `type` is a closed enum: `single, snippet, ep, album, unreleased`
  (`001:85-87`).
- **`tracks`** (`001_initial_schema.sql:115-137`) belongs to exactly one `vault_projects` row via
  `project_id UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL` (`001:117`), with no
  upper bound on how many tracks one project may have.

Confirmed: a work is the song-as-composition; a `vault_project` is the release container; a
track is one recorded, releasable audio file inside that container. This matches the task's
framing exactly.

### Cardinalities, with evidence

**Project → tracks: one-to-many, unconstrained.** `tracks.project_id` is a plain FK with no
uniqueness constraint and no cap. `app/api/vault/[projectId]/tracks/route.ts:54-64` lets an
artist add an arbitrary number of tracks to any project they own, with auto-incrementing
`track_number` — this is the ordinary EP/album upload path, and it never touches `works` at
all: no `work_id` column exists on `tracks` anywhere in the schema (confirmed — grepped every
`ALTER TABLE tracks`/`ALTER TABLE public.tracks` across all 228 migrations;
`005_stage3_additions.sql`, `006_metadata_studio.sql`, and `109_reconcile_tracks_sample_columns.sql`
add `has_sample`, `sample_details`, `iswc`, `language` — never a work pointer).

**Work → project: zero-or-one in practice, unenforced in schema.** `works.graduated_project_id`
(`135:84`) is a nullable FK to `vault_projects`, `ON DELETE SET NULL`, with **no UNIQUE
constraint**. I grepped every occurrence of `graduated_project_id` across the codebase
(migrations and app code) and found exactly one writer: `graduate_song_passport_to_release()`
in `154_song_passport_master_graduation.sql:199-313` (detailed in §3). Every other hit is a
read (`app/api/works/[workId]/passport/discovery/route.ts:116,143,147`;
`lib/song-passport/repository.ts:103,109-110`), an audit trigger that only logs the change
(`172_audit_integrity_hardening.sql:12,27`), or an unrelated custody-claim lookup
(`220_master_ownership_claims.sql`). Because that one writer always issues a *fresh* project
the first time a work graduates (§3), nothing in the current system ever points two different
works' `graduated_project_id` at the same project — but the schema does not forbid it, and
nothing would catch it if a future code path did.

**Net cardinality today:** a `vault_project` may hold tracks that trace to zero works (the
ordinary Wave-1 upload path — most EPs/albums today, almost certainly including whatever
`sync_listings` rows already exist, since nothing in the graduation flow creates a
`sync_listings` row), or tracks that trace to exactly one work each (the Song Passport
graduation path, §3). No code path today produces a project holding tracks from *several
different* works, but the schema permits it and a manual add-track-to-a-graduated-project call
would silently produce exactly that shape.

---

## 3. What graduation is, and whether it is 1:1 in practice

**Every write** to `works.graduated_project_id` happens inside one function:
`public.graduate_song_passport_to_release()` (`154_song_passport_master_graduation.sql:199-313`),
`SECURITY DEFINER`, callable only by `service_role` (`154:315-318`). Walking it:

1. Loads the work via its passport, and requires `v_work.user_id = p_actor_user_id`
   (`154:222-229`) — only the song's owner may graduate it (consistent with migration 136's
   note at `136:176-178` that graduation is meant to be an administer-only door).
2. Loads the named master designation (`154:231-235`).
3. **Idempotency check:** if a `song_passport_release_links` row already exists for this
   `(passport_id, master_designation_id)` pair, returns the existing `(vault_project_id,
   track_id)` unchanged (`154:237-244`) — repeat calls never duplicate.
4. **If the work has never graduated** (`graduated_project_id IS NULL`): inserts a **brand
   new** `vault_projects` row, always `type = 'single'` (`154:266-271`), and sets
   `works.graduated_project_id` to it (`154:273`). There is no parameter letting the caller
   target an *existing* project — no EP/album assembly path exists here.
5. **If the work has already graduated:** reuses `v_work.graduated_project_id`, re-verifying
   the project is still owned by the same actor (`154:274-279`), and inserts **another** track
   into that same project with `track_number = MAX(track_number)+1` (`154:281-295,286`) — this
   is how a *second* master designation (e.g., after superseding the first) for the *same work*
   gets its own new track in its own existing project.
6. Inserts the correspondence row into `song_passport_release_links` (`154:297-309`, see §4)
   and, redundantly, into the new track's own `metadata` JSONB:
   `{song_passport_id, song_passport_snapshot_id, master_designation_id, source_work_version_id}`
   (`154:289-294`).

**So: yes, 1:1 in practice, by construction of the only call site — but only within this one
path.** Every ungraduated work gets its own dedicated, freshly-created `single`-type project the
first time it graduates; it is never folded into an existing release. A work's graduated
project is never shared with another work's graduated project (nothing does that today), and
a project is never pre-populated before a work is dropped into it by this function. The 1:1-ness
is a property of what the one caller happens to do, not a constraint the database enforces —
and it coexists with a completely separate, parallel track-creation path (`vault/[projectId]/tracks`,
§2) that is still fully live and *does* produce genuine multi-track, multi-origin projects with
zero connection to any work.

---

## 4. `song_passport_master_designations` and `song_passport_release_links` — does the
correspondence already exist?

**Yes, for this one path — and it is stronger than the task's framing suggested.** Two tables
in `154_song_passport_master_graduation.sql` already carry it, enforced by real foreign keys,
append-only:

- **`song_passport_master_designations`** (`154:20-36`): `work_version_id UUID NOT NULL
  REFERENCES public.work_versions(id)` — this *does* identify one specific recording (one
  specific `work_versions` row), not merely "the work" in the abstract. `supersedes_designation_id`
  forms the append-only chain the task's framing anticipated (`154:25,33-35`), and a
  `BEFORE UPDATE OR DELETE` trigger rejects any mutation of a landed row
  (`154:65-67`, `reject_song_passport_ledger_mutation()`).
- **`song_passport_release_links`** (`154:41-59`): `track_id UUID NOT NULL REFERENCES
  public.tracks(id)`, `master_designation_id` (FK-paired to its `passport_id`, `154:53-55`),
  `vault_project_id`. **This is the forward chain from a specific work, through a specific
  designated recording, to the specific `tracks` row that recording became** — written
  atomically inside `graduate_song_passport_to_release()` at the moment the track is created
  (`154:297-309`), never backfilled or inferred.

Chased all the way through: `song_passports.work_id` is `NOT NULL UNIQUE`
(`151_song_passport_foundation.sql:16`) — one passport per work, no ambiguity there — so the
full chain `tracks.id → song_passport_release_links.track_id → master_designation_id →
work_version_id` and, separately, `→ passport_id → song_passports.work_id` gives an
**unambiguous, FK-enforced answer to "which work (and which exact recording of it) produced
this specific track"** — for any track that went through this function.

**What this does NOT cover:**
1. **Tracks never touched by Song Passport graduation** — which today is most of them, since
   the ordinary vault upload path (§2) creates tracks with no passport, no work, nothing to
   chase. For these, "which work made this track" has no answer because there is no work; this
   is a hard absence, not an unresolved join.
2. **A project that later gains more tracks than the one work put there.** The forward chain
   identifies the correct track precisely even inside a crowded project — it does not go
   through `graduated_project_id → vault_projects → tracks` at all, so the ambiguity the
   `graduated_project_id` join has (§6) does not apply to it. The chain is already immune to
   the exact problem the task describes, *for tracks it covers*.

**Already consumed, one direction only.** `lib/song-passport/repository.ts:32` already queries
`song_passport_release_links` keyed by `passport_id` (work → track, forward) to show a
passport's own release status. I grepped every reference to `song_passport_release_links`
(migrations, `__tests__/migration-154.test.ts`, `repository.ts`) and to the JSONB breadcrumbs
(`song_passport_id`, `source_work_version_id`, `master_designation_id` inside `tracks.metadata`)
across `app/`, `lib/`, `components/` — **no code anywhere queries either in the reverse
direction** (given a `track_id`, find its work). The data to answer "which work made this
track" already exists on disk for passport-graduated tracks; nothing has ever asked it that
question.

---

## 5. Is there any other existing path from a track back to a work?

Established properly, not assumed:

- **No `tracks.work_id` column.** Checked every migration that touches `tracks` (above).
- **No view, function, or RPC performs track→work resolution.** Grepped `ai_entries`,
  `graduated_project_id`, `song_passport_release_links`, and the JSONB breadcrumb keys across
  the entire app/lib/components tree (outside stale `.claude/worktrees/` copies from other
  sessions, which I excluded). Every hit is either schema, a forward (work→track) read, or a
  write. None is a reverse lookup.
- **A structurally similar, already-solved sibling exists for comparison:** ideas→works. An
  idea's `promotedWorkId` (`lib/ideas/schema.ts:44`) points one way (idea→work); a reverse
  lookup (work→idea, "FROM AN IDEA" on the work page) was built and shipped
  2026-09-03 (`.planning/todos/done/2026-10-04-work-page-provenance-row.md`, which documents a
  todo that *wrongly* assumed the reverse lookup was still missing). That precedent is idea↔work,
  not work↔track, but it shows the codebase has built exactly this shape of reverse pointer
  before when the forward pointer already existed — it just has not been built for tracks yet.

**Absence confirmed**, not inferred from a partial read.

---

## 6. What today's project-level join actually returns on a multi-track project — and who relies on it

**Nothing currently joins `ai_entries` to `sync_listings` or to any track at all.** Grepped
every reference to `ai_entries` in app/lib/components (excluding stale worktrees): it appears
only in `lib/catalogue/ai-entries.ts` (the pure predicate module), its route
(`app/api/works/[workId]/ai-entries/route.ts`), the work composer page
(`app/(artist)/vault/works/[workId]/page.tsx:160,174`, both scoped by `work_id`), and the
diary-capture trigger (`138_work_diary_events.sql:349-351`). `/admin/sync-library` and its
supporting routes (`app/(admin)/admin/sync-library/page.tsx`,
`app/api/sync-library/admin/[listingId]/route.ts`,
`app/api/sync-library/admin/[listingId]/quality/route.ts`) contain zero references to
`ai_entries` or `works`. **The task's claim that `/admin/sync-library` never queries `ai_entries`
today is confirmed exactly as stated** — there is no "naive join" running in production to
critique; it would have to be written from scratch.

**The one place the ambiguous join *shape* already exists, concretely, is**
`app/api/works/[workId]/passport/discovery/route.ts:143-150`:

```ts
if (work.graduated_project_id) {
  const { data, error } = await service
    .from('vault_projects')
    .select('id, title, release_date, label, upc, catalog_number, tracks(id, title, track_number, isrc, p_line, c_line)')
    .eq('id', work.graduated_project_id)
    .maybeSingle()
  releaseProject = data as LegacyWorkSource['releaseProject']
}
```

This returns **every** track in the project, as an array, not one resolved track. For the
common case (a work that graduated once, into its own fresh single-type project with exactly
one track) the array happens to have one element. But nothing stops that same project from
later gaining a second, third, unrelated track via the ordinary vault upload route (§2/§3) —
at which point this exact query returns tracks that have nothing to do with the work whose page
it was fetched for, and this route's own type (`releaseProject.tracks`, plural) already admits
that honestly rather than picking one. This route is read-only, owner-only, display-only
(a legacy-discovery report) — nothing downstream treats its output as an authoritative single
answer. It is evidence that the ambiguity is real and already reachable, not evidence that
anything currently *mis*relies on it.

---

## 7. Who else would want this link

- **CWR/registration** (`lib/metadata/cwr.ts`, `assessCwrReadiness`): grepped for `work_id` /
  `graduated_project_id` — zero hits. CWR readiness today is computed entirely from
  `vault_projects`/`tracks` data (composer/publisher/IPI fields on the track and project), with
  no awareness that a `works` row or an `ai_entries` disclosure might exist upstream. A
  structural work→track link would let CWR surfaces pull AI-disclosure fields
  (`IsAIGenerated`, `AIComponentType`, `AITrainingDisclosure` — named directly in
  `135:241-244`'s comment on `ai_entries.component`) automatically instead of asking the artist
  to re-declare them at registration time, which is the exact thing that comment says the
  `component` column was stored "now" to make possible later.
- **The Song Passport itself** already wants and has the forward half (§4) — it is the one
  surface that already resolves work→track correctly today.
- **The work page** (`app/(artist)/vault/works/[workId]/page.tsx`) shows `ai_entries` scoped to
  the work, and shows the graduated project via `graduated_project_id` — it is already two
  short steps from being able to show "this AI entry affects the track currently live in your
  Crate listing," but does not attempt to today.
- **Provenance at large**: the same correspondence this document is about is structurally the
  same kind of fact as the idea→work reverse pointer already built (§5) — a precedent, not a
  requirement, but it suggests this is a recurring need in this product's data model rather
  than a one-off.

**At least three surfaces would use it** (Crate eligibility enforcement, CWR/registration
auto-fill, the work page's own display), which argues against treating this as a narrow,
single-screen fix — though see §8's "do nothing structural" option for the honest
counter-argument about scope and timing.

---

## 8. Options — not a decision

### Option A — Direct link: `tracks.work_id` (or `works.graduated_track_id`)

Add a nullable FK column directly bridging the two tables.

- **What it costs:** one migration (human-gated, not written here per the constraint); every
  reader of `tracks` gains an optional new field; `graduate_song_passport_to_release()` would
  need a one-line addition to populate it going forward.
- **Backfill:** honest only for the tracks `song_passport_release_links` already identifies
  (§4) — those can be backfilled with certainty, from data that already exists, no guessing.
  **Cannot be honestly backfilled for any pre-Song-Passport, legacy-upload track**, because no
  record of which work (if any) produced them exists anywhere — there may be no work at all, or
  there may have been one the artist never used Song Passport for. A backfill script would have
  to either leave those `NULL` (correct, but then this option doesn't close the Crate-eligibility
  gap for legacy tracks — it only closes it for new ones) or guess by title/timing match (a
  rights product guessing at authorship-adjacent facts is exactly the class of money-bug this
  codebase's own doctrine (`.claude/CLAUDE.md`'s `author_user_id` precedent) warns against).
- **Risk:** a second, independent pointer duplicating what `song_passport_release_links`
  already states correctly (§4) — two sources of truth for the same fact, which could drift if
  one is updated and the other is not (the master-designation chain is append-only and can be
  superseded; a flat `tracks.work_id` has no append-only discipline of its own unless built to
  mirror it).
- **Reversible:** yes — it is an additive nullable column; dropping it later loses nothing that
  isn't already recoverable from `song_passport_release_links`.

### Option B — Resolve through the master designation (use what §4 already built)

Don't add a column. Teach the eligibility check to join `sync_listings.track_id →
song_passport_release_links.track_id → master_designation_id → work_version_id`, and
separately `→ passport_id → song_passports.work_id`, then query `ai_entries` for that
`work_id` filtered to `level='work'` entries plus `level='version'` entries matching that exact
`work_version_id`.

- **What it costs:** no migration. New query code only (an index on
  `song_passport_release_links(track_id)` would help it scale, but one does not exist yet and
  would itself be a small additive migration if volume warranted it — reversible, low-risk).
- **Risk:** this resolves eligibility **only for tracks that went through Song Passport
  graduation**. For the (today, probably majority) of tracks created via the legacy upload
  route, this returns "no correspondence found" — correctly, since none exists — which is not a
  bug in the join, it is the truth about those tracks. Any "advance to Crate" enforcement built
  on this option must have an honest answer for that case (most naturally: no AI-provenance
  disqualifier can be found ≠ no AI-provenance disqualifier exists; the UI must say "no
  AI-disclosure history to check" rather than implying "clean").
- **Reversible:** yes, trivially — it's a read path, not a schema change.
- **Note on aggregation:** `resolveCrateConsequence()` (`lib/catalogue/ai-entries.ts:214-251`)
  takes one `AiEntryInput`, not a list — a work can have many `ai_entries` rows. Any consumer
  of this option has to decide how multiple entries combine (most consistent with the existing
  "two disqualifiers" doctrine: any entry whose own consequence is `eligible: false` disqualifies
  the whole master — a new, small piece of logic, not a column).

### Option C — Carry the eligibility receipt forward at graduation (denormalise the decision)

At the moment `graduate_song_passport_to_release()` runs, compute and store the track's AI-
provenance eligibility verdict on the new track (or on the `song_passport_release_links` row),
rather than resolving it live from `ai_entries` every time someone asks.

- **Correction to the task's own framing, found during verification:** the task describes this
  as mirroring an existing pattern — "`ai_entries` already stores its receipt at write time
  rather than recomputing." **That is true only of the `citation` text column.**
  `ai_entries` has **no column at all** for the `CrateConsequence` (`eligible`/`disclosed`)
  itself (confirmed: the table's five content columns are `level, version_id, block_id,
  component, mode, citation, human_source_version_id` —
  no `eligible`/`crate_*` field anywhere in `135:273-290`). `resolveCrateConsequence()`
  (`ai-entries.ts:214`) is called at write time inside `composeReceipt()` (`ai-entries.ts:280-298`)
  purely to build the transient `receipt` object the API response and `AiEntryFlow.tsx:109`
  show the artist once — it is never persisted, never read back. So Option C would not be
  "storing what we already store, just one table over" — it would be the **first time this
  product persists a crate-eligibility verdict anywhere**, following the citation column's
  *pattern* (compose server-side, store, never regenerate) without there being a pre-existing
  instance of that pattern for *this specific* fact.
- **What it costs:** a migration (new column(s), most naturally on
  `song_passport_release_links` or the new track row) plus a few lines inside the existing
  graduation transaction to call `resolveCrateConsequence()` (or its multi-entry aggregate,
  per Option B's note) over the work's `ai_entries` at the moment of graduation and store the
  verdict.
- **The obvious objection, addressed directly:** what happens when provenance changes *after*
  graduation — a new AI entry is filed against the work, or a human re-authors a part the AI
  touched (naturally resolving a prior disqualifier)? A denormalised verdict goes stale the
  moment either happens, silently, with nothing to invalidate it. This is the same risk class
  the project's own `label-integrity-funun` skill exists to catch: a stored value whose name
  ("crate eligible") asserts something nothing is currently re-checking. Mitigation would
  require either (a) re-running the verdict on every subsequent `ai_entries` write against that
  work (a trigger, itself a migration, with its own blast radius), or (b) treating the stored
  verdict as "as of graduation" only and re-resolving live at the actual advance-to-Crate
  moment regardless (which starts to collapse back into Option B, just with a cached fast path).
- **Risk:** silent staleness, as above — arguably the highest-risk option of the four schema
  options, precisely because it reads as "already checked" to a reviewer who does not know it
  can drift.
- **Reversible:** the column is additive and droppable, but a decision already *made* on a
  stale cached verdict (a song advanced into The Crate on a verdict that was true at
  graduation but is no longer true) is not reversible after the fact in the way the schema
  change is — this is the sharpest trade-off of the four.

### Option D — Resolve at submit time (the submitter records which work a track came from)

When an artist submits a track to the Sync Library (`app/api/sync-library/submit/route.ts`),
have the submit flow ask (or auto-detect, where §4's correspondence already resolves it) which
work backs this track, and store that on the `sync_listings` row.

- **What it costs:** a migration (`sync_listings.work_id`, nullable) plus submit-route changes.
  Verified: `submit/route.ts` today takes only `{projectId, trackIds[]}` (lines 26-27) and never
  touches `works` — this would be new surface, not a wire-up of something half-built.
- **What it buys that B doesn't:** for a track Song Passport already resolves (§4), the submit
  route can auto-fill this with no artist input and no guessing — strictly better than asking.
  For a legacy track with no resolvable work, the artist is the one person who might actually
  know whether "this track started life in a work I never ran through the composer" — asking
  them is at least not a guess, where Option A's backfill would have been.
  Note that an artist's "I don't know" answer must be treated as a real, legitimate state here,
  not as "no AI involvement" by default — the same honesty point Option B's UI note makes.
- **Risk:** depends on self-report for exactly the cases where self-report is least reliable
  (an artist submitting an older upload may not remember, or may not want to recall, whether an
  AI tool touched an early pass of it). This is a weaker rights-evidentiary basis than the
  structural correspondence in §4, which is why it is listed after B/C rather than before them —
  it is best as a *fallback* for tracks B/C cannot resolve, not a replacement for either.
- **Reversible:** yes, additive and low-blast-radius.

### Option E — Do nothing structural; make the screen tell the truth about what it can't resolve

Ship the advance-to-Crate enforcement using only what §4 already resolves (functionally
Option B, with no new column), and for every track that enforcement cannot resolve to a work,
show that plainly — "no AI-provenance history found for this track" is a different, honest
statement from "no disqualifying AI provenance," and the UI must not conflate them. Block the
advance (or route it to the existing `'contact'` tri-state the sync gate already uses for
unresolved rights state, per `lib/sync-library/gate.ts:41-54` and §5 of the companion
deliberation) rather than silently treating "unresolvable" as "clean."

- **What it costs:** nothing structural — no migration at all. This is the only option with
  zero schema change.
- **What it risks:** it does not make eligibility resolvable for legacy tracks — it makes the
  product honest about the limit instead of solving it. If the owner's intent is that *every*
  track, including years of legacy uploads, must have enforceable AI-provenance eligibility
  before any of them can be advanced, this option alone does not deliver that; it only delivers
  it for the subset §4 already covers.
  Also note: §6 already shows nothing today relies on the ambiguous `graduated_project_id` join
  as an authority — so choosing this option does not mean *leaving a known bug running*; it
  means *not building the enforcement past where the data honestly reaches yet*.
- **Worth weighing seriously, not dismissing as the lazy answer:** the owner's own 2026-10-04
  decision (§5 of the companion deliberation) already establishes the precedent that "visible
  and pitchable, but routed to contact until resolved" is an acceptable interim state for
  rights-readiness generally (that is exactly what happens to a sample-clearance-blocked song
  today). Extending the same honest-interim-state pattern to AI-provenance resolution for
  tracks with no resolvable work is consistent with how this product already handles every
  other kind of "we don't have an answer yet," rather than inventing a new kind of gap-filling.
- **Reversible:** trivially — it's UI/logic only, and nothing here forecloses later adding A,
  B, C, or D.

---

## 9. Recommendation (for the owner to weigh, not a decision)

**Lead with Option B (resolve through the master designation), backed by Option E's honesty
rule for what it cannot reach, with Option D as a later addition rather than a blocker.**

Reasoning:

- Option B needs no migration and uses a correspondence that is *already real, already
  FK-enforced, already append-only-safe* (§4) — it is wiring, in the GSD sense, not new
  modelling. It directly answers the structural problem named in §6 of the companion
  deliberation without touching anything the earlier migrations deliberately decided.
- It is the only option that does not risk the staleness failure mode Option C's own analysis
  surfaces (§8-C) — and staleness is a uniquely bad failure mode for a check whose entire job is
  to be "correct at that instant, not approximately correct" (the owner's own words, quoted in
  the companion deliberation's §4 "Step 10 is rights-bearing").
- It is honest about its own limit rather than quietly overreaching: it resolves eligibility
  for exactly the tracks that have a resolvable work, and Option E's framing is what keeps the
  "advance" action from treating "I found nothing" as "I checked and it's clean" for every other
  track — which matters because most tracks likely submitted to the Sync Library today went
  through the legacy upload path (§2/§6), not Song Passport graduation, so "most tracks return
  no resolvable work" should be the expected, common, correctly-handled case on day one, not an
  edge case discovered later.
- Option A (a direct `tracks.work_id` column) is worth revisiting *after* B ships and the
  product can see, from real usage, whether B's reverse-join is a performance or complexity
  problem worth a denormalised column — but building it first, before that evidence exists,
  adds a second source of truth (§8-A's risk) for a problem B already solves without one.
- Option D is good, compounding evidence to collect at submit time regardless of which other
  option ships — it costs little, degrades gracefully to "unknown," and directly helps the
  legacy-track case B cannot resolve — but it should not be the *first* thing built, because its
  evidentiary strength is lower than the structural correspondence B already has for free.

This is a recommendation, stated as one; the owner may weigh the legacy-track coverage gap
differently, or decide the staleness risk in C is acceptable given how rarely provenance would
realistically change post-graduation. Both are reasonable positions this document does not
try to foreclose.

---

## 10. Where my framing (and the task's) came back FALSE

- **"A work→track link might be among the things migration 135 deliberately refused."**
  FALSE, directly checked against the verbatim comment (§1). The two refusals are a reverse
  split-sheet pointer and an artist-labels column. Nothing in `135` (or any other migration I
  could find making the same rhetorical move) considers and rejects a track correspondence.
  This is good news for every option above: none of them reverses a prior decision.
- **"Crate eligibility is computed by `resolveCrateConsequence` ... and stored on the
  `ai_entries` row at write time."** PARTLY FALSE. The `citation` string is stored on the row,
  exactly as described, and never regenerated. The `CrateConsequence` itself — the actual
  eligible/disclosed verdict — is **not stored anywhere**. It is computed at write time solely
  to show the artist a one-time receipt (`AiEntryFlow.tsx:109`) and then discarded. This matters
  for the options above: Option C is not "extend an existing stored-eligibility field to more
  places," it is "persist eligibility for the first time," which is a materially bigger and
  riskier step than the task's framing suggested, and I've corrected that in §8-C directly.
- **Everything else in the task's framing held up under verification**: the `ai_entries`/
  `sync_listings` key mismatch, the `graduated_project_id` bridge's insufficiency, and
  `/admin/sync-library` never querying `ai_entries`, are all confirmed exactly as stated (§2,
  §6). The suspicion that `song_passport_master_designations` "may already contain the missing
  correspondence" was correct, and turned out to understate it — the correspondence is already
  carried one full step further, all the way to the specific `tracks` row, via
  `song_passport_release_links` (§4).

---

## Files read in full for this deliberation

`supabase/migrations/135_works_core.sql` (308 lines), `096_sync_library.sql` (136 lines),
`154_song_passport_master_graduation.sql` (318 lines), `151_song_passport_foundation.sql` (head),
`lib/catalogue/ai-entries.ts` (310 lines), `app/api/works/[workId]/ai-entries/route.ts` (222
lines), `lib/sync-library/gate.ts`, `lib/sync-library/submission.ts` (head),
`app/api/sync-library/submit/route.ts` (head), `app/api/sync-library/admin/[listingId]/quality/route.ts`
(full), `app/(artist)/vault/works/[workId]/page.tsx` (head/data-loading section),
`app/api/works/[workId]/passport/discovery/route.ts` (relevant section),
`.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` (full, as the
source of the problem statement).
