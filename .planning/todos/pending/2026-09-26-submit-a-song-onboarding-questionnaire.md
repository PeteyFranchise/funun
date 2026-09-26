# "Submit a song" → an onboarding that lands the song in the right room

**Captured:** 2026-09-26 · **Status:** approach owner-approved, question set in review
**Answers:** marketing CTA #3 — "Submit a song" (hero C and The Crate section)
**Scope:** Member accounts only

## The owner's shape of it

> *"Have them upload the song into their own vault and make sure they understand that this is a
> private vault and not yet a submission our staff can determine for The Crate. But what this WILL
> or CAN do is get them into Funūn with a song directly in the Release Report room, and then the
> system can carry them through the way to submitting for the actual THE CRATE."*

So: the CTA does not submit anything. It gets a real song into a private Sound Vault, puts it in
the right room, and teaches the path to The Crate on the way.

## This holds against doctrine — checked, not assumed

- **"The Crate is offered, never assumed"** (deliberation decision #10, owner 2026-08-30). Someone
  who clicked a button inside the Crate section has **declared** intent; answering a declared
  intent is not assuming it.
- **Private vault ≠ submission** matches the real mechanics: submission is an explicit per-track
  action (`components/vault/TrackList.tsx:345` → `/api/sync-library/submit`), and the owner's own
  earlier correction — *"they still have to actually submit a song over to us."*
- **The fork already exists.** `/vault/new` is a two-door chooser (`Door = 'choose' | 'song' |
  'release'`): *The Writer's Room* — "Start a song. Hum it, write lyrics, upload a take" — and
  *The Release Report* — "Start a release… with the full readiness checklist for going out." The
  questionnaire is a richer version of a shipped screen, not net-new.

## Three conditions it must respect

1. **Keep all four doors open.** Decision #10 names Crate / Release / Registration / Distribution
   as first-class, with *"same guidance energy for the artist who never submits to it."* Highlight
   Crate; never remove the others. This matters most in the failure case — someone who arrives for
   sync and turns out to be ineligible must land somewhere useful, not in a dead end.
2. **Nothing stands between a person and their work.** `docs/architecture/ACCOUNT-TYPES.md`:
   profile completion *"is never required before capturing an idea, entering a Writer's Room,
   uploading a take, writing lyrics, or leaving a note."* **The song goes in first; the questions
   come after, and every one is skippable.** A questionnaire that gates the upload inverts the rule.
3. **Crate-eligible and release-ready are different checks.** `lib/vault/readiness.ts` measures
   assets and metadata. The Crate disqualifiers are AI-provenance (`lib/catalogue/ai-entries.ts:183`).
   **A song can hit 100% readiness and still be ineligible.** The onboarding must never imply the
   meter is the gate.

## Why this beats a static eligibility page

The two Crate disqualifiers are already *questions*:

1. did the whole master come out of a tool? (wholly AI master — ineligible on ownership grounds)
2. for every voice on it, can you point to the human take it came from? (the BGV clause)

Asking those once at upload is better than discovering them at rejection, and the doctrine already
carries the one-pass fix for the second — *"track a rough human take of that part so the tool can
build from it instead."* The questionnaire teaches eligibility **by asking about their song**
rather than making them read our rules. This may retire the "What makes a song Crate-ready" page
we owed, or reduce it to a reference the questionnaire links to.

Tone, per the catalogue doctrine: hygiene moments run **warmer than legal** — citation is a badge,
not a confession. Nobody is confessing to using a tool.

## Draft question set — IN REVIEW, owner adding input

Marked **[doctrine]** where a question exists because the doctrine requires it, **[thesis]** where
it exists because it is what Funūn is for, and **[cut?]** where it is defensible to drop.

**Before any question: the song is already uploaded and already theirs.** The first screen is a
statement, not an ask — *"It's in your vault. It's private; nobody at Funūn can see it yet."*

1. **"Where's this song at right now?"** **[doctrine — routing]**
   - It's done — mixed, mastered, ready to go out → **Release Report**
   - It's close — needs a mix or a master → **Writer's Room / Catalogue**
   - Still writing it → **Writer's Room**

   **Corrected 2026-09-26 — the middle answer used to route to the Release Report. That was
   wrong.** Owner caught it by asking whether the Release Report accepts successive masters. It
   does not: `tracks.audio_file_url` is a single column (migration 001:123) and `uploadTrackAudio`
   upserts to a stable path, so a second upload **overwrites the first in place** — no history, no
   version list, no current-master flag. Someone still mixing would have had to upload a rough and
   then silently destroy it. Versions and master designation live on the *work* side, so that is
   where "not finished yet" belongs, graduating to a Release Report once a master exists. See
   `2026-09-26-release-room-versioning-and-early-start.md`.

2. **"Who else is on it?"** **[thesis]**
   - Just me
   - A few people, and I know how to reach them
   - A few people, and tracking them down is the problem  ← *the moment the product pays off*

3. **"Are the splits agreed?"** **[thesis]**
   - Agreed and written down
   - Agreed out loud, nothing signed
   - Not yet

   **Each answer gets a response, owner-directed 2026-09-26** — *"after not yet, say 'don't worry
   we got you' with an emoji or something."* Matches the house voice already on record: confident,
   casual, insider; **"We got you."**

   | Answer | Response |
   |---|---|
   | Agreed and written down | **Nice. Bring it in and it rides with the song from here.** |
   | Agreed out loud, nothing signed | **That's most songs. Let's make it real before it matters.** |
   | Not yet | **No stress — we got you. 🤝** *We'll start a split sheet on this song at even shares. Nothing's locked: you and whoever you wrote it with set the numbers when you're ready.* |

   **The third response is load-bearing, not just warm.** `lib/catalogue/splits.ts` holds the
   locked rule: *"splits default to EQUAL shares… **The system NEVER proposes contribution-based
   percentages.** The diary is evidence the writers MAY consult when deciding their own split; it
   is never an input this product converts into a percentage."* So the reassurance has to promise
   **even shares the writers control** — never "we'll work out who did what." Saying anything that
   implies the system will propose a split from the writing would be a doctrine violation dressed
   up as a kindness.

   The middle answer is the genuinely risky state — a verbal agreement is what turns into a dispute
   — so it gets urgency without shame. **Owner to confirm or rewrite the first two; only the third
   was directed.**

4. **"Did any of this come out of an AI tool?"** **[doctrine — disqualifier 1]**
   - No
   - Some of it — instruments, beats, a melody or a lyric line
   - The whole track came out of a tool  ← *not Crate-eligible; still a real song in their vault*

5. **"The voices on it — can you point to the human take each one came from?"** **[doctrine —
   disqualifier 2, the BGV clause]** *(only if the song has vocals)*
   - Every voice started with a person singing
   - Some were built by a tool from a take we have
   - At least one has no human take behind it  ← *the hard no, with the one-pass fix offered*

6. **"Where do you want this song to end up?"** (choose any) **[doctrine — keeps the four doors
   open]**
   - Out on DSPs
   - Up for sync
   - Registered properly
   - Not sure yet

7. **CUT (owner, 2026-09-26)** — ~~"Anything in it you didn't make — a sample, an
   interpolation?"~~ *"Cut 7 for now, but make sure we have that question somewhere in the Release
   Report so it can pass clearances or let us know if we need to search for clearances."*

   **It is already there.** `components/vault/SampleFlagToggle.tsx` — a per-track control reading
   *"This track contains a sample,"* rendered by `DocumentStage` on
   `/vault/[projectId]/documents`. Its own header states the consequence:

   > *"Flipping it on reveals a free-text field for sample details and PATCHes the track. Flagging
   > a sample **creates a required Sample Clearance requirement and caps the readiness score**
   > until that clearance is signed."*

   The full chain, verified:

   - the toggle writes `tracks.has_sample` and `tracks.sample_details` (real columns, read by
     `lib/deals/catalog-query.ts`, `lib/selects/tracks-query.ts`, `lib/deals/request-target.ts`)
   - which drives `sampleBlock` — `lib/sync-library/gate.ts:51`: a sample block routes the buyer
     to `'contact'` rather than a clean licence
   - and the buyer-facing label decided 2026-09-09: *"Contains a sample — licensing needs
     clearance first."*
   - **SampleClear** (`lib/tools/sampleclear.ts`) does the searching: it identifies the master and
     publishing holders separately, drafts a request letter to each, offers alternatives, and
     returns a `risk_level`; the output files as a `sample_clearance` document.

   **Doctrine to respect, from `.planning/deliberations/sync-catalogue-entry-and-samples.md`:**
   sampled tracks **ARE** included in the default browse — *"Sample-based music is a large share of
   what supervisors actually place."* And never promise a clearance timeline: an earlier draft
   floated "typically 4-8 weeks", which *"was invented by the assistant and the owner nearly
   adopted it… Any timeline on the catalogue must come from Funūn's own completed cases."*

   **The one real gap:** `SampleFlagToggle` has no reference to SampleClear — grepped, nothing.
   So an artist flags the sample, gets a requirement and a capped score, and is **not handed the
   tool that drafts the clearance letters.** That is the "let us know if we need to search for
   clearances" half of the ask, and it is a link, not a build. Second, smaller point: the toggle
   lives on the documents page, so you meet the question late — worth considering whether the
   Release Report surfaces it earlier.

## What they see at the end

Not a score. Three plain statements:

- **where the song lives now** — the room it landed in, and that it is private
- **what it is missing** — from the real readiness gaps for *that* song
- **The Crate, specifically** — eligible / not yet, here is the one thing / not eligible, here is
  why — and in every one of those three cases, the other doors are still on screen

## Open

Where the flow lives (a route before `/signup`, or the first run after it), whether it is one
screen or a short stack, how upload-before-account works at all given a song has to belong to
someone, and whether question 1's answer can be inferred from what they uploaded rather than asked.
