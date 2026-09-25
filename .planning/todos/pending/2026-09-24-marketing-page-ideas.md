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
| Contract Locker | The paperwork behind your money | `app/(artist)/contracts/page.tsx:208` — "the paperwork behind your money". **Replaced the old "Split sheets and e-sign" row** rather than joining it: Split Sheets is a tab *inside* the Locker (`:213`, `:242`), so listing both was the container and one of its contents. The keyword now lives in the info line. |
| Collaborator profiles | Add once, auto-fill everywhere | `app/(artist)/collaborators/page.tsx:105` — "Your roster — add once, auto-fill everywhere." Fields named in the copy are real columns in migration `018_collaborators_split_sheets.sql`: name, email, phone, pro, ipi, publisher, role. |
| Community access | The Green Room | `components/green-room/GreenRoomHub.tsx:39` — "Share what you're making, find the people you need, and keep your creative relationships close." |
| Antenna | Opportunities, matched to you | Opportunity types verified in `lib/matching/antenna.ts`: `sync`, `placement`, `playlist`, `brand` (plus the `sync_supervisor` / `playlist_curator` / `brand_music_director` counterpart roles). The four named in the copy are real enum values. |
| PitchPlug | The outreach, written for you | The eight audiences named come from `lib/tools/pitchplug.ts:33-75`: Spotify mood/indie curator, SubmitHub blog, Hip-Hop/R&B blog, YouTube channel, college radio, TikTok sound page, sync/licensing platform, venue booker. |
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

## Full artist-workspace inventory (verified 2026-09-25)

Source of truth: `components/nav/ArtistNav.tsx:43-79` (the rail), plus surfaces reached from
elsewhere. Captured because the Free tier was assembled ad hoc and nobody had the whole list.

**Already in the Free tier:** Sound Vault · Collaborators · Green Room ("Community access") ·
Metadata Studio · Release Report · split sheets (one drawer of Contract Locker) · "Rights
checklists" (ambiguous — may or may not mean Rights Coach).

**Not mentioned anywhere in pricing:**

| Surface | Route | What it is |
|---|---|---|
| Writer's Room | `/vault/new` → song door | **The hero of the marketing page, and not a bullet in any tier.** |
| Ideas | `/ideas` | First item in the rail. Capture before it is a song. |
| Messages | `/messages` | "Your direct conversations". Not in the rail — reached via `MessagesIcon`. |
| Contract Locker | `/contracts` | Broader than the split sheets already listed; `alsoMatches: ['/split-sheets']` |
| PitchPlug | `/tools/pitchplug` | AI-written pitch emails |
| Antenna | `/antenna` | "Your Antenna" — opportunity matching |
| Benchmarks | `/benchmarks` | "How your growth compares to artists who broke through at your stage, in your genre" |
| Launchpad | `/launchpad` | "Your release marketing playbook — what to do before, during, and after launch" |
| Rights Coach | `/coach` | Guided rights/registration help |
| Deals | `/deals` | License Requests |
| Earnings | `/earnings` | "Royalties collected across your partners — mechanical, performance, sync & library" |
| Sync Library | `/sync-library` | "Songs Funūn is representing for sync licensing" |

(`/settings` is in the rail but is not a feature to sell. `/dashboard`, `/curators`,
`/opportunities` exist as routes but are not in the artist rail.)

### How these split for pricing

1. **Free-tier candidates** — Writer's Room, Ideas, Messages, Contract Locker (whole). The
   workspace working. The Writer's Room omission is the one actual gap: the hero slide announces
   it and no tier lists it.
2. **Needs the business-model conversation** — PitchPlug, Antenna, Benchmarks, Launchpad, Rights
   Coach. Growth and pitch tools. PitchPlug spends Anthropic API credits per run, so it carries a
   marginal cost the others do not.
3. **Almost certainly not free** — Deals, Earnings, Sync Library. Money moving and Funūn
   representing the catalogue.

**Sync Library must not go in a tier list at all as things stand.** `ArtistNav.tsx` gates it with
`requiresSyncLibraryAccess`, shown only once the artist has ≥1 admitted song, and the code comment
calls it *"progressive disclosure; earned, not given."* Listing it as a plan entitlement would
contradict how it ships.

