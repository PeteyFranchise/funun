# Marketing page — idea board

**Created:** 2026-09-24 · **Status:** parking lot, nothing scheduled
**Why this file:** marketing ideas were scattering across three todos. This is the hub — the
idea board and the asset list live here; the deep write-ups stay in their own files below.

## Related files

| File | Holds |
|---|---|
| `2026-09-24-marketing-site-needed.md` | Whether it is part of the Next app or a separate static site (the first question, and it has a GitHub Pages constraint attached). Also the full neon-sign layer split and both Midjourney prompts. |
| `2026-09-24-design-picks-for-later.md` | The six 21st.dev picks harvested 2026-09-24, each with a verdict and the Tailwind-4-vs-3.4 traps found in its source. |
| `private/bench/marketing.html` | Working prototype, gitignored. Serve it: `python3 -m http.server 4321` from `private/bench`, then `/marketing.html`. |

## Idea board

| Idea | Status | Blocked on |
|---|---|---|
| Illuminated hero on flat black | **KEEP** — built, on the bench | Midjourney facade plate (MJ-1) |
| Voice testimonials | **KEEP** | Real customers who will record |
| Hero carousel, 3 slides | **PARTIAL** — slide 1 built, 2 and 3 are placeholders | Deciding what 2 and 3 each showcase |
| Image stream corridor | **DEFERRED** | Artist artwork volume — see below |
| Pricing table | **REBUILT** — owner says it does not hit like the source | Needs its own pass |
| Footer | **REVISIT** — rebuilt, does not match the reference | Needs its own pass |
| Radial glow background | **CUT** | — |

### Carousel slides 2 and 3 — undecided

Each is meant to showcase "something unique about Funūn." Slide 1 is the Writer's Room. Candidates
worth considering, none chosen: splits that are settled before anyone asks; every line remembering
who wrote it; the Sound Vault readiness gate; takes and versions. **These are probably product
screenshots, not Midjourney renders** — the thing that is unique is the software, and a generated
image of software is a picture of something that does not exist.

### Image stream corridor — deferred, not dead

Deferred on **inventory**, not on the idea. The corridor only works if the cards are real album
artwork from real Funūn artists. Placeholder squares read worse than no corridor, and stock art
would misrepresent who is on the platform.

**Trigger to revisit:** enough artwork in the catalogue to fill two rails without repeats and
without one artist dominating — roughly 24+ distinct covers across 12+ artists, so it reads as a
roster and not a slideshow.

**Questions it comes back with:** does an artist opt in to appearing? does a card link to their
profile or their release? live from the catalogue, or a curated list? (Live means an unfinished
cover can land on the homepage.)

Prototype survives on the bench under the "Hero: image stream" toggle. The CSS-only 3D corridor is
the part that took the work — `perspective` + `transform-style: preserve-3d` on `.corridor`, kept
off `#heroB` because `container-type` applies layout containment and flattens it.

## Midjourney asset list

Nothing here is urgent — the page is not scheduled. Full prompt text for MJ-1 is in
`2026-09-24-marketing-site-needed.md`.

| ID | Asset | Status | Notes |
|---|---|---|---|
| MJ-1 | Nashville bar facade, night, **empty** unlit sign cabinet, mounting rail + drop rods, building dissolving to black | Prompt written, not run | The words stay live CSS text on top — see below |
| MJ-2 | Fallback: the same facade **with** "Writer's Room" rendered in the sign | Prompt written, not run | Only if MJ-1's composite refuses to sit right. Expect to fight the lettering. |
| MJ-3 | Wall / brick / plaster texture plates | Not prompted | Only if MJ-1 does not already supply enough wall |
| MJ-4 | Slides 2 and 3 imagery | **Cannot prompt yet** | Subjects undecided, and they are likely screenshots not renders |

**The words are not a Midjourney job.** They are the `<h1>` — baked into a raster they are invisible
to search and to screen readers. MJ also mangles typography, and the apostrophe in "Writer's Room"
is a reroll loop waiting to happen. Keeping them live also keeps the ignition-stutter and flicker
animations, and lets the copy change without a regeneration.

