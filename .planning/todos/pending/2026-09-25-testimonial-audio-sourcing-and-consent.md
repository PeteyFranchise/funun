# Testimonials: where does the audio come from, and how does anyone submit one?

**Captured:** 2026-09-25 · **Status:** format DECIDED (both) · sourcing, consent and ops still open
**Surface:** marketing page section 04 "Voices" (`private/bench/marketing.html`, `#voices`)
**Owner asked:** *"how do we populate the audio in these testimonial cards? How can someone
submit a testimonial? And the logistics surrounding this part of the website page."*

## DECIDED 2026-09-25: both formats, one grid

Owner: *"let's do text quotes and also figure out how to do audio quotes like the ones seen here
as well, so we can use both."* And, on what the clips are for: *"aren't these little audio
snippets supposed to be people talking about things they like about Funūn, recorded
testimonials?"* — yes. That is the section. We have none yet because nobody has been asked.

So the card takes either shape and the switch is one field: **an entry with no `a` renders as a
text quote, an entry with `a` gets a player.** The section can ship as text and gain audio one
person at a time, which matches how these will actually arrive.

### The audio mechanism, built and verified

- **Peaks are data, not something the page works out.** The clip and its peak array are produced
  together at ingest by `private/bench/tools/audio-peaks.py` (copied to the Desktop backup, since
  `private/` is gitignored) — ffmpeg decodes to 8kHz mono PCM, python buckets it into 40 RMS
  values normalised to the loudest. A card then costs one mp3 plus forty numbers. No
  `AudioContext`, no fetch-and-decode on load.
- **`preload="none"`.** Verified: zero network requests for the clip until the play button is
  pressed, so the page costs nothing on a phone for a visitor who never plays one.
- **Real `<audio>`, driven by `timeupdate`.** Verified playing: `currentTime` 2.62 of a real
  `duration` 11.44, 8 of 40 bars lit, `aria-valuenow` 22, running time counting. Pause, the
  `ended` reset and one-clip-at-a-time all verified.
- **Scrubbing needs a Range-capable host.** python's `http.server` sends no `Accept-Ranges`, so on
  the bench Chrome reports `seekable.end` as **0 even after a full playthrough** and any seek
  clamps to zero and restarts the clip — which reads worse than a dead control. The handler now
  refuses to scrub unless the whole clip is seekable. Verified both ways: inert on 4321, and
  against a throwaway Range-capable server on 4322 it scrubbed to **8.57s against a target of
  8.58s** with 29/40 bars lit. Vercel and Supabase Storage both answer Range.
- **A clip that 404s removes its own player**, leaving a clean text quote rather than a dead
  button on a public page.

### The placeholder clip is synthetic on purpose

First attempt used 28 seconds of *Morning Light* as a stand-in. Owner, immediately: *"it's playing
a song I wrote, that shouldn't be there."* Right — a placeholder must not be anyone's work,
because a placeholder is exactly the thing that survives to production by accident. Replaced with
macOS `say` output that announces itself: *"This is a placeholder clip. It is not a real
testimonial, and it is nobody's voice…"* 11 seconds, 68KB. If it ever leaks into a build it says
so out loud. (The Selects mock in section 03 still shows Maya Reyes artwork and a *Morning Light*
track title — that is cover art and a title in a mockup, nothing plays, and it was an explicit
earlier choice. Flagging it only so the call is conscious.)

### Sourcing — a proposal to react to (2026-09-26)

Owner asked the sourcing question again, so here it is as something concrete rather than a list of
unknowns. The build is not the hard part; none of this is engineering.

**Who.** Beta members, and the population is *tiny* — invite-only, a known list. This is not a
campaign, it is a handful of conversations. That is an advantage: a personal ask from a person
converts far better than a broadcast, and at this size a broadcast would look desperate.

**When.** After a value moment, not on a schedule. The three that actually land:
a split sheet that completed itself · a song going out with its credits already filled in · a Crate
admission. Asking at a moment someone just felt something beats asking on day 30.

**What to ask for — the part most people get wrong.** Not *"would you say something nice about
Funūn."* That produces "Funūn is great!", which is worth nothing on a page. Ask for **the specific
moment**: *"You didn't have to chase anyone for that split sheet — what would you have been doing
instead?"* The three placeholder quotes already on the bench are the right shape, and they are the
shape because each one names a thing that stopped happening.

**The release.** Must cover name, role, city, the words, and — for audio — the voice. **Revocable,
and revocation has to be fast**, which is an argument against baking testimonials into a static
build. Who holds the signed releases is an open question: the Contract Locker is member-owned
storage, and a testimonial release is a Funūn-side document, so it is probably not the home.

**Where the files live.** Not `release-audio` / `release-assets` / `release-documents` — those are
member release material. A testimonial clip is public by design and needs its own path.