### Privacy note on Collaborator profiles — verified, not asserted

Owner asked for a line saying collaborator details are shared need-to-know. **A privacy claim about
PII on a public pricing page is a representation, not copy**, so it was checked against RLS before
being written. It holds:

- `collaborators` — `USING (auth.uid() = user_id)` (`018_collaborators_split_sheets.sql:30-31`).
  An artist's roster is readable by that artist only. Nobody else can query it.
- `split_sheet_parties` — two SELECT policies: *"Initiator sees all parties"* and *"Party sees own
  row"* `USING (auth.uid() = user_id)` (`018:82`, `018:89`). A co-writer on a sheet cannot read
  another co-writer's PRO or IPI. Migration 064 rewrote the initiator policy for recursion and
  left the party-row policy explicitly unchanged (`064:181`).

Shipped copy: *"Need-to-know by default. Your roster is yours alone, and on a split sheet each
person sees their own row — not everyone else's details."*

**Deliberately not claimed:** migration 115 also revokes column-level SELECT on `approval_token`
and grants an explicit allowlist instead. That is anti-hijack hardening on an approval link, not
PII minimisation, and dressing it up as a privacy feature would overstate it.

**If the RLS changes, this line has to change.** It is the only sentence on the page that makes a
security promise. A `p:` field on a feature row renders it as a separated line with a lock glyph;
the pattern is reusable but nothing else uses it yet.

### Antenna + PitchPlug in Free — three things to settle

Added 2026-09-25 on owner instruction. Two findings that the copy had to work around:

**1. PitchPlug does not write briefs — it writes cold emails.** The request was to describe it as
crafting "the briefs you need to land the opportunities". Its system prompt
(`lib/tools/pitchplug.ts:98`) reads: *"You write the kind of short, human cold emails that actually
get replies"*, and the API returns `{ subject, body }` (`app/api/tools/pitchplug/route.ts:160`).

In this industry a **brief** is normally the *buyer's* spec — what a supervisor is looking for —
and that artifact lives on the client-partner side (Brief Builder), not in the artist's PitchPlug.
Copy therefore says *"Turns a song into the pitch that lands it."* **If "briefs" meant something
the artist should be able to produce and PitchPlug does not, that is a product gap, not a copy
choice.** Worth a decision.

**2. PitchPlug is metered.** `app/api/tools/pitchplug/route.ts:121` calls `claimAiUsage(...)` and
`finishAiUsage(...)` around each generation — there is an AI admission gate, and every run spends
Anthropic API credits. Listing it under Free without a quota answer promises something uncapped
that is not uncapped. The quota itself was not read; do that before any number goes on the page.

**3. Free is now 10 rows against Studio's 5.** The free column is twice the length of the paid one
directly beside it. Logically defensible (paid tiers lead with "Everything in Writer") but it reads
as though the paid tiers are the thinner offer. This needs fixing before the page is public —
either Free itemises less, or the paid tiers get more of their own rows.

### "Unlock sync opportunities" → The Crate (added 2026-09-25)

Shipped copy: *"The Crate is Funūn's curated sync catalogue — one-stop-licensed, so a supervisor
can clear a song in a single call. Submitting is free. Getting in is earned, and the moment one
song is admitted your Sync Library opens."*

**This resolves the Sync Library problem flagged in the inventory above.** The earlier concern was
that Sync Library could not be a plan entitlement, because `ArtistNav.tsx` gates it behind
`requiresSyncLibraryAccess` — shown only after ≥1 admitted song, commented *"earned, not given."*
The owner's own framing — *unlock*, and *submit* — is the resolution: what is free is the **right
to submit**, not access to the library. The copy says both halves out loud so the page does not
promise the gated thing.

"One-stop-licensed" is from doctrine, not invented: `lib/catalogue/ai-entries.ts:196` — *"the Crate
one-stop-licenses the master."*

**Eligibility rules deliberately left off the pricing page** (`lib/catalogue/ai-entries.ts:183-213`,
owner-refined 2026-08-30). Two disqualifiers and one disclosure tier:

1. **Wholly AI-generated masters** — not eligible, ownership grounds. "No owner to license from."
   Applies even when the composition is human: a genre-flip remix is an AI-rendered master.
