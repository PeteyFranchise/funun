# Testimonials: where does the audio come from, and how does anyone submit one?

**Captured:** 2026-09-25 · **Status:** open — product + legal + ops, not a build task yet
**Surface:** marketing page section 04 "Voices" (`private/bench/marketing.html`, `#voices`)
**Owner asked:** *"how do we populate the audio in these testimonial cards? How can someone
submit a testimonial? And the logistics surrounding this part of the website page."*

## What is actually on the page today

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
