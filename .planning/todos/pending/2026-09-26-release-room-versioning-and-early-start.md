# The Release Room: successive masters, an early start, and carry-over that is actually live

**Captured:** 2026-09-26 · **Status:** open — owner-requested capability, partly built
**Came from:** owner's question on the "Submit a song" questionnaire — *"does the Release Report
allow you to upload current versions of the master as new ones become available?"*
**Scope:** Member accounts only

## The answer to the question, verified

**No — not in the Release Report.** `tracks.audio_file_url` is a single `TEXT` column
(`supabase/migrations/001_initial_schema.sql:123`), and `uploadTrackAudio`
(`lib/storage/index.ts`) writes to a stable path with `upsert: true`:

```
${userId}/${releaseId}/${trackId}.${ext}
```

So a new master **overwrites the previous file in place**. No history, no version list, no
"this one is the master" indicator. (A different extension writes a new key and repoints the URL,
orphaning the old object — still no version record either way.)

**Yes — on the work side, and it is already built.** Migration 154
(`154_song_passport_master_graduation.sql`) ships:

- `work_versions` — many versions per song
- `song_passport_recording_lineage` — `derived_from | mix_of | edit_of | **mastered_from**`
- `song_passport_master_designations` — an explicit master designation bound to a version **and**
  an approved snapshot
- `graduate_song_passport_to_release(p_passport_id, p_master_designation_id, …)` — turns a
  designated master into a Release Report, returning `(vault_project_id, track_id, created)`
- `song_passport_release_links` — a durable passport ↔ project/track row carrying a `mapping` JSONB
- `attach_final_mix` (in `app/api/works/[workId]/passport/route.ts`) — the reverse bridge, pulling
  a Release Report track's master back in as a `work_version`
- a notification: *"A release master was selected — the exact recording and approved Passport
  snapshot are now linked."*

**It is not switched on.** `SONG_PASSPORT_ENABLED` defaults to false
(`lib/song-passport/feature.ts`), it is cohort-gated per work, and the module header states
*"Slice 1 has no artist-facing UI or client writes."*

## What the owner wants added

> *"add the capability to track and add new 'master selected' tracks in the Release Room, or
> possibly begin a Release Room early for a track that is ALMOST done to begin working on metadata
> and other things — this would still have to connect to the song's Writer's Room and have the
> information that is there carry over, and tell you what is still needed, and then once filled in,
> it's auto-filled everywhere: credits, lyrics, metadata, splits, agreements."*

Three distinct capabilities. Two of them are genuinely missing:

### 1. Successive masters in the Release Room, with one designated current

Today the room holds one file per track and silently replaces it. Needs a version list, a current-
master indicator, and the lineage relationship already modelled upstream (`mastered_from`). The
cheapest honest route is probably **not** a second versioning system in `tracks` — it is turning on
the passport and letting `work_versions` + `song_passport_master_designations` be the authority,
with the Release Room reading the designation. **Turn on and wire up, not build.**

### 2. Start a Release Room before the master exists

Today graduation **requires** a master: `p_master_designation_id` is a required parameter and is
FK-constrained to `song_passport_master_designations`. So a song that is almost done cannot open a
Release Room to get a head start on metadata, artwork and paperwork. This is the owner's real ask
and it is **not** built. It needs a release shell that can exist in a pre-master state and accept
the master later — which is close to relaxing that parameter plus a status for "no master yet."

**Owner's alternative, 2026-09-26: start the Song Passport before the Release Room.** Noted, and
it turns out to be the existing architecture rather than a change — which makes this the cheaper of
the two routes.

- `song_passports.work_id` is `NOT NULL UNIQUE` referencing `public.works`
  (`151_song_passport_foundation.sql:16`). **One passport per work, hanging off the work — the
  Writer's Room side.** It has nothing to do with a release.
- It is created lazily on first passport action: `INSERT INTO public.song_passports (work_id,
  created_by) … ON CONFLICT (work_id) DO NOTHING` (`152_song_passport_discovery.sql:111`), guarded
  to the work owner.
- So the passport **already precedes the Release Report by design**. Graduation is the passport
  *producing* a release, not a release producing a passport.