**Who approves.** `marketing` is a real `StaffRole`, so there is an owner for this.

**Start with text.** Text quotes need consent and nothing else. Audio needs a recording, a release,
hosting, a transcript and a moderation path. Ship text from the first two or three people who say
yes, and add audio for whoever is comfortable recording. The grid already takes both — that was the
whole point of the format decision.

### Still open after that

What the release document actually says (counsel), where signed releases are filed, and whether a
transcript is published alongside each clip or only available on request.

## What the page did before this (kept, because it explains the shape)

**There is no audio.** Not a missing file, not an unwired player — no audio concept at all:

- `VOICES` (marketing.html:987) holds three people, each with a quote and a *number* `d` (41, 33,
  28). That number is the printed duration. There is no URL field.
- The waveform is `peaks(seed, 40)` (marketing.html:995) — forty bars whose heights come from
  `Math.sin(i*7.13+seed)*43758.5453`, shaped by a sine envelope. It is deterministic noise that
  looks like speech.
- `toggleVoice()` (marketing.html:1035) starts a `setInterval` that advances a progress fraction
  by `0.1/d` every 100ms and recolours bars left-to-right. It plays nothing. There is no
  `<audio>`, no `AudioContext`, no fetch.

So the section currently ships **three play buttons that make no sound.** That is fine on a bench
and is a defect the moment this page is public — it is the one thing on the page that actively
misleads rather than merely being a placeholder. Whatever is decided below, the port cannot carry
the mock player across unchanged.

**Nothing in the product supports this yet either.** `grep -rniE "testimonial"` over `*.ts`,
`*.tsx`, `*.sql` returns zero hits outside planning docs. There is no table, no route, no bucket,
no admin surface.

## The questions to answer

### 1. Is audio the right format at all?

The cheapest honest version of this section is text quotes with a name and role, which needs
consent but no recording, hosting, player, transcript or moderation. Audio buys authenticity —
hearing a songwriter say it is worth more than reading it on a rights product's marketing page —
at the cost of every item below. **Decide this first; most of the rest only exists if the answer
is audio.** A middle option: text quotes now, audio added later for the two or three people who
are happy to record.

### 2. Where would a recording come from?

- **Asked for directly** — a call with a beta member, recorded with permission, clipped to ~30s.
  Highest quality, does not scale, and is how the first three would realistically be gathered.
- **Recorded in-app** — a prompt at a moment of value ("your split sheet completed itself — tell
  us how that went?") capturing straight to the browser. Scales, but is a build, and it puts a
  marketing capture flow inside the workspace.
- **Harvested from something that already exists** — Green Room posts, Studio Notes. Almost
  certainly wrong: those were written for other people in the product, not for the public web.
  Repurposing them is exactly the consent failure this section's own placeholder note warns about.

### 3. What consent is required, and is any of it already built?

A public marketing page using someone's **name, role, city, voice and words** needs an explicit
release, revocable, with a record of what was agreed and when. Two things worth stating plainly:

- **`lib/workspaces/consent-service.ts` is not this.** It is the writer of
  `source = 'member_consent'` rows on `workspace_grants` — consent to *workspace access*. Nothing
  in it covers likeness, voice or publicity. Do not reach for it because the word matches.
- Funūn sells rights hygiene. Publishing a member's voice on a marketing page without a written,
  revocable release would be the single most quotable contradiction available to a competitor.
  The bar here is higher for us than for a normal SaaS landing page, not lower.

Revocation is the part that usually gets skipped: "take me off the site" has to be a thing
someone can do, and it has to be fast, which argues against baking audio into a static build.

### 4. Hosting and swapping

Existing buckets are `release-audio`, `release-assets`, `release-documents`
(`lib/storage/index.ts:3-5`) — all member release material, none public marketing. A testimonial
clip is public-by-design and does not belong in any of them. Needs its own bucket or a plain
static asset path, plus a decision on whether swapping a quote requires a deploy.

### 5. Player and accessibility

If audio ships: a real waveform (decoded peaks, or peaks precomputed at upload — not
`Math.sin`), one-at-a-time playback, no autoplay, a visible duration that matches the file, and a
**transcript**. Audio-only content needs a text alternative; the quote is a pull-quote, not a
transcript of the clip, so today's text does not satisfy it. Also decide mobile behaviour — three
clips that download on page load is a real cost on a phone.

### 6. Ops

Who asks, who approves, who holds the signed releases, how many cards the section shows, how
often they rotate, and what happens when the person in card two leaves the platform or starts
using a competitor.

## Related

- The section's own on-page warning already states the principle: *"Real testimonials need real
  consent — the same opt-in the hero covers use."* Same constraint, and the hero covers question
  is still open too.
- Hero art is also still placeholder — both are blockers on this page going public.
- `.planning/todos/pending/2026-09-24-marketing-page-ideas.md` is the hub for this page.
