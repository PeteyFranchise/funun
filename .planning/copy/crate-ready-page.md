# Page copy — "What makes a song Crate-ready"

**Status:** drafted and owner-reviewed 2026-09-26. Not built.
**Answers:** marketing CTA #6 — the Crate section's *"What makes a song Crate-ready"* button.
**Audience:** Members and prospective Members. Public, logged-out-safe.
**Route:** undecided. Recommend mirroring `/sync`, which is already *"the public, logged-out-safe
front door to the buyer world"* — this is its artist-side equivalent and none exists.
**Built as a bench page 2026-09-26:** `private/bench/crate-ready.html`, so the marketing page's
"What makes a song Crate-ready" link resolves to something real rather than a decided-but-dead
href. Backed up as `bench03-crate-ready.html`. Same tokens, same header mark; the copy below is
what it renders.
**Voice:** US spelling throughout, `catalogue` the standing exception.

Every factual claim below is traced in the table at the end. Where a claim could not be verified it
is not in the copy.

---

## What makes a song Crate-ready

The Crate is Funūn's curated sync catalogue. Submitting is free and open to everyone. Getting in is
the earned part. This page is the bar, so you can decide whether a song is ready before you send it.

### You don't need an invite

Songs reach The Crate two ways: we invite one, or you send one. They go to the same place. A song
you submit yourself and a song we asked for face one review, on the same terms — the only
difference on our side is a note saying which door it came through.

So there's no queue behind a queue, and no advantage in waiting to be asked. In fact, help us
discover your bops faster by submitting your best two or three songs.

### The six things a song needs

All six. Not five and a good excuse.

| | What it means |
|---|---|
| **Split sheets signed** | Everyone who wrote it has agreed, in writing, to who owns what |
| **Copyright registered** | The composition is registered |
| **Producer agreements signed** | Anyone you hired has signed. *Produced it yourself? This doesn't apply to you, and it won't hold you up* |
| **Audio files uploaded** | WAV or FLAC, 44.1kHz or 48kHz |
| **Metadata captured** | Writers, publishers, roles and identifiers — the facts a license is written from |
| **Cover art** | Shop-window quality. It isn't a licensing blocker, but a song can't be listed without it |

**Nearly done isn't done.** Two that catch people out: a co-writer picked from your roster with no
IPI number downgrades your metadata, and a split sheet that doesn't cover every writer downgrades
your splits. Both look finished at a glance. Neither passes.

### What we don't ask for

ISRCs. PRO registration. MLC registration. None of them are required to get in.

They matter for releasing — they're how you get paid on streams — but a music supervisor has no
stake in them. We took them out of the bar on purpose, because the alternative was absurd: a song
with every signature signed and a finished master reading as unlicensable because nobody had picked
a distributor yet.

Get them done for your release. Don't wait on them to submit to The Crate. Funūn walks you through
each one — that's how your royalties find you, so the sooner it's done the better.

### What can't come in

**Anything that isn't finished.** The bar is a final master. You don't have to have put the song
out — no distributor, no release date, no ISRC. What we can't take is a rough, a work in progress,
or a promo clip.

Send a whole record if you want to. Each song is reviewed, admitted and licensed on its own. A
supervisor licenses a song, not a tracklist.

**A song that was entirely AI generated.** This is about ownership, not taste. The Crate
one-stop-licenses the recording, and nobody owns that one. It applies whether the tool wrote the
song from scratch or performed a composition you wrote end to end: you'd own the song, but the
recording still has no owner.

Since "master" gets used two ways — running your mix through an AI mastering tool is fine. So is an
AI mixing assistant. Those are post-production on a recording people made. What's out is a
recording that came out of a tool whole.

**A voice with no human take behind it.** One question covers every voice on the record, lead and
background: can you point to the human take it came from? A vocal built by a tool from a take you
have is fine — that's production, and we disclose it. A vocal with no take behind it isn't.

If that's the only thing in the way, it's usually an easy fix: sing the part yourself and let the
tool build from your take. It doesn't have to be a good vocal — it just has to be yours.

### Samples are fine

Sampled music is a large share of what supervisors actually place, so we don't exclude it. Flag the
sample, and the song sits in the catalogue labeled honestly: *contains a sample — licensing needs
clearance first.*

We'll help you chase it. Clearance is its own animal, and we won't quote you a timeline, because
the honest answer is that it varies enormously and some samples never clear.

### What happens after you send it

You submit. We review. If it's in, one agreement authorizes us to represent it — price, scope and
terms are still negotiated deal by deal, never in advance, and you always own your music: the song
and the recording both.

You can withdraw a song at any time. And a song that didn't get in isn't shut out for good — fix
what held it back and send it again.

**[Submit a song]** **[Start free]**

---

## Where every claim comes from