That collapses capability #2 to a single blocker rather than a new concept: the passport can
already accumulate metadata, lyrics, identifiers and approvals on an unfinished song. What it
cannot do is **open a Release Report shell before a master is designated**, because
`p_master_designation_id` is required and FK-constrained. Relaxing that one parameter — plus a
"no master yet" state on the shell — is most of the feature.

Cross it when we get there; recorded so the cheaper route is not rediscovered from scratch.

### 3. Carry-over that is live, not a one-time copy — and it is thinner than the page claims

Graduation copies **six fields, once, one way**: title, release date, label, UPC, ISRC and lyrics,
read out of passport field values into the new `vault_projects` + `tracks` rows. Read the whole RPC
body (`154:199` onward, ~95 lines): the only writes are `INSERT INTO public.vault_projects` and
`INSERT INTO public.tracks`. **No composer, credit, performer, split, contributor or agreement is
carried.**

**CORRECTION 2026-09-26 — my claim above was wrong on two counts.** I said splits attach only on
the release side with no `work_id`, and that nothing joins the writing to the sheet. A full trace
found both links, and the third thing I called a gap turns out to be forbidden on purpose.

1. **`split_sheets.work_id` exists.** Migration 137 (Phase 37.1) adds it — *"links a split sheet to
   the composition it governs, so a work in My Catalogue can carry a **LIVING DRAFT sheet from the
   moment it is created**."* My reading of `018` was of the original table, not the current schema.
2. **Sheet parties and track composer metadata sync bidirectionally.** `lib/split-sheets/
   project-sync.ts` (Phase 21 `sheet-project-sync`): *"while a linked sheet is still syncing…
   writers/roles/splits stay linked between the sheet's parties and the linked project's track
   composer metadata, **in both directions**,"* hooked by the split-sheet and track PATCH routes.
   My earlier search looked for one module naming both `lyric_blocks` and `split_sheet`, which this
   bridge does not — it joins sheets to composers, not blocks to sheets. The search was too narrow.
3. **Authorship must NOT drive percentages, by locked doctrine.** `lib/catalogue/splits.ts`:
   *"splits default to EQUAL shares… **The system NEVER proposes contribution-based percentages.**
   The diary is evidence the writers MAY consult… There is deliberately NO function in this module
   that accepts a contribution signal (word count, block count, edit history, anything). Adding one
   would be a doctrine violation, not a feature request."*

So the chain the copy describes does exist — work → living-draft sheet from creation → parties ↔
track composers — and the one link I treated as missing is one the doctrine forbids. What the
graduation RPC carries is still just the six fields; that part stands. But it is not the only path,
and "no bridge exists" was false.

**Original claim, left visible because the correction is the point:** ~~Splits are attached on the
release side, not the work side… none joins block authorship to a split sheet.~~

**OWNER RULING 2026-09-26: leave the copy alone.** *"Disregard this for now, we are working
through it, don't change the copy."* The gap below is recorded as a live engineering question, not
as a copy defect and not as a blocker on the page. **Do not edit steps 4 or 5 of the marketing
page on the strength of this note.** The bridge is being worked through; the copy describes where
it lands.

**The gap itself, for the engineering work:** The marketing page says, in step 4, *"Every section
knows who wrote it. By the time the song is finished the split sheet already reflects what actually
happened,"* and in step 5, *"credits already filled in from the writing rather than a last-minute
round of emails."* Graduation does not do that today, and no `lib/` module bridges the two. Either
the bridge gets built before the page is public, or those two lines get softened. **Do not let this
ship unresolved** — it is the page's central promise, and an unverified claim in a rights product is
a money bug, not a docs bug.

## Suggested order

1. Confirm the gap independently (trace every path into `tracks.metadata` composers, not just
   graduation) — the claim above is verified for the RPC and for `lib/`, not exhaustively.
2. ~~Decide the marketing copy either way~~ — owner ruled: copy stands, this is an engineering
   item. The page is not blocked on it.
3. Turn the passport on for a cohort and let the Release Room read the master designation (#1).
4. Then the pre-master release shell (#2), then live carry-over (#3).
