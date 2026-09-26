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

### 3. Carry-over that is live, not a one-time copy — and it is thinner than the page claims

Graduation copies **six fields, once, one way**: title, release date, label, UPC, ISRC and lyrics,
read out of passport field values into the new `vault_projects` + `tracks` rows. Read the whole RPC
body (`154:199` onward, ~95 lines): the only writes are `INSERT INTO public.vault_projects` and
`INSERT INTO public.tracks`. **No composer, credit, performer, split, contributor or agreement is
carried.**

Splits are attached on the release side, not the work side: `split_sheets.vault_project_id`
references `vault_projects` and is nullable (`018_collaborators_split_sheets.sql:41`); there is no
`work_id`. Meanwhile authorship lives on the work side as `lyric_blocks.author_user_id`, documented
in migration 135 as *"the fact that MOVES SPLITS."* Searched `lib/` for a module holding both — none
joins block authorship to a split sheet.

**⚠️ This bears on copy that is about to ship.** The marketing page says, in step 4, *"Every section
knows who wrote it. By the time the song is finished the split sheet already reflects what actually
happened,"* and in step 5, *"credits already filled in from the writing rather than a last-minute
round of emails."* Graduation does not do that today, and no `lib/` module bridges the two. Either
the bridge gets built before the page is public, or those two lines get softened. **Do not let this
ship unresolved** — it is the page's central promise, and an unverified claim in a rights product is
a money bug, not a docs bug.

## Suggested order

1. Confirm the gap independently (trace every path into `tracks.metadata` composers, not just
   graduation) — the claim above is verified for the RPC and for `lib/`, not exhaustively.
2. Decide the marketing copy either way, since the page is blocked on it.
3. Turn the passport on for a cohort and let the Release Room read the master designation (#1).
4. Then the pre-master release shell (#2), then live carry-over (#3).