**Do not generate human faces for testimonials.** Voice testimonials are a KEEP because they come
from real customers. A generated face attached to a quote is a fabricated endorsement, whatever the
quote says. If a face is needed and no real one exists, ship without one.

**Watch when MJ-1 comes back:** it will try to put text in an empty cabinet (`--no text` helps, is
not reliable — crop or mask); the ambient has to land near `#818cf8`/`#d946ef` or the live text
reads as pasted on; a photographic hero is dark-only; preload it and give the cabinet a CSS
fallback so the text is legible before the plate lands.

## Copy — tagline removal (touches shipped code)

Owner, 2026-09-24: *"I don't want to see 'The operating System for your music career' anywhere
anymore."* Reason given — it is a generic AI-suggested line now shared with a large number of other
music apps, so it cannot differentiate Funūn.

Verified by grep against the working tree, 2026-09-24:

- `app/(auth)/layout.tsx:18` — exact string, under the wordmark on signin/signup
- `app/unsubscribe/page.tsx:176` — exact string, same treatment
- `app/layout.tsx:14` — **a variant**, not the exact string: *"The operating system for an
  independent music career — built around Sound Vault."* This is the `metadata.description`, so it
  is what shows in search results and link previews. Highest visibility of the three.

(`.claude/worktrees/zen-yalow-0b7a42/` also contains copies. That is a worktree, not the live app.)

Replacement copy is **not decided**. Preference is to pull from language the repo already uses
rather than generate a new line — `docs/marketing/funun-launch-copy-brief.md`,
`docs/pitch-deck-copy-bank.md`, and the in-app voice in `components/catalogue/ComposerCard.tsx`
are the places to mine. Three surfaces may not want the same line: a meta description has a
different job than a wordmark subtitle.

## Hero lede — current wording

Replaced the tagline in the bench hero with, per owner direction that it should describe the room
as interactive, collaborative, and first of its kind for topline writing:

> The first room built for writing a topline together. See who's in it, who's on which section, and
> every line remembers who wrote it.

Not ratified. "First of its kind" is a claim worth checking before it goes on a public page.

## Free tier contents (bench, 2026-09-25)

Owner added four surfaces to the Free/"Writer" tier so they would not be forgotten. Each carries
an info button (a real `<button>`, not a hover tooltip — works on touch, reaches the keyboard,
one open at a time, closes on outside click or Escape).

**The info copy is lifted from the shipped surfaces, not written for marketing.** Verified
2026-09-25:

| Row | Heading | Copy source |
|---|---|---|
| Community access | The Green Room | `components/green-room/GreenRoomHub.tsx:39` — "Share what you're making, find the people you need, and keep your creative relationships close." |
| Sound Vault | Masters, artwork and documents | Paraphrased from the vault readiness model (`app/(artist)/vault/page.tsx`, `lib/vault/readiness.ts`). **The only one of the four not lifted verbatim** — there is no single shipped lede for the Vault. Worth writing one properly. |
| Metadata Studio | Release metadata | `components/vault/MetadataStudio.tsx:341` — "Everything radio, DJs, licensing, and distributors need — captured once, exported anywhere." |
| Release Report | Take it out | `app/(artist)/vault/new/page.tsx:141` — "Build a single, snippet, EP, or album with the full readiness checklist for going out." |

### Open questions

- **Free now shows 8 rows against Studio's 5.** Logically fine — the paid tiers lead with
  "Everything in Writer" so they inherit all eight — but visually the free column is the longest,
  which is the opposite of what a pricing table usually wants to say. Either trim what Free
  itemises or give the paid tiers more of their own rows.
- **Is all of this actually free?** These are placeholder tiers; the business model is undecided
  (`2026-09-24-marketing-site-needed.md`). Putting Sound Vault, Metadata Studio and Release Report
  under Free is a pricing claim, not a design choice — it needs the business-model conversation
  before it goes on a public page.
- The info pattern is generic: any feature row can become `{t, h, i}` instead of a plain string.
  Only these four use it so far.