2. **AI vocals** — the one hard no, lead or background (the BGV clause). Single test: *"can you
   point to the human take it came from?"* YES → eligible, disclosed. NO → hard no. The one-pass
   fix is to track a rough human take so the tool builds from it.
3. Everything else — AI instrumentation, MIDI, beats, component-level lyric or melody inside an
   otherwise human-produced master — **is eligible and disclosed, full stop.**

These belong on a submission page, not in a pricing tooltip. But they are the answer to "why was
my song rejected", so the marketing page should link somewhere that says it. Noted as a gap.

**Free now stands at 11 rows against Studio's 5.** See the imbalance note above — this is past the
point of being cosmetic.

### Entourage — enterprise pricing (owner copy, 2026-09-25)

**"Entourage" is new. It appears nowhere in `app/`, `components/`, `lib/`, `docs/`, `.planning/`
or `supabase/`** — checked before shipping it. Owner coined it in session as the name for
enterprise/volume pricing. Recording the origin so that when it is built nobody goes looking for a
prior definition that does not exist.

Shipped on the bench as a **band under the pricing grid, not a fourth card** — a card would read as
another tier to choose from, a band reads as a door out of the grid:

> **Got a large team?**
> Talk to us about Entourage pricing — volume discounts for rosters, labels and management
> companies. → *Talk to us*

"Rosters, labels and management companies" is an inference about who a large team is, not something
verified against the product. If Entourage is aimed at someone else — publishers, sync agencies,
production houses — that line should change.

**Why a band and not a fourth card** (owner asked, 2026-09-25):

Three cards is the standard because it creates a middle to anchor on — the "most chosen" tier sits
centre and carries the weight. A fourth removes the centre, drops each card from a third of the
width to a quarter so every feature list wraps harder, and breaks to 2x2 on tablet, which reads as
two separate comparisons. The specific killer: **enterprise has no price**, so a fourth card shows
an empty slot where the other three show a number — that reads as broken, not bespoke.

The band originally looked unfinished, and that was materials rather than shape: thinner radius,
less padding, no card fill. Now it uses `.pcard`'s exact border, fill, radius and padding
(verified equal in the DOM, not by eye), with a soft radial light from the CTA end so a very wide
band does not have dead space in the middle. Same family, different shape.

**Open:** is Entourage a *tier* (a fourth card with its own entitlements) or a *discount program*
applied to Room seats? The bench treats it as the second, because it is a band and not a card. That
is a real pricing-model decision, not a layout one, and it belongs in the business-model
conversation with the rest of the tiers.

### Free tier — final row order (2026-09-25)

Writer's Room added first (it is what the hero announces, and the inventory above flagged its
absence as the one real gap). Sound Vault moved to third on owner direction.

1. The Writer's Room — *Where the song gets written.* Copy from `app/(artist)/vault/new/page.tsx:126-129`
2. Unlimited songs and takes
3. Sound Vault
4. Contract Locker
5. Collaborator profiles (+ privacy line)
6. Rights checklists
7. Community access
8. Metadata Studio
9. Antenna
10. Unlock sync opportunities
11. PitchPlug
12. Release Report

Ten of the twelve carry an info popover. **12 rows against Studio's 5 and Room's 5** — the
imbalance noted above is now at its widest and needs a layout answer before the page is public.

### Codex copy review — prepared, not yet run

Prompt written to the session scratchpad as `codex-copy-review-prompt.md`. It asks for line-level
rewrites, overclaim flags, terminology inconsistencies, a verdict on the hero lede's "first of its
kind" claim, and three to five replacement taglines — returned as a single copy-paste-ready fenced
block.

**The copy travels inline in the prompt rather than by repo reference, on purpose.** The bench file
is gitignored (`.gitignore:45`), so Codex cannot read it — and the invented pricing numbers should
not be committed to a public repository just to make them reviewable.

## Studio repositioned as the AI tier (2026-09-25)

Owner: *"Add PitchPlug to Studio since it requires AI and that costs us money"*, then *"find a way
to describe all these AI powered tools for that most chosen card."*

PitchPlug moved out of Free. Studio now leads with the whole bench:

- `The whole AI tool bench` → *Eleven tools, one subscription.* Names PitchPlug, EPK.fyi,
  DropReady, SoundBait, SpotPitch, DistroAdvisor, RoyaltyAudit, then covers contract review,
  document drafting, campaign planning and auto-tagging.
- `AI contract check` → *Read before you sign.* Completeness and accuracy, "not legal advice, and
  it does not pretend to be" — matching the boundary `lib/contracts/verify.ts` already draws.

**This is a better pricing story than it was.** Studio previously offered storage, export and
support — no reason to exist. "The tier where the AI lives" is a reason, and it puts the metered
cost consistently behind the paywall. Counts: Free 11, Studio 7, Room 5, which also narrows the
imbalance that has been flagged three times.

Every tool named is a shipped Anthropic-backed surface, verified 2026-09-25 by grepping
`@anthropic-ai/sdk` and `claimAiUsage` across `app/` and `lib/`.

### Two consequences that are product decisions, not copy

**1. The line now cuts through Contract Locker and the vault tools.** AI contract verification is
reached from `components/contracts/ContractUpload.tsx` — inside the Locker, which is a **Free**
row. AI document generation is reached from `components/vault/ToolSidePanel.tsx`. Putting "AI
contract check" in Studio means the free Contract Locker becomes storage and status only, with the
reading behind the paywall. That may well be right, but it is a change to what the free product
does, and it is not visible from the pricing card alone.

**2. Studio's blurb no longer matches.** *"For people cutting keepers, not sketches"* describes
audio quality — the old positioning. If Studio is the AI tier, the blurb should say so. Left
unchanged deliberately; Codex has been asked to propose a replacement.

### Also unpriced

The six registry tools (`lib/tools/registry.ts:23-65`) — EPK.fyi, DropReady, SoundBait,
DistroAdvisor, RoyaltyAudit, SpotPitch — appear in **no tier as named rows**, only inside the AI
bench popover. If any is meant to be separately gated or separately sold, nothing says so.

### Model versions — unrelated but found while surveying

Two model strings are hardcoded across the AI surfaces: `claude-sonnet-4-6` (10 occurrences) and
`claude-sonnet-4-20250514` (7). `lib/anthropic/index.ts:4` exports the latter as the shared
`MODEL`, and several routes ignore it and hardcode their own. Both are older than current Sonnet 5
/ Opus 5. Two separate issues: a constant that should be one import, and a model refresh that
moves both output quality and cost. Not a marketing item — logged here so it is not lost.

### Overclaim caught: "Unlimited songs and takes" → "Unlimited songs" (2026-09-25)

Owner: *"we cannot say Unlimited Songs and Takes, only the songs are unlimited but once we add so
much audio we have to charge for that storage."* Correct, and it was the clearest overclaim on the
page. Replaced with:

> **Unlimited songs** → *The song count is never the limit.* Start as many songs as you want —
> nothing meters how much you write. Audio is the part that costs: takes and masters use storage,
> and that is what the paid tiers raise.

**No number is stated, deliberately.** What the code actually enforces today:

- **Per-file caps exist.** 50MB per take (`lib/catalogue/audio-mime.ts:13`), 250MB per track
  (`lib/storage/index.ts:7`), 25MB for lyric lift (`lib/catalogue/lyric-lift.ts:3`).
- **No account-level storage cap is enforced.** Storage *is* metered —
  `storage_bytes_ingested` in `lib/workspaces/usage.ts` and migration
  `222_workspace_usage_metering.sql` — but 222:6 states it plainly: *"it does not enforce a limit,
  consume a Member credit, or authorize access"*, and `usage.ts:130` says *"Beta usage is
  observational. Failure must never block the underlying action."*

**So the page now implies a ceiling the product does not apply.** "That is what the paid tiers
raise" and Studio's existing "Larger take storage" both describe a limit that exists as a
measurement and not as an enforcement. That is fine for a page that is not live, but the cap has to
be real before this ships — otherwise the first free user to upload 80GB is a support conversation
nobody planned. Either implement enforcement, or soften both lines.

The metering plumbing being already built is the good news: `WORKSPACE_USAGE_METRICS` also tracks
`ai_requests`, `ai_input_tokens`, `ai_output_tokens`, `esign_requests` and
`audio_processing_seconds` — so the cost basis for the whole tier conversation is already being
observed, just not billed against.