| Claim | Source |
|---|---|
| Submitting is free, open, ungated | `app/api/sync-library/submit/route.ts:6-11` — *"Ungated self-apply… available to ALL artists… NOT gated. This is the ONLY pre-admission door for an uninvited artist."* |
| Self-applied and invited meet one gate | `lib/sync-library/submission.ts:7-10` — *"there is exactly ONE staff gate — admit/reject at `pending_admit`. Self-applied and invited songs differ only by `entry_source` metadata and their initial state, not by an extra gate."* |
| Nothing is signed to submit | `lib/sync-library/submission.ts:76-82` — `initialStatusForEntry('self_applied', false)` returns `'applied'`; the agreement is a later transition |
| The six requirements | `lib/sync-library/readiness.ts:47-54` — `SYNC_READINESS_KEYS` |
| ISRC / PRO / MLC not required, and why | `lib/sync-library/readiness.ts:28-33` — *"release admin a music supervisor has no stake in… reads as unlicensable because nobody picked a distributor"* |
| Cover art is required but not a blocker | same, `:34-35` — *"shop-window quality, not a licensing blocker, but required to be listed"* |
| A warning fails the gate | `lib/sync-library/readiness.ts` `isSyncEntryComplete` fail-closed clause 2 — a roster composer with no IPI downgrades `metadata`; a partially-covered sheet downgrades `split_sheets` |
| Self-produced needs no producer agreement | `types/index.ts:114-119` — *"A self-produced recording has no hired collaborator, therefore correctly has no producer agreement, and read 'missing' forever — which blocked it out of the sync catalogue"* |
| Audio format | `types/index.ts` `READINESS_ITEMS.audio_files` — *"WAV or FLAC at 44.1kHz or 48kHz"* |
| Finished formats only | `lib/sync-library/readiness.ts:89` — `SYNC_ELIGIBLE_PROJECT_TYPES = ['single','ep','album']` |
| Licensed per song, not per record | `supabase/migrations/096_sync_library.sql:63-65` — unique index on `sync_listings (track_id)`, *"one ACTIVE listing per song"* |
| Wholly AI masters ineligible, on ownership | `lib/catalogue/ai-entries.ts:183-213` — *"`component === 'full'` means the ENTIRE recording came from the tool… nobody owns this one"* |
| Component-level AI is fine | same — *"AI instrumentation/MIDI/beats are eligible, disclosed, full stop"*; supports the AI-mastering reassurance |
| The BGV vocal test and its fix | same — *"can you point to the human take it came from?"* and *"track a rough human take of that part so the tool can build from it instead"* |
| Samples included, with a label | `.planning/deliberations/sync-catalogue-entry-and-samples.md:107-113` |
| No clearance timeline, ever | same, `:114-117` — an invented *"typically 4-8 weeks"* was nearly adopted |
| One agreement; terms per deal | `lib/sync-library/agreement.ts` recitals — *"This Agreement authorizes Funūn to represent, shop, and negotiate sync licenses… It is not itself a license to any Buyer"* |
| You keep ownership | `lib/sync-library/agreement.ts:82` — *"the Artist retains all ownership of the Songs and their underlying copyrights (composition and master, as applicable). Funūn acquires no ownership"* |
| Withdraw at any time | `app/api/sync-library/[listingId]/withdraw/route.ts` |
| Rejected songs can be resubmitted | `supabase/migrations/096_sync_library.sql:59-62` — the unique index covers active statuses only; *"re-submission after any terminal outcome is allowed without a manual cleanup step"* |
| Funūn guides registration but does not file | `app/(artist)/vault/[projectId]/metadata/registrations/page.tsx` — `buildRegistrationPackages`, `CopyrightFiling`; ASCAP, BMI, SESAC, SOCAN, MLC, SoundExchange, copyright.gov eCO. **Guidance only — the copy must never imply Funūn submits on the artist's behalf.** |

## Open before this ships

1. **Route undecided.** Recommend a public artist-side page mirroring `/sync`.
2. ~~The `unreleased` project type conflicts with the owner's instruction.~~ **RESOLVED and shipped
   2026-09-26.** Owner ruled a finished master is licensable whatever bucket it sits in, reversing
   the 2026-09-09 ruling. Two changes were needed, not one:
   - `SYNC_ELIGIBLE_PROJECT_TYPES` now admits `'unreleased'`; `'snippet'` is the only ineligible
     type, and the staff refusal sentences were rewritten ("finished recordings", not "singles, EPs
     and albums only") because the old wording became false.
   - **The type gate was not the only thing blocking it.** For an `unreleased` project the release
     checklist's `applies_to` table emits only 2 of the 6 sync keys, and the entry gate fails closed
     on an absent key — so opening the type gate alone would have produced a song that is eligible
     and permanently un-admittable. Sync now asks for its six **by name**, via a new `onlyKeys`
     option on `readinessItemsForProject`, instead of inheriting which items exist from a table
     maintained for releases. Release checklists are untouched.

   Full CI gate green: migrations verify, `typecheck:strict`, `lint --max-warnings=0`, 7,745 tests,
   both audits.
3. **"Best two or three songs" is advice, not a limit.** The submit route batches up to
   `MAX_TRACK_IDS = 50`. If it should be a cap, that is a product rule, not copy.
4. **The resubmission sentence is unconfirmed** — true, but the owner has not ruled on including it.