## Free tier audio allowance — OPEN, sent to Codex (2026-09-25)

Owner: *"we need to decide on how many audio takes and wav storage until we ask them to upgrade to
Studio"*, then chose to get a second opinion before deciding.

### The measured cost basis

Derived from what the code writes, not estimated:

| Path | Format | Per minute | 2 GB holds |
|---|---|---|---|
| Hum / punch capture | `audio/webm;codecs=opus` ~96 kbps | **0.72 MB** | ~47 hours |
| Rendered stem + mix | 16-bit WAV stereo, `encodeWav()` | **10.6 MB** | 64 three-min mixes |
| Studio lossless | 24-bit/48k WAV stereo | **17.3 MB** | 39 three-min mixes |
| Uploaded master | any, 250 MB cap per track | — | 8 maxed uploads |

Sources: codec order `lib/catalogue/hum-capture.ts:36-40`; `encodeWav()` writes 16-bit PCM at
native rate, `min(2, channels)` — `lib/catalogue/record-over-beat.ts:89-111`, used for stem and mix
at `RecordOverBeatStudio.tsx:620,650`.

### The finding that should drive the decision

**Capping takes is the wrong lever.** A take costs 0.72 MB/min — a user would have to hum for 47
hours to reach 2 GB. A take cap therefore saves almost nothing while penalising the single
behaviour the product most wants (living in the Writer's Room). The cost sits in WAV: stems, mixes
and uploads, 15x more per minute.

That line is already half-drawn on the pricing card — Studio advertises `Lossless 24-bit capture`.
Recommended shape was **unlimited takes + a meter on lossless/uploads only**.

### Still unresolved

- **Egress, not storage, is probably the real cost.** At 2 GB, storage is cents per user per month.
  Repeated playback of one's own takes may dominate. Actual Supabase rates on the current plan were
  deliberately not quoted from memory — they need checking before any number is locked.
- **Nothing enforces a cap today** (222:6). Stating a limit on the page before the product applies
  one is a promise in the wrong direction.

Sent to Codex as a second section of the copy-review prompt, asking specifically whether capping
takes is ever right, whether egress changes the shape, whether to state a limit before enforcement
exists, and what the upgrade moment should feel like.

### Bug found while reviewing the full page: the carousel was never cycling (2026-09-25)

All three hero slides were rendering **stacked vertically** — `heroA` at y=88, `heroB` at 975,
`heroC` at 1823 — so the page opened with three heroes in a row instead of one rotating slide.
Page height was 4,988px; it is 3,253px with the fix.

The JS was fine. `showSlide()`, the dots, the dwell timer and hover-pause all worked and were
correctly toggling an `.on` class. **The CSS was losing on specificity:**

```css
.slide{display:none}        /* specificity 10 */
#heroA{…display:grid…}      /* specificity 100 — wins */
```

and `#heroC` carries an **inline** `style="…display:grid…"`, which beats any selector at all.

Fixed with `.slide:not(.on){display:none!important}` — only the *hiding* is forced, so each slide
keeps its own natural display (grid for A and C, block for B) when shown.

**This is the third time this session an ID or inline rule silently beat a display toggle** — the
earlier two were `[hidden]` losing to `#heroA{display:grid}` and to `.mcount`, both fixed with the
`[hidden]{display:none!important}` guard further down the stylesheet. That guard did not cover this
one because the carousel toggles a class, not the `hidden` attribute.

**Rule for this file:** any element whose visibility is toggled should use the `hidden` attribute,
not a bespoke class, so the one existing `!important` guard covers it. Worth a pass to convert
`.slide` to `hidden` if the carousel survives into the real page.

## 21st.dev `animated-tooltip` — verdict and what was taken (2026-09-25)

**Cannot drop in.** Every dependency is absent from Funūn, verified 2026-09-25: `framer-motion`,
`tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react`, the `cn()` helper
(`lib/utils.ts` does not exist), the shadcn `foreground`/`background`/`muted-foreground` tokens
(**zero** matches in `tailwind.config.ts`), and `next/image` (unused anywhere in the repo — the
presence band uses a raw `<img>` with an eslint-disable).

**Wrong component for the pricing rows,** independent of dependencies:

- Hover-only. The pricing popovers hold 2–3 sentences; hover does not exist on touch and you cannot
  move a pointer into a panel that closes when you leave the trigger. These are toggletips
  (click-triggered) on purpose.
- Its trigger is a 56px circular `<Image>`, not an ⓘ button.
- `whiteSpace: "nowrap"` — built for a name and a job title. The Writer's Room popover is ~180
  characters and would run off-screen.
- Fixed `-top-16`, no flip logic. Rows near the bottom of a card would push it off.

**Right component for a different surface:** it is an avatar-stack tooltip, and Funūn has an avatar
stack — `components/catalogue/WriterRoomPresence.tsx`, plus the collapsing-pill→avatars variant on
bench 01. If it gets ported anywhere, it is there. Port cost is the same list above: rewrite
framer-motion as WAAPI/CSS, drop `cn()`, map tokens, swap `next/image` for `<img>`.

### What was taken instead (look, not code)

1. **Spring entrance.** The source pops in at `scale 0.6` with overshoot (framer spring, stiffness
   260 / damping 10). Approximated in `@keyframes fpop-in` — scale .82 → 1.025 → .995 → 1 over
   340ms. The popovers previously had **no animation at all**. Respects
   `prefers-reduced-motion`.
2. **The two fading hairlines** along the bottom edge — the detail that makes the source read as
   crafted. Theirs are emerald + sky; these are the Funūn gradient endpoints, as two background
   gradients on one `<i class="fline">` at different widths and offsets.
3. **Deliberately NOT taken: the mouse-tracking tilt.** It rotates the card −45°..45° by cursor X.
   That only makes sense on a hover trigger; these panels open on click and stay open, so there is
   no cursor to track.

### Two real bugs this surfaced

**1. The bench was never rendering the product's font.** `app/layout.tsx:2` loads Inter and wires it
as `--font-sans` (`tailwind.config.ts:31`), but `marketing.html` used a bare
`ui-sans-serif, system-ui, …` stack — SF Pro on this Mac. **Every screenshot reviewed so far has
been the wrong typeface.** Inter is now loaded in the bench and confirmed active.

**2. The popover heading was smaller than its own body text** — 11px heading over 12px body. The
source's hierarchy is 16px bold name over 12px designation, and that contrast is most of why it
looked better. Heading is now 14.5px at -.012em.


### Popovers restyled to the source palette + possessive headings (2026-09-25)

Owner: *"use their colors and font design"*, then *"say Your Masters, etc here, so it feels like
theirs."*

**Inverted to the source's palette.** shadcn's `bg-foreground` / `text-background` render as a
near-white card with near-black type on a dark page, and that inversion is most of why the
reference looked lifted rather than cut into the surface. Now `#fafafa` panel, `#09090b` heading,
`#71717a` body, with the source's own `emerald-500` / `sky-500` hairlines instead of the Funūn
substitutes.

**Type scale matched:** 16px/700 heading over 12px body — the source's `text-base font-bold` over
`text-xs`. It had been 11px over 12px, i.e. the heading was *smaller* than its own body copy.

**Possessive headings**, applied to four of twelve — not all, because "your" on every row reads as
a sales tic:

- Sound Vault → *Your masters, artwork and documents*
- Metadata Studio → *Your release metadata*
- Writer's Room → *Where your song gets written*
- Antenna → *Opportunities, matched to your catalogue*

**Writer's Room copy extended** with notes and comments: *"Notes and comments land on the line they
are about, not in a thread nobody reads."*

**Live chat deliberately not claimed.** Owner asked for "notes and chat". Studio Notes is shipped
(`lib/catalogue/studio-notes.ts`, 246 lines) and per-block lyric comments are shipped
(`components/catalogue/LyricCommentsPanel.tsx`), but **there is no room-chat component in the
repo** — it is a bench concept from 2026-09-24. Naming it would be advertising something unbuilt.
If chat ships, the copy can add it.

**Bugs avoided in the restyle:** `overflow:hidden` was added to clip the hairlines to the rounded
corners, which would have clipped the arrow (`top:-4px`) and the hairlines (`bottom:-1px`) — both
sit outside the box. Removed; hairlines moved to `bottom:0` instead.
