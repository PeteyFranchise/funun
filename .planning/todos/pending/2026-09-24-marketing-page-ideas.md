# Marketing page — idea board

**Created:** 2026-09-24 · **Status:** parking lot, nothing scheduled
**Why this file:** marketing ideas were scattering across three todos. This is the hub — the
idea board and the asset list live here; the deep write-ups stay in their own files below.

## Audience — decided 2026-09-25

**This page is for a later public launch, not for the current beta partners.** Owner, 2026-09-25:
*"we are building this landing page for a little later, not for our current beta partners."*

That matters for how every open question on this page gets read:

- The tier names, prices and the Entourage band describe a **future** commercial shape. They are not
  a description of what beta partners have, and nothing here should be shown to them as if it were.
- Beta doctrine is explicitly different: `docs/architecture/ACCOUNT-TYPES.md` — *"During beta,
  workspaces begin on a free active plan while seat, roster, storage, AI, e-sign, and
  audio-processing usage is measured but not enforced."* A page advertising paid tiers and storage
  limits is describing a state that does not exist yet and will not during beta.
- So the enforcement gaps flagged throughout (no storage cap, PitchPlug's unstated quota, two
  storage rows implying two pools) are **not blockers on the page** — they are blockers on
  *publishing* it. The page can be finished; it cannot go live ahead of the billing work.

**"Room" is a bench placeholder, not a Funūn account tier.** Checked 2026-09-25: no named
subscription tiers exist anywhere in the repo, and there is no customer-success role. The dedicated
named human that does exist in doctrine is one **Account Executive per Client Partner org**
(migration `090_buyer_orgs_ae_assignment`, leadership-assigned, never automatic) — buyer side, not
artist subscribers. A dedicated-success-person benefit on a paid artist tier would be new product;
the AE model is the precedent to copy.

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

**RESOLVED 2026-09-25 (owner):** *"I almost want this to be a fourth tier, but not with its own
card, like a custom tier for companies and labels."* It **is** a fourth tier — deliberately in a
band rather than a card.

That makes Codex's objection a description of the intent rather than a fault. What was actually
wrong was the copy: *"volume discounts"* reads as a promotion, not a tier. The band now carries a
tier's anatomy in a band's shape:

> **Entourage**  `CUSTOM`
> Labels, management companies and multi-artist rosters
> Everything in Room, scoped to your organisation — seats, roles and services built around how your
> team already works.
> → Talk to us

Three things make it read as a tier rather than a promo: **a name in the price position** (`CUSTOM`
where the cards show a number), **an audience line** matching the cards' `who`, and **"Everything in
Room"**, which is the same inheritance phrasing the other tiers use and places it above Room in the
ladder.

Still no fourth card, which also preserves the reason the band exists: enterprise has no price, and
a fourth card would show an empty slot where the other three show a number.

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

### AI bench popover: prose → bulleted list (2026-09-25)

Owner: *"give this more bullet-like format instead of a huge paragraph. easier on the eyes."*
Correct — seven product names inside running prose is the hardest possible way to scan seven
product names.

The popover now takes an optional `l:` array instead of `i:` prose. Each entry is either
`[name, description]` (rendered `<strong>name</strong> — description`) or a plain string for a
trailing catch-all line. Eight rows, one per tool plus the "plus…" line.

**Specificity note:** `.fpop ul li` is scoped at three parts (12) deliberately, because the popover
lives *inside* a `.pcard li` (11) and would otherwise inherit the pricing row's 13.5px lavender
styling. Same class of collision as the carousel bug — worth checking any new nested list in this
file against `.pcard li` before assuming it is unstyled.

The pattern is reusable: any feature row can now swap `i:` for `l:`. Only the AI bench uses it.

### Voice pass started — "make this sound more human" (2026-09-25)

Owner flagged the `Unlimited songs` popover. Three things were making it stiff, and all three are
systemic rather than local:

1. **Abstract nouns doing verb work.** *"nothing meters how much you write"* — "meters" is a
   utility-billing verb. Elsewhere: "surfaced against", "captured once".
2. **Internal framing leaking out.** *"Audio is the part that costs"* is a sentence from a margin
   discussion, not something you say to a writer. It tells them about our cost structure instead of
   their experience.
3. **No contractions anywhere.** "that is what", "you are pitching", "they are about", "it is not".
   Formal register reads as corporate, and it is the cheapest thing to fix.

Rewritten:

| | |
|---|---|
| Was | **The song count is never the limit** — Start as many songs as you want — nothing meters how much you write. Audio is the part that costs: takes and masters use storage, and that is what the paid tiers raise. |
| Now | **We don't count songs** — Start as many as you want. Nobody should have to decide whether an idea deserves a slot. Audio's the part that adds up — takes and masters take up real room, and that's what you're paying for when you move up. |

The new middle sentence is the point: it gives a *reason* with a point of view rather than stating
a policy. That is the difference between product copy and a terms page.

**The rest of the popovers have not had this pass.** Codex's prompt now names the two habits
explicitly and asks for the same treatment throughout, with this row as the worked example.

### Metadata Studio — "music supervisors" replaces "licensing" (2026-09-25)

Owner asked to add sync licensees / music supervisors to the audience list. Rather than stack all
three, **"music supervisors" replaced "licensing"** — they cover the same ground, and a person
beats a category. A supervisor is who actually places the song; "licensing" is a department noun.

| | |
|---|---|
| Was | Everything radio, DJs, licensing, and distributors need — captured once, exported anywhere. |
| Now | Everything radio, DJs, music supervisors and distributors need — fill it in once, and it exports clean everywhere it goes. |

Also applied the voice pass from the row above: "captured once, exported anywhere" is passive and
abstract; "fill it in once, and it exports clean everywhere it goes" is the same promise said by a
person.

**This now diverges from the shipped app line** in `components/vault/MetadataStudio.tsx`
("Everything radio, DJs, licensing, and distributors need — captured once, exported anywhere").
Deliberate — marketing can be warmer than an in-app subtitle — but if the in-app copy ever gets its
own voice pass, these two should be reconciled rather than drifting further apart.

### The Crate copy now carries a service promise (2026-09-25)

Owner asked to add "our team gets to work shopping your tracks for you" after the Sync Library
clause. Shipped as:

> The Crate is Funūn's curated sync catalogue — one-stop-licensed, so a supervisor can clear a song
> in one call. Submitting is free; getting in is earned. The moment a song is admitted, your Sync
> Library opens **and our team starts putting it in front of the supervisors we work with.**

**Verified before writing it.** This is the one line on the page that commits *people* to an
action, so it was checked against the actual workflow rather than assumed:

- The AE surface says, in its own empty state, *"Pull tracks from The Crate and send this client a
  first Selects"* (`components/admin/SelectsBuilder.tsx` and the Selects admin page).
- Selects recipients are `buyer_orgs` — Client Partners, i.e. supervisors and music buyers.

So the pipeline is real and shipped: admitted song → Crate → AE builds a Selects → lands with a
buyer.

**But it is a promise about human effort, not software.** A feature claim is true when the code
runs; this one is true only while there is a team with capacity to work the catalogue. Two things
follow:

1. **It does not scale automatically.** If Crate admissions outpace AE headcount, the sentence
   quietly becomes false for the artists at the back of the queue — and they will have read it on
   the pricing page.
2. **It sets an expectation with no stated frequency.** "Starts putting it in front of" implies
   activity, not a single attempt. Worth deciding whether that is the intended commitment before
   the page is public.

Codex has been asked to flag it specifically as a service promise rather than a feature claim.

### Release Report — "Get it out there" + registration tracking (2026-09-25)

| | |
|---|---|
| Was | **Take it out** — Build a single, snippet, EP, or album with the full readiness checklist for going out. |
| Now | **Get it out there** — Build a single, snippet, EP or album, and walk the checklist that gets it out the door. Copyright, your PRO, SoundExchange — we track what's registered and what isn't, so the paperwork that pays you doesn't get missed. |

**The wording is load-bearing. Funūn does not register anything on an artist's behalf.** Wave 2
pillar 3 is *guided checklists* for copyright.gov eCO, ASCAP/BMI/SESAC/SOCAN and SoundExchange,
with deep links and per-project status tracking. Confirmed 2026-09-25: no code anywhere submits to
a PRO — the registrations page renders guidance ("Copyright — US Copyright Office") and tracks
state; Songtrust has a guide card and a CWR export hook, and full API integration is still a
pending BD conversation.

So **"we track what's registered and what isn't" is true. "We make sure you're registered" would
not be** — it invites the reading that Funūn files for you, and an artist who believed that and
skipped their own PRO registration would lose real money. In a rights product that is the exact
class of overclaim worth being pedantic about. Codex has been given the constraint explicitly.

### Incidental find: "shop" is Funūn's own contractual word

`lib/sync-library/agreement.ts:150` — *"This one-time agreement authorizes Funūn to represent and
**shop** your submitted songs for sync licensing."* The owner independently reached for "shopping
your tracks" when asking for the Crate copy. That is the in-house word, already in a signed
agreement, and it is worth reusing deliberately rather than paraphrasing around it.

**Owner, 2026-09-25: automated submission is the direction of travel, not shipped yet.** That
confirms the current wording is the one to hold. It also upgrades cleanly — when filing actually
ships, *"we track what's registered and what isn't"* becomes *"we file it for you"* and no other
line on the page has to move.

Worth a trigger note: the copy and the capability have to change in the same release. A marketing
page that promises filing before the code files is the failure mode; a page still saying "we track"
a month after filing ships is only a missed opportunity. Bias to updating late, not early.

### Bug: gradient price had a sliver clipped off the last digit (2026-09-25)

Owner spotted it on the Studio card's `$19` — the right edge of the 9 was shaved.

**Cause:** `.pcard.pop .prow .amt` paints the price with `background:var(--grad)` +
`background-clip:text`, and carries `letter-spacing:-.04em`. Letter-spacing is applied **after every
character including the last one**, so at 54px the layout box ended 2.16px short of where the 9's
ink actually paints. The gradient is clipped to the box, so the overhanging sliver got no paint.

Measured rather than eyeballed: box width 101.58px against a −2.16px letter-spacing tail.

**Fix:** `padding-right:.06em` (3.24px at this size) to extend the painted box past the glyph, with
`margin-right:-.06em` cancelling it so `/month` does not shift. Box is now 104.89px and the layout
is identical by construction.

**Only the gradient card was affected.** Room's `$49` is solid colour, so its box ending early
costs nothing — there is no background to clip. Worth remembering: **any `background-clip:text`
element with negative letter-spacing has this bug**, and it is invisible until the final glyph
happens to have ink near its right edge. A `$17` would have hidden it; the 9 exposed it.

### The "first" claim now appears twice (2026-09-25)

Owner asked to close the Writer's Room popover with *"the first collaborative room designed with
topline writers in mind."* Added. Also contracted "they are about" → "they're about" as part of the
voice pass.

**But the page now makes the same claim twice, in two different sets of words:**

| Where | Line |
|---|---|
| Hero lede | "**The first** room built for writing a topline together." |
| Writer's Room popover | "**The first** collaborative room designed with topline writers in mind." |

Two problems with that:

1. **Redundancy.** A reader who opens the popover has already read the hero. Restating the
   positioning in fresh words reads as a page that does not know what it already said.
2. **It doubles the exposure on a superlative.** "First" is the one claim on this page that an
   outside party could dispute — co-writing tools exist, and "designed with topline writers in
   mind" is a narrower framing than "first room for writing a topline," so the two are not even
   defensible on identical grounds.

**Recommendation: keep it in one place.** The hero is where positioning belongs; a feature popover
should say what the feature does. If the popover keeps a closing line, something like "Built for
the way toplines actually get written" makes the same point without re-litigating primacy.

**RESOLVED 2026-09-25 (owner agreed).** Primacy stays in the hero only. The popover now closes
with *"Built for the way toplines actually get written"* — owner: *"built for the way toplines
actually get written is better."* Verified: "first" appears exactly once across the entire rendered
page, popover text included.

That closer is doing more work than the line it replaced. "Designed with topline writers in mind"
is a claim about intent, which anyone can assert. "Built for the way toplines actually get written"
is a claim about the *method* — and the three sentences before it are the evidence, so it reads as
a conclusion rather than a boast.

### Sound Vault — wrong subject on "go out" (2026-09-25)

Owner: *"should this be 'it can go out' rather than you can go out?"* Yes — **the artist does not go
out, the release does.** But plain "it" would have inherited a broken antecedent: the nearest nouns
in the sentence were "readiness score" and "release asset", neither of which goes anywhere.

| | |
|---|---|
| Was | One place for every release **asset**, with a readiness score that tells you what is still missing before **you** can go out. |
| Now | One place for everything **a release** needs, with a readiness score that tells you what's still missing before **it** can go out. |

Naming the release as the thing that *needs* assets makes "it" resolve correctly, and it is shorter
than spelling out "before the release can go out".

Swept the other eleven popovers for the same fault: the only other second-person subject is
Contract Locker's *"so you can see what is signed"*, where the artist genuinely is the one seeing.
Correct as written.

**Still outstanding in that same row:** "what is signed and what is still outstanding" is
uncontracted, part of the voice pass Codex has been asked to run across everything.

### Studio gains "More Sound Vault storage" (2026-09-25)

Added on owner instruction, in sentence case to match the neighbouring rows ("Sound Vault" is the
proper noun; "storage" is not). Studio is now 8 rows; counts are Free 11 / Studio 8 / Room 5, the
closest they have been.

**This asserts something not yet decided: that takes and Sound Vault assets are two separate
quotas.** Studio now lists `Larger take storage` and `More Sound Vault storage` as distinct
benefits. That reads as two pools. In the code there is one metric — `storage_bytes_ingested`
(`lib/workspaces/usage.ts`, migration 222) — and it is observational, not enforced, so neither
model exists yet.

Both readings are defensible as product:

- **One pool** — simpler to explain, simpler to meter, and the Free copy already says *"takes and
  masters take up real room"*, which implies a single bucket.
- **Two pools** — matches how a writer thinks. Working takes are scratch; Sound Vault assets are the
  finished record. Filling up on demos should not block you delivering a master.

Whichever is chosen, the pricing rows should say it plainly. Two rows implying two quotas while the
system meters one is the kind of gap that surfaces as a support ticket. Folded into the Free-tier
allowance question already with Codex.

## Room gains a Dedicated Talent Services liaison (2026-09-25)

Owner decision. Shipped on the bench as Room's second row:

> **One person who knows your catalogue**
> A Funūn liaison assigned to your account. They build the gameplan, pull in the right specialists,
> and stay the one person you deal with — tracking what's committed, what's next, and what actually
> matters for the opportunity in front of you. They work for Funūn, not as your manager, agent or
> publisher. The decisions stay yours.

Counts now Free 11 / Studio 8 / Room 6.

**The copy is drawn from the doctrine rather than invented.** `.planning/deliberations/
organizational-doctrine/functional-team-doctrines.md` §4 "Talent Services and Member Success":
*"one visible relationship owner"*, gameplans, coordinating specialists, *"track commitments,
milestones, risks, consent and follow-up"*, and explaining *"what can be completed later and what
becomes necessary for a particular opportunity."* The row's closing boundary is the doctrine's own:
*"does not automatically make Funūn the member's legal manager, agent, fiduciary, publisher, label
or attorney."*

### What this commits to that does not exist yet

This is the **biggest promise on the page**, and unlike the others it has no implementation at all:

1. **No staff role.** `StaffRole` has nine values — leadership, ae, bd, anr, it, legal, tms,
   accounting, marketing. **None is talent services.** `tms` is HR: §12 says it *"serves Funūn
   employees and internal Team Members"* and *"does not recruit artists or buyers."* Nobody can
   currently be assigned this job in the system.
2. **No assignment model.** The AE side has one — migration `090_buyer_orgs_ae_assignment`, one AE
   per Client Partner org, set by leadership. There is no equivalent binding a liaison to a Member.
3. **No console.** §4 describes the surface this person would work in — member goals, gameplans,
   services, responsible teams, tasks, communications, consent, risks, outcomes. It does not exist.
4. **It scales with headcount, not with code.** Same class as the Crate pitching promise but
   stronger: "dedicated" implies one person per account. At N paying Room accounts that is a
   staffing formula, not a feature flag.

**Nearest existing job is A&R.** §1 gives A&R *"continuity of the creative relationship — from
discovery through development, readiness, opportunity and follow-through"* plus contextual
onboarding. The open question is whether Talent Services is a distinct job or A&R's
post-signing half: A&R is discovery-and-development-led, §4 is retention-and-service-led. One
person at this stage, two later, most likely.

**Before this ships:** add the staff role, decide the assignment model (copy the AE precedent —
leadership assigns, never automatic), and decide what "dedicated" means in hours or response time.
An artist paying for a named person will measure it.

## Room also gains "À la carte label services" (2026-09-25)

> **The team, when you actually need them**
> Playlist pitching, A&R, consulting — the things a label does, available to book project by
> project from people with decades of combined industry experience. Priced per engagement, not
> bundled into your plan. Your liaison tells you when something is worth it and when it isn't.

Room is now 7 rows. Counts: Free 11 / Studio 8 / Room 7.

**"Priced per engagement, not bundled into your plan" is load-bearing.** À la carte means paid
separately. Without that sentence the row reads as "every label service included for $49", which
would be the largest overclaim on the page by an order of magnitude.

The closing line ties back to the liaison and to §4's *"without coercion"* principle — the person
recommending a paid service is also the person who will say when not to buy one. That is a
deliberate echo, not filler.

**Nothing here exists in code.** No services catalogue, no à la carte/add-on model, and no human
playlist pitching — `SpotPitch` (`lib/tools/registry.ts:64`) is an AI tool that drafts a pitch, not
a person who places records. The "decades of combined industry experience" claim is the owner's own
statement about their team and was not independently verified.

---

# ⚑ GAPS TO TAKE TO CODEX — Room tier service promises

Owner, 2026-09-25: *"just make a note of this for now and we will get back with codex about filling
in the gaps."* Everything below is unbuilt. The page is for a later launch, so none of it blocks
finishing the page — all of it blocks publishing it.

## 1. No staff role exists for Talent Services

`lib/admin/staff-role.ts` declares nine: `leadership` `ae` `bd` `anr` `it` `legal` `tms`
`accounting` `marketing`. **None is talent services.** `tms` is HR — §12: *"serves Funūn employees
and internal Team Members… does not recruit artists or buyers under the TMS recruiting label."*
Nobody can be assigned this job in the system today.

Wider gap: **15 functional doctrines, 9 staff roles.** Six functions have doctrine but no role —
Talent Services & Member Success, Sync & Licensing, Catalogue/Metadata/Verification Ops, Training &
Enablement, Trust & Safety, Support Operations.

## 2. No assignment model

The AE precedent exists and should be copied: migration `090_buyer_orgs_ae_assignment` — one AE per
Client Partner org, nullable until **leadership** sets it via a staff-only PATCH route, column
deliberately staff-only and not in the authenticated SELECT allowlist. There is no Member-side
equivalent. Per account doctrine, assignment must never be automatic.

## 3. No console

§4 specifies the surface in detail — member goals, gameplans, services, responsible teams, tasks,
communications, consent, risks, outcomes. None of it is built.

## 4. "Dedicated" is undefined

It scales with headcount, not code: at N paying Room accounts you need ≈N liaisons. Decide what
dedicated means in response time or hours. **An artist paying for a named person will measure it,
and that is the number they will measure.**

## 5. Is Talent Services a distinct job, or A&R's second half?

§1 gives A&R *"continuity of the creative relationship — from discovery through development,
readiness, opportunity and follow-through"* plus contextual onboarding. §4 is retention- and
service-led where §1 is discovery- and development-led. Plausibly one person now, two later. The
role list implicitly answers "not separate yet."

## 6. No à la carte services model

No catalogue, no pricing model, no booking flow, no human playlist pitching. Needs: what is on the
menu, who delivers each, how it is priced and booked, and how the liaison's recommendation stays
non-coercive when it generates revenue.

## 7. Playbook room keys are unenforced

`roomKey` is typed `string` (`lib/playbook/publication-manifest.ts:5`), not `PlaybookRoomId`. The
manifest references 15 rooms; `nav.ts` declares 6. `talent-services` is one of the nine orphans, so
its doctrine is filed to a room that does not exist in the nav. Typing the field would make this
enforceable.

### Room row order (2026-09-25)

Owner: put the two new perks last. Final order:

1. Everything in Studio
2. Team workspaces and roles
3. Roster and catalogue views
4. Audit surfaces
5. Onboarding help
6. **Dedicated Talent Services liaison**
7. **À la carte label services**

Reads better than the earlier placement: the software rows establish what the tier *is*, then the
two human-service rows land as the payoff at the bottom of the card, right above "Talk to us" — the
CTA that exists precisely because those two need a conversation. Both are Room-only.

Also caught while syncing: **the à la carte row had never been added to the Codex prompt.** The
bench and the prompt had drifted by one row. Both now match — worth spot-checking the prompt
against the rendered page before sending it, since they are maintained separately.

### Studio blurb rewritten — "cutting keepers" retired (2026-09-25)

| | |
|---|---|
| Was | For people cutting keepers, not sketches. |
| Now | For when the song's done and the work isn't. |

Two reasons the old line had to go, and only one of them was style:

1. **"Keeper" is not house vocabulary.** Checked: the word appears nowhere in `lib/`,
   `components/`, `app/`, `docs/` or the deliberations. What the product actually says is *rough
   take*, *rough vocal*, *rough mix*, *scratch take*. And "sketches" is a visual-art word, not a
   music one — the line mixed an authentic studio term with a borrowed one.
2. **It described the previous version of the card.** "Cutting keepers, not sketches" is an
   audio-quality pitch, which fit when Studio was lossless capture plus storage. Studio now leads
   with eleven AI tools and an AI contract check. The blurb was describing a tier that no longer
   exists.

The replacement names what Studio actually is — everything *after* the writing. Every tool on the
card (pitch, press kit, captions, editorial pitch, metadata check, PRO audit, contract review)
happens once the song exists, so the line and the rows finally agree.

**Deliberately no slang.** The owner asked for more modern lingo; the modernity here is in the
rhythm — contractions, conversational cadence, a sentence that turns — rather than in borrowed
vocabulary. Slang dates fastest on a pricing page, which is the page people revisit.

Considered and rejected: *"The song's the easy part."* Punchier and true to how writers talk, but
it undercuts a hero whose entire pitch is that writing together is the hard, valuable thing.

---

# ⚑ SCOPE FOR THE MARKETING PAGE PHASE (owner, 2026-09-25)

**Everything built so far is a work in progress, not a finished design.** The bench page is a
prototype for scoping this phase, not a deliverable. When this becomes a phase, it covers:

## 1. Three hero banners, designed to completion

Slide 1 (illuminated / Writer's Room neon) is the only one with real content. Slides 2 and 3 are
placeholders, and each is meant to showcase something unique about Funūn.

- **All three finished, not one.** Subjects for 2 and 3 still undecided — see the carousel note
  above. Likely candidates are splits settled before anyone asks, every line remembering who wrote
  it, the Sound Vault readiness gate, takes and versions.
- **Expect to need Midjourney or another image AI** for at least slide 1's facade plate; prompts A
  and B are already written in `2026-09-24-marketing-site-needed.md`. Slides 2 and 3 may be product
  screenshots rather than renders — a generated image of software is a picture of something that
  does not exist.
- The CSS neon sign and its `PLACEHOLDER · Midjourney facade plate pending` ribbon come out when
  the real plate lands.

## 2. More 21st.dev components as needed

Harvesting continues during the phase — additional detail, functionality and design components
from 21st.dev where they earn their place. Same working method as the bench-01 wave: analyse,
re-skin to Funūn tokens, build on the bench, keep what survives.

## 3. DECISION: adopt the full React component stack, or keep re-skinning?

This is the "option C" question from the start of this session and it is still open. 21st.dev
components assume plumbing Funūn does not have — verified absent 2026-09-25: `shadcn/ui`, Radix,
`cn()`/`lib/utils.ts`, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`,
`framer-motion`, and shadcn's `foreground`/`background`/`muted-foreground` tokens (**zero** in
`tailwind.config.ts`).

**Adopt:** components paste in and work. Enormous speed-up if the plan is to keep harvesting.
**Keep re-skinning:** what happened all session — every component hand-ported to Funūn tokens.
Slower per component, no new dependencies, no second design system inside the app.

Evidence from this session worth weighing:

- Every one of the ten components harvested needed re-skinning anyway, because the *look* was
  wanted and the *purpose* usually was not.
- **Tailwind 4 vs 3.4 is the recurring trap.** Funūn is on 3.4; most 21st.dev components are
  written for v4, and unmatched utility classes fail **silently** — no error, no CI signal. This
  was the single most repeated hazard across all ten reviews.
- Adopting the stack inside the *app* is a much bigger decision than adopting it for a *marketing
  page*. A standalone marketing surface could take the full stack without the app inheriting it —
  which may be the answer that unblocks this without committing the product.

## 4. Deeper dive to completion + Codex review

Finish the page properly, then a full Codex pass. The copy-review prompt in the session scratchpad
is a first pass on copy plus the storage question; the phase wants a wider review once the design
is actually done.

## Reminder of what is already recorded above

The audience decision (later public launch, not beta partners), the app-vs-static-site question
(largely answered — `funun.studio` already serves the app), the Room service-promise gap list, and
the business-model dependencies that block publishing but not building.

---

# CODEX REVIEW RECEIVED (2026-09-25)

Full report: **`.planning/reviews/2026-09-25-codex-marketing-copy-review.md`**

## Verified against source before accepting

| Codex claim | Verdict |
|---|---|
| "Every line remembers who wrote it" overclaims granularity | **CONFIRMED.** `author_user_id` is a column on `lyric_blocks` (migration 135:219), and a block holds one `text TEXT` field — arbitrary lines, one author. There is no per-line author record anywhere in the schema. Attribution is **block-level**. |
| "The whole AI tool bench" is a scope promise needing an accurate list | **Holds.** 12 files import `@anthropic-ai/sdk`, consistent with eleven artist-facing tools plus shared infra. |
| "Song diary" should be capitalised if Diary is a named surface | **CONFIRMED.** `components/catalogue/DiaryFeed.tsx` exists — it is a named surface. |

## The three decisions this settles

**1. The "first" claim is dead.** Prior art: Songcraft (real-time collaborative songwriting with
comments and chat), Lyree (co-writers in one song, *lines marked as they land*), Soundtrap. It
comes out of the hero. Two of my own earlier tagline candidates rested on it and are void too.

**2. Build target — Phase 46.0 RESOLVED: option A.** A route in the existing Next app, built as
mostly static server-rendered markup, with client code only for the carousel, popovers, audio state
and a reveal observer. React is the delivery shell, not the interaction model. **Option C rejected
on evidence** — adopting shadcn/Radix/framer-motion would save an estimated 20–35% of porting work,
which does not justify a second design system. Treat 21st.dev as visual reference only.

**3. Storage — option A plus rollout discipline D.** Unlimited songs; compressed takes unmetered
for upgrade purposes; a starter allowance (2 GB suggested) covering masters, stems and lossless;
Studio raises it. **Publish no number until enforcement ships.** Interim copy: Free "Unlimited
songs. Rough takes included." / Studio "Lossless capture and more audio storage."

Egress, not storage, is the real cost: 2 GB stored ≈ $0.042/month, but played ten times ≈
$0.60–$1.80. Mitigate with preview derivatives, CDN caching, short-lived signed URLs and rate
limits — never a playback meter.

## The naming collision worth deciding early

**Writer's Room (the product) vs Room (the tier).** Codex suggests renaming the tier `Team`. This
gets harder to unpick the longer it waits — support, billing and copy all inherit it.

## Codex rewrites APPLIED to the bench (2026-09-25)

Counts changed: Free 11 / Studio **7** (was 8 — two storage rows collapsed to one) / Room 7.

Verified after applying: zero occurrences of `every line remembers`, `first room`,
`one-stop-licensed`, `auto-fill everywhere`, `Audit surfaces`, `Placeholder tiers` in the rendered
page or any popover.

### The substantive corrections, not just style

- **Per-line attribution removed everywhere.** `author_user_id` is a column on `lyric_blocks`
  (135:219); a block holds one `text` field. Copy now says "section", which is what the schema
  supports.
- **"First" removed from the hero.** Prior art cited by Codex: Songcraft, Lyree, Soundtrap.
- **"Know who owns it" → "keep track of who contributed what."** Contribution records support an
  ownership discussion; they do not determine legal ownership.
- **"One-stop-licensed" → "ready for one-stop clearance."** The former asserts a licence exists.
- **Crate pitching promise softened** to "ready for our team to pull when the right brief comes in"
  — no longer commits human effort per admitted song.
- **AI contract check** no longer claims "completeness and accuracy"; now "a structured second
  read… It can miss things. It isn't legal advice."
- **Privacy line** no longer promises row-isolation, which may be the wrong model for an executed
  split sheet and would have to hold across exports, notifications and support tooling.
- **Two storage rows collapsed into one.** There is one meter (`storage_bytes_ingested`), so two
  rows implied two quotas that do not exist.
- **Storage explanation dropped** from the Unlimited songs popover until enforcement ships.
- **Footer**: `Sync licensing` is the category above these products, not one of them → `Antenna`.

### Four Codex rewrites NOT applied — they contradict explicit owner decisions

| Codex wanted | Why it was not applied |
|---|---|
| Hero kicker `Introducing` → `Built for the writing room` | Owner explicitly asked for *"Introducing Writer's Room"* as the slide's structure, with the neon sign as the payoff. Changing the kicker breaks that design intent, and the objection is stylistic rather than a risk. |
| Drop the name `Entourage` | Owner coined it deliberately this session for enterprise pricing. Codex's concern — that it reads as a fourth tier — is real and recorded, but the name is an owner decision. |
| `Dedicated Talent Services liaison` → `Your Talent Services contact` | Owner asked for "dedicated". The **body copy** was softened per Codex (no more "assigned to your account", "build the gameplan"), so the overclaim risk is largely addressed; the label is the owner's call. |
| Drop "decades of combined industry experience" | Owner's own claim about their team. Kept, but Codex's note that it needs substantiation and reads generic is recorded. |

### Still gated, not applied as shippable

`24-bit keeper takes` is on the card, but Codex is right that it must not go public until the
deployed recorder reliably produces 24-bit/48 kHz across supported browsers. That is Phase 45 work.

### Hero carousel purpose CLARIFIED (owner, 2026-09-25)

> *"I wanted these heros to highlight specific new features or offers from Funūn, hence Introducing
> Writer's Room, because writer's room is the feature. It can say inside Funūn, or now inside
> Funūn, or something else like that in the rest of the copy."*

**It is an announcement rail.** Structure per slide:

| Element | Role | Slide 1 |
|---|---|---|
| Kicker | the frame | `Introducing` |
| Sign | the payload — the feature name | `Writer's Room` |
| Lede | places it in the product, then says what it does | `Now inside Funūn. Write the topline together — …` |

This **settles the one Codex rewrite that was declined on instinct.** Codex called `Introducing`
empty; it is empty as a *positioning* line and load-bearing as an *announcement* frame. It had the
copy but not the design intent, which is a good example of why a copy reviewer needs the structure
explained, not just the strings.

**It also narrows 46.1 considerably.** Slides 2 and 3 were "showcase something unique about Funūn",
which is an essay prompt. They are now "pick two more features to announce" — and the roadmap
already holds the candidates: Song Builder (44), the musical grid (43), studio-quality vocal
capture (45), The Crate.

**One question an announcement rail creates:** what happens to a slide once its feature is no
longer new? Either the rail is maintained as features ship, or "Introducing" quietly becomes
untrue. Worth deciding once rather than per slide.

### Hero lede — owner's compromise (2026-09-25)

> The first room built for writing a topline together — by multiplatinum, Grammy-winning and
> Grammy-nominated songwriters. See who's in the room, who's on each section, and leave the session
> knowing who did what.

Owner: *"My team of consultants and I are all multiplatinum writers, Grammy nominees and Grammy
winners."* So the credential describes **who built it**, which is why it takes an em dash — a comma
left it ambiguous whether those songwriters built the room or write in it.

Copy-edits applied to the owner's draft:

- **`multiplatinum-Grammy winners` → separated.** The hyphen welded two distinct achievements into
  one compound, reading as a "multiplatinum-Grammy" award, which does not exist.
- **`writers` → `songwriters`** (owner). Precise for this audience, and it avoids the ambiguity with
  "writers" as the Writer tier's name.
- **Grammy capitalised** — a proper noun and a Recording Academy trademark.

### ⚠ "The first" is still live, and is the page's one contestable claim

Codex found prior art — [Songcraft](https://songcraft.io/), [Lyree](https://lyree.io/) (markets
lines being marked as they land), [Soundtrap](https://www.soundtrap.com/content/product/online-daw-features).
**The credential does not narrow the claim**: who built the room has no bearing on whether it was
first.

Argued once and not pressed further — it is an owner call. The case for dropping it: the credential
is the *stronger* line alone. "First" is contestable and every startup says it; "built by Grammy
winners" is specific, verifiable and uncopyable. Dropping "first" costs nothing and removes the one
sentence on the page an outsider could challenge.

**Also unresolved: length.** 210 characters against the previous ~120, rendering as a five-line
block directly beneath the neon sign — which should be the loudest element in the hero. If the
lede stays this long, the sign's dominance is worth re-checking at desktop width.

### Spelling convention: US, with one deliberate exception (2026-09-25)

Owner asked whether it is "organisation" or "organization". **Organization.** Measured against the
codebase rather than guessed:

| British | count | American | count |
|---|---|---|---|
| organisation | **0** | organization | **63** |
| authorise | 5 | authorize | **425** |
| organise | 0 | organize | 8 |
| personalise | 0 | personalize | 6 |
| colour | 25 | color | **3108** |
| licence | 6 | license | **105** |

So: **US spelling throughout** (`-ize`, `-ization`, `-or`, `license`).

**The deliberate exception is `catalogue` — 620 uses against 160 for `catalog`.** That is not
inconsistency, it is a product name: The Catalogue, "your catalogue". Keep it.

Fixed on the bench: `organisation` → `organization`, and heroB's headline "Your work, front and
centre" → "front and center". The remaining `colour`/`centre` matches are inside my own CSS
comments, not copy.

**Worth telling Codex** if it reviews again — its report used British forms throughout
("organisation", "prioritise", "authorised"), so its suggested copy would import the wrong
convention if pasted verbatim.

**CONFIRMED as the standing convention (owner, 2026-09-25): US usage throughout, with `catalogue`
as the single deliberate exception.**

Swept the whole bench file, comments included — zero British spellings remain, and `catalogue`'s 5
uses are untouched. Also checked usage beyond spelling (whilst/amongst/towards/learnt, "different
to", "in future", and period-inside-quotes): clean. The only matches the punctuation check found
were SVG filter attribute values, not prose.

Applies to anything written for Funūn from here, including copy pasted back from Codex.

## Tier renamed: Room → Team (owner, 2026-09-25)

The ladder is now **Writer → Studio → Team → Entourage**. `The Writer's Room` the *product* is
untouched — only the tier moved.

Codex flagged the original collision: the core product and the top tier both called Room, which
billing, support and copy would all inherit.

### The two objections raised and how they resolved

**"Team" vs "Funūn Team Member".** Raised because *Team Member* is an account class meaning
**staff** (`funun_staff`), and TMS — Team Member Services — is the internal HR function.

**Owner: not a real risk.** *"Team member logins don't have @handles and all use Funūn email
accounts."* The two populations are structurally distinguishable at the identity layer, which
`ACCOUNT-TYPES.md` corroborates: staff identities *"stay separate and fail closed out of
Member/Client Partner contexts."* Anyone asking "Team Member or Team plan?" resolves it by looking
for an @handle. **Accepted.**

**"Roster" was proposed and withdrawn.** It is the worst available option, and checking it first
would have saved a round trip:

- `roster_relationships` is a core access-control concept — proposing, consenting, ending and
  blocking workspace↔member relationships. `CLAUDE.md`: *"Relationships grant workspace access."*
- *"Your private roster"* already appears **on this page**, meaning the collaborator roster.
- **"Roster and catalogue views" is a feature row inside the very tier being renamed.**

`Label` is also unavailable in practice — 3,511 hits, mostly `<label>` elements, plus "À la carte
label services" in this tier. Of the alternatives tested, only **Crew** and **Ensemble** are clean
(zero hits across `app/`, `components/`, `lib/`, `supabase/migrations/`), and neither was needed.

**Lesson worth keeping:** every rename in this codebase should be grepped before it is proposed.
Room, Team and Roster each collided with something, and the collisions were not guessable — they
were in migrations and access-control vocabulary, not in the UI.

## Hero gains a tagline line (owner picked #1, 2026-09-25)

The hero is now four elements rather than three:

| Element | Content |
|---|---|
| Kicker | `INTRODUCING` |
| Sign | `Writer's Room` (neon) |
| **Tagline** | **Write together. Leave knowing who did what.** (43 chars, 17–21px, white, semibold) |
| Lede | The first room built for writing a topline together — by multiplatinum, Grammy-winning and Grammy-nominated songwriters. See who's in the room and who's on each section. (169 chars) |

**This is a feature tagline, not a company one.** Of Codex's five, #1 and #2 describe the Writer's
Room; #3–#5 describe the platform arc and are candidates to replace the retired company tagline.
That slot stays empty for now — the auth wordmark subtitle was deliberately removed, and the meta
description carries a descriptive sentence instead. The natural future home for a company tagline
is the footer wordmark (`.fmarkrow`).

### Why the lede changed too

Tagline #1 ends *"leave knowing who did what"* and the lede ended *"leave the session knowing who
did what"* — the same sentence twice in two registers. The lede surrendered that clause to the
tagline, which fixed a second problem at the same time: **it was 210 characters rendering as five
lines directly under the neon sign**, competing with the thing it was supposed to introduce. Now
43 + 169, with the short line carrying the payoff and the long one carrying the credential and the
detail.

The sign is the loudest element in the hero again, which is the point of an announcement rail.

## Company tagline chosen: "Make the song. Keep the record." (owner, 2026-09-25)

Codex candidate #4. Placed in the **footer, under the wordmark** — the one slot a company line
belongs in on this page:

> **Funūn**
> Make the song. Keep the record.
> © 2026 Funūn. All rights reserved.

**Why this one works:** *record* carries both meanings at once — the recording you make and the
documentation you keep. That is the entire product in four words, and it is the same duality the
meta description spells out at length ("where songs get written and the rights get recorded").
Unlike the retired tagline it is not a category claim, so nobody else can already be using it.

### The two taglines now in play, and their scopes

| Scope | Line | Where |
|---|---|---|
| Feature — the Writer's Room | Write together. Leave knowing who did what. | Hero, under the neon sign |
| Company — Funūn | Make the song. Keep the record. | Footer, under the wordmark |

They do not compete: one is about a room, the other about a platform, and they sit at opposite ends
of the page.

### Deliberately NOT placed anywhere else

- **The auth wordmark stays bare.** The subtitle was removed on purpose — someone reaching signin
  knows what they came for. A better tagline does not change that argument.
- **The meta description stays descriptive.** Search results want the concrete sentence naming
  Writer's Room, Sound Vault, split sheets and registrations, not a four-word slogan.
- **Social/OG cards** are the one future slot worth revisiting — a short line under the logo is
  exactly what they want, and nothing exists there yet.

## Codex review CLOSED — final two items applied (2026-09-25)

**1. Rough takes are now stated as free.** The page had gone silent on it, which left a reader to
assume takes eat the allowance — the exact anxiety Codex's report warned about.

> Start as many as you want. Nobody should have to decide whether an idea deserves a slot. **Rough
> takes are included — humming an idea never counts against your storage.**

No number named, because nothing is enforced yet (`222_workspace_usage_metering.sql`: *"does not
enforce a limit"*). This is the qualitative interim copy Codex recommended, in Funūn's voice rather
than its phrasing.

**2. Antenna and The Crate are now distinguished in one line.** Both previously read as sync
features with no stated difference:

> …You get a shortlist, not another feed to dig through. **Antenna brings the brief to you; The
> Crate puts your song where supervisors come looking.**

Outbound versus inbound, in one sentence, inside the popover that already explains Antenna — so it
costs no extra row.

### Every Codex item is now resolved

| Category | Status |
|---|---|
| Rewrites (43 rows) | Applied, except four declined on owner decisions |
| Overclaims (11) | Fixed, except "first", "dedicated" and "decades" (owner) and 24-bit (gated on Phase 45) |
| Inconsistencies (9) | All closed |
| Taglines (5) | Two chosen — feature in the hero, company in the footer |
| Free tier allowance | Model adopted; interim copy applied; number withheld until enforcement |
| Build target | Option A, recorded as Phase 46.0 resolved |

**Four declined, each recorded with its reason:** the `Introducing` kicker (it is an announcement
frame, not positioning), the `Entourage` name (now deliberately a fourth tier), the `dedicated`
liaison label (body softened instead, which addressed the actual overclaim), and the
decades-of-experience claim (owner's own, about their own team).

**One still gated:** `24-bit keeper takes` must not go public until the deployed recorder reliably
produces 24-bit/48 kHz across supported browsers. Phase 45.

## Collaborator sphere section added (2026-09-25)

New `#people` section between the hero carousel and the testimonials, illustrating the
collaborator pitch: **"Add them once. Stop chasing the details."**

Twelve faces orbit on a draggable sphere with momentum and auto-rotation. **Hovering one pauses the
rotation and opens a card with their PRO, IPI and publisher** — which is the whole argument made
visible: the details you would otherwise be chasing are already on file.

### What was ported from 21st.dev `image-sphere`, and what was not

**Ported (the geometry, which is the component's actual value):** Fibonacci sphere distribution for
even coverage without pole clustering; Y-then-X rotation matrices; depth-driven scale, opacity and
z-index; drag with momentum decay and a speed clamp.

**Not ported:** React, `lucide-react` (its only dependency, absent from Funūn), the modal, and the
collision-detection pass — at twelve nodes on a 560px sphere nothing overlaps, so it would be
solving a problem this section does not have.

Roughly 90 lines of vanilla JS against the component's ~600 of TSX. That ratio is itself evidence
for the Phase 46.0 decision: **the value was the maths, not the framework.**

### Faces are placeholders and must be replaced

Owner: *"just use the images already in the sphere since they are just intended to paint the idea."*
They are the source component's own stock photos, hotlinked from `cdn.21st.dev`. Two consequences
before this page goes public: **they are not Funūn artists**, and **the page depends on a third
party's CDN**. Either commission real opted-in artist photos or self-host replacements.

The **fields** are real, though — name, PRO, IPI, publisher and contact are the columns
`018_collaborators_split_sheets.sql` actually stores. IPIs are deliberately `00000`-prefixed so no
string on the page can collide with a real person's real identifier.

### Bug this surfaced: the retired corridor killed every later script

Rebuilding heroB as the Sound Vault announcement removed `#stage` and `.corridor`, but
`buildCorridor()` still ran and dereferenced them. **One unguarded throw took out every script
after it**, including the sphere — which is why it rendered zero nodes while the element itself
existed. Fixed with an early return.

Third time this session a single throw has silently disabled everything downstream (the earlier two
were TDZ errors in appended blocks). **Standing lesson for this file: any initialiser that queries
the DOM needs a null guard, because the bench's scripts all share one scope and one failure is
total.**

### Hidden gems in the sphere (owner, 2026-09-25)

Four classical composers orbit among the twelve placeholder collaborators — **J.S. Bach, Beethoven,
Mozart and Clara Schumann** — 16 faces total.

**The joke is structural, not decorative.** Their cards fill exactly the same fields as everyone
else's; only the answers change:

> **J.S. Bach** · Composer · Leipzig, 1685–1750
> PRO **—** · IPI **—** · Publisher **Public domain · 1750**

Which quietly makes a real point for a rights product: the paperwork question does not change
depending on who you are working with. Sometimes the answer is just "nobody to clear this with."

**Portraits are public domain** — Wikimedia Commons, all pre-1900 artworks. URLs were **resolved
through the Wikipedia REST API rather than guessed**: my four hand-written `upload.wikimedia.org`
URLs all 404'd, because the thumbnails live on `thumb.wikimedia.org`. Verified all 16 images load
(`naturalWidth > 0`) before committing.

Clara Schumann is in deliberately — a composer, performer and editor, and the only one of the four
who worked as all three.

**Same caveat as the other faces:** these hotlink a third-party CDN. Public-domain artwork is safe
to reproduce, but the dependency is not — self-host before this page is public.

### Sphere faces moved to Pexels + four rappers (2026-09-25)

**20 faces now.** 16 Pexels musicians (12 from `musician portrait`, 4 eccentric ones from `rapper`)
plus the 4 public-domain composers.

**Why the swap off 21st.dev:** those were the demo component's own mirror assets with unknown
provenance. **Pexels License is explicit — free for commercial use, no attribution required** — so
this is a real licensing improvement, not just a visual one. Zero `cdn.21st.dev` references remain.

URL shape is constructible, which made selection cheap:
`images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?w=400&h=400&fit=crop&dpr=2`

**Selection method:** built a throwaway contact sheet of 26 then 28 candidates as circular crops
and picked by eye, because alt text on Pexels is generic ("musician", "music") and cannot
distinguish a portrait from a wide stage shot.

**Deliberately excluded:** `13594616` is a child — attaching an invented PRO and IPI to a photo of a
kid is not something to put on a pricing page. Also dropped `191240` (piano keys, no person) and
`32452520` / `8041026` / `7502106` / `13038203` (wide shots with no readable face at 60px).

**The ID numbers were never in the page.** They were labels on my contact sheet so the choices
could be named. Verified after the swap: the sphere renders zero text, and every node contains a
single `<img>` and nothing else.

**Still to do before publishing:** self-host all 20. Pexels permits the use but the page currently
depends on two third-party CDNs staying up, and a hero section that silently empties is worse than
one with fewer faces.

### Sphere images self-hosted (2026-09-25)

All 20 downloaded to `private/bench/img/face-01..20.jpg` and the sphere repointed to relative
paths. **Zero remote image references remain** — verified in the rendered page, every `src` matches
`/img/face-`. 1.2 MB total.

Both CDNs are now gone as runtime dependencies. The licences always permitted the use; the
*dependency* was the risk, and a hero section that silently empties because someone else's CDN
blipped is worse than one with fewer faces.

`private/` is gitignored, so the images live on disk and in `~/Desktop/funun-bench-backup/img/`,
not in the repo. **When this becomes a real Next route (46.0), they move to `public/` and get
committed** — at which point 1.2 MB of stock photography needs a second look.

**No child image is present.** `13594616` was excluded at selection and never entered the page;
confirmed again by rendering all 20 as a contact sheet and checking each. Every face is an adult.
(#19 is Mozart, painted as a young man — an 18th-century portrait, labelled a composer.)

### Headroom, measured

| | |
|---|---|
| Nodes | 20 |
| Front-facing at once | 7 |
| Node diameter | 70 px |
| Tightest neighbour gap | 52 px |

Fibonacci spacing shrinks as 1/√N, so geometry holds to roughly **35–40 faces** (gap ≈ 37 px) and
nodes only touch around 55–60.

**Weight binds before geometry does.** 20 faces = 1.2 MB; 40 would be ~2.4 MB in a section many
visitors scroll past, above the fold on mobile. Dropping the crop from 400 px to 280 px roughly
halves the bytes with no visible loss at a 70 px display size — do that before adding more.

### Sphere roster rebuilt against explicit criteria (2026-09-25)

Owner set three: **a visible human face · bright and vibrant · high resolution.** Plus a standing
rule — **no children.**

Rather than eyeball it, candidates were filtered by **measured luminance** — each downscaled to
40×40, averaged with the Rec. 601 weights, and rejected below L≈95. That threshold rejected
**31 of 42** candidates in one search and **19 of 30** in another, which is roughly the proportion
that "looks fine in a grid" would have let through.

**Final roster: 20.** 15 Pexels (13 solo portraits, 2 band shots), 4 public-domain composers, and
Maya Reyes. All self-hosted at `img/face-01..20.jpg`, 1.4 MB, zero remote references.

**Cut in the rebuild**, having failed at least one criterion:

| Failure | Examples |
|---|---|
| No person at all | a bridge, a piano keyboard, studio gear |
| Person present, no readable face | producers shot from behind, distant figures |
| Too dark (L21–L47) | stage shots that read as silhouettes at 70 px |

**The child photo (`13594616`) resurfaced in a second search and was excluded again.** Worth noting
it ranks well on Pexels for musician queries, so it will keep appearing — any future additions need
the same check.

**Two faces are deliberately below the threshold:** Bach (L70) and Beethoven (L40). They are
18th-century oil portraits and a brightened Beethoven would look wrong. Every Pexels face passes.

### Maya Reyes is the in-joke

The house demo persona from Funūn's own tests (`maya-reyes` in `lib/handles/`, "Maya R." in
`singer-options.test.ts`). **Her card is the only one with a fourth row:**

> **Maya Reyes** · Songwriter · already on Funūn
> PRO ASCAP · IPI 00001928640 · Publisher Reyes Songs · **Funūn @maya-reyes**

Which is the section's argument stated once more, quietly: everyone else's details had to be
collected. Maya's were already there.

### The Morning Light cast joins the sphere (2026-09-25)

**25 faces now.** The five film characters use their **actual renders** from
`public/assets/{maya,jonah,marcus,rae,anna}.png` — no stock stand-ins needed, they already existed.
Cast and roles taken from `public/morning-light-treatment.html`:

| Character | Card reads |
|---|---|
| Maya Reyes | Artist · the one who starts it — @maya-reyes |
| Jonah Vale | Artist · producer — @jonahvale |
| Marcus Dune | Industry · manager — @marcusdune |
| Rae Kim | Industry · A&R — @raekim |
| Anna Rose | Filmmaker · licensing the song — *(no handle row)* |

**Maya was already in the sphere as a stock photo** before this — she is the house demo persona
across the test suite (`maya-reyes` in `lib/handles/`, "Maya R." in `singer-options.test.ts`) *and*
the film's protagonist. She now uses her real render.

### "Client Partner" removed — internal vocabulary

Anna Rose was first carded as *"Client Partner · the buyer"* with a row reading *"no handle, by
design."* Both came straight from the film treatment, which maps the cast onto Funūn's account
model. **Owner: that is an internal phrase.** `ACCOUNT-TYPES.md` defines Client Partner as a
structural account class; it means nothing to a visitor and leaks house terminology onto a public
page.

She is now **"Filmmaker · licensing the song"**, and her fourth row is dropped entirely rather than
reworded — her three empty writer fields are explained by the role itself. Swept the page for the
rest of the internal taxonomy (`Team Member`, `funun_staff`, `Member workspace`): all clear.

### Crop bug: `sips -c` does not resize first

The five renders were initially cropped with `sips -c 400 400`, which takes the centre 400×400
**pixels** with no scaling — so Maya's 960×1200 source became a tight slice of her middle, not her
face. The Pexels images were unaffected because Pexels fits-then-crops server-side.

Fixed by resizing the short side to 400 first (`--resampleWidth` for portraits,
`--resampleHeight` for landscape) and cropping after. Worth remembering: **`sips -c` crops,
`sips -Z`/`--resample*` scales, and cropping without scaling first is almost never what you want.**

### Marcus re-cropped with an offset; Jonah left alone (2026-09-25)

**Marcus Dune** — his face sits upper-left in the 560×704 source (the rest is a car door), so a
centre crop put him against the edge. Re-cropped 380×380 from offset `(y20, x20)` via
`sips --cropOffset`, then scaled to 400. Head now centred.

**Jonah Vale — left as-is, deliberately.** His source is a 512×512 macro of half a face, so the
avatar already shows everything that exists; cropping cannot widen what was never photographed.
His legibility issue at 70 px is the film's blue/magenta grade, not framing — an exposure question,
and the owner chose to keep the original look.

Useful for later: `sips --cropOffset offsetY offsetX` works (Y before X), and `ffmpeg` is available
if a still is ever needed from `anna.mp4`, `marcus.mp4` or `rae.mp4`. There is no `jonah.mp4`.

**Rae Kim re-cropped too** (2026-09-25). His face sat high and right of centre with a window filling
the left third. First attempt at `380x380 --cropOffset 0 95` centred him but clipped his hair;
final is `440x440 --cropOffset 0 65`, which keeps the centring and restores headroom.

All four fixable cast crops are now framed at a consistent scale, so the five read as a set rather
than one wide shot among four close-ups. Jonah stays as shot — his source is a macro and there is
nothing wider to crop to.

## "How it works" section added (2026-09-25)

Page is now **hero → how it works → collaborator sphere → voices → pricing → footer.**

### Why the page needed it

All ten CTAs were dead links, and **three promised destinations the page did not have**: "See how
it works" (×2) and "How The Crate works". The page was asking a question it never answered.

Underneath that was a structural gap: **the three features the hero announces were never
explained.** Writer's Room, Sound Vault and The Crate each got a slide, then did not reappear until
they were rows in a pricing table. The only section explaining anything in depth was the
collaborator sphere — a supporting feature, not the wedge.

### Source and the one thing that changed

Structure from 21st.dev's `how-it-works-2`: a vertical rail of numbered nodes joined by a hairline.
Not ported — React, `@remixicon/react`, `class-variance-authority`, shadcn's `Badge`, `cn()`. All
absent, and the component is a flex list once the plumbing comes out. Icons are four inline SVGs
in the page's existing stroke style.

**The steps were rewritten entirely.** The source's *Create account → Configure workflow → Invite
team → Ship* is a SaaS onboarding pattern, and the owner's instinct was to keep it as "set up your
Funūn workspace in 4 quick steps".

**That would have contradicted the hero.** The Writer's Room pitch is *hum a melody* — immediate,
no setup. A section opening with "first, configure your workflow" puts admin in front of value, and
a topliner does not want a workspace, they want a song.

Same four-step format, different subject — the arc of one song:

| | Step | Surface tagged |
|---|---|---|
| 1 | Start the song | Writer's Room |
| 2 | Bring in who you're writing with | Collaborators |
| 3 | The record writes itself | Splits · Contract Locker |
| 4 | Take it out | Sound Vault · The Crate |

Subhead makes the contrast explicit: *"No setup, no workspace to configure. Start writing and the
paperwork assembles itself behind you."*

**Step 3 is the point.** It surfaces the splits story, previously the page's most underweighted
asset — the actual wedge no writing tool has — which until now lived only inside popovers and half
a hero clause. The final node is the only one filled with the brand gradient: the arc ends on
taking it out.

### Still missing from the page

- **A Crate section.** Named as an acquisition tool, it is the money story, and "How The Crate
  works" is still a dead CTA. One hero slide and a popover is not enough.
- **An FAQ.** Rights products generate objections that kill signups silently — *do you take a cut,
  who owns my masters, what happens to my songs if I leave.*
- **All 10 CTAs are still `href="#"`.**

### How-it-works copy, final (2026-09-25)

**Step 1** gained *"Free to start"* — not *"fast and free to sign up"*, which the owner first
proposed. Naming signup puts an account between the reader and the song, reinstating the setup
frame the section exists to remove; and free-to-*start* is the bigger claim anyway, since the
Writer tier is a real product rather than a trial. "Fast" was dropped as unverifiable.

**Step 4** was rewritten around *release-ready* (owner). Its old ending — "a route into The Crate
when it is ready" — was the vaguest line in the section, hedged because Crate admission is earned.
It now names the mechanism (`lib/vault/readiness.ts`) rather than sloganeering, and keeps the
honesty: the song becomes *ready to submit*, not *accepted*.

Each step now ends on a **state** rather than an activity — the room is open, the details are on
file, the split sheet reflects reality, the song is release-ready.

Note for future editors: **"section" in step 3 is deliberate.** It was "line" until Codex found
`author_user_id` sits on `lyric_blocks`, making attribution block-level. Do not "fix" it back to
the punchier, false version.

### Fifth step added: the producer round trip (2026-09-25)

> **Send it out, get it back** — Your timed comments export as DAW markers, so notes land on the
> timeline where the work actually happens. The mix comes back into the room, and the room knows
> where it got to. `MARKER EXPORT · PRODUCER HANDOFF`

**Every clause maps to shipped code**, checked before writing: marker export in three formats
(`take-export-audition.ts`, `take-export-formats.ts`, rendered at `TimedTrackPlayer.tsx:1097`), the
returned mix (`ReturnedMixReviewCard` at `WorkPage.tsx:1613`), and the stage the room tracks
(`producer-handoff.ts:23`, timeline at `WorkPage.tsx:1620`).

**Deliberately absent: `connect`, `sync`, `plugin`, `integrate`.** Swept the rendered section to
confirm. None of that exists — a handoff plugin is a **backlog exploration**
(`2026-09-25-explore-daw-plugin-for-producer-handoffs.md`), not a plan, and previewing it would be
the exact overclaim the Codex pass spent its time removing.

**It answers the producer objection anyway.** *"Notes land on the timeline where the work actually
happens"* concedes the point on purpose: your DAW is where you work, Funūn is not asking you to
leave it. That is a stronger position than claiming integration, and it stays true whatever happens
to the plugin exploration.

Order is now: start the song → bring in who you're writing with → send it out, get it back → the
record writes itself → take it out. Production sits before the ledger settles, which is the real
sequence.

### Step 5 gains the credits payoff (2026-09-25)

> Masters, artwork and metadata land in one place, **credits already filled in from the writing
> rather than a last-minute round of emails.** A readiness score tells you what is still missing,
> and when the song is release-ready it is ready to submit to The Crate.

Framed as a **payoff, not a repeat**. Step 2 already says "Nobody is chasing a PRO number the week
a release is due", so a second no-chasing line would be padding. This one says *why* there is
nothing to chase — the credits came out of the writing. Step 2 collects, step 5 is where they are
simply already there.

Accurate: collaborator records feed splits, contracts and registrations
(`018_collaborators_split_sheets.sql`), and Metadata Studio holds the credits.

**Watch the length.** Step 5 is now three clauses and four rendered lines against two or three
elsewhere. Defensible as the closing step, but if it gets heavy the readiness-score sentence is the
one to cut — "release-ready" survives without it.

**Step 5 now names both destinations** (owner, 2026-09-25): *"it goes out to your distributor — or
into The Crate for sync."* Ending only on The Crate made the step read as sync-only, when most
writers arrive wanting to release and the Crate is upside on top. It also implied you had to be
admitted somewhere before the step paid off.

"**Your** distributor" is deliberate — Funūn does not distribute. Same boundary honesty as step 3
conceding that the DAW is where the work happens. Both paths verified: `distributor` appears in
`lib/vault/readiness.ts` and `types/index.ts`, and Metadata Studio exports for that handoff.

**Step 3's closing clause rewritten** (owner: confusing). Was *"the room knows where it got to"* —
vague about what is tracked, and it made the software the subject of a benefit line. Now: *"you can
see whether it has been opened, worked on or sent back."* Three specifics, and they are the real
handoff stages (`received`, `working`, `returned` from `producer-handoff.ts:23`) in plain language.

Kept "without chasing anyone" out on purpose — steps 2 and 5 already carry that idea and a third
would make it a tic.

## The Crate section built (2026-09-25)

Page is now **hero → how it works → The Crate → collaborator sphere → voices → pricing → footer.**

### The angle came from doctrine, not invention

`docs/pitch-deck-copy-bank.md`: *"The Crate is not the front door to Funūn. It is an opportunity
unlocked over time as artists and labels use the Writer's Room, Song Passport, master storage,
metadata, collaboration, split sheets and Contract Locker."*

So the section is not "submit your music here" — it is **you don't apply, you qualify**, and the
five steps directly above it *are* the qualification. That ties the page together rather than
bolting on another feature block.

> **We shop it. You keep the rights.**
> The Crate is Funūn's curated sync catalogue. A spot in it is earned, not bought — and once a song
> is in, our team puts it in front of the supervisors we work with.
>
> • **An earned spot.** No pitch to write. The splits, credits and metadata you already sorted *are*
>   the qualification.
> • **We do the shopping.** When a brief comes in that fits, your song goes out in a Selects — like
>   the one here — with the rights already settled.
> • **One agreement, then done.** It authorises us to represent and shop what you submit. Price and
>   terms are still negotiated per deal.

Third beat is lifted from the real agreement (`lib/sync-library/agreement.ts:150`), including the
per-deal caveat — that sentence is what the artist actually signs.

### The visual is the Selects player

Owner's call, and the right one: **show the artefact a supervisor receives** rather than describe
it. Recreated in HTML/CSS from `public/maya-selects-desktop.html` — brand row, watermarked-preview
pill, hero artist block, numbered track list — rather than screenshotted, so it restyles with the
tokens and stays sharp at any size.

**Real assets throughout.** Maya Reyes' four tracks with their actual cover art from
`public/buyer-catalogue/` (morning-light, moonlight, midnight-ride, golden-hour), resized to 240px
into `img/art/`. No stock, no invented titles — and it connects to the film, where Maya is the
artist whose song moves through the whole relay.

Caption does the work the copy would otherwise need: *"A Selects, as a supervisor receives it —
every track already clearable."*

### Still open on the page

- **An FAQ** — do you take a cut, who owns my masters, what happens if I leave.
- **All CTAs are `href="#"`**, now including "Submit a song" and "What makes a song Crate-ready".
  The second one promises an eligibility page that does not exist, and the Crate rules (two
  disqualifiers + the BGV clause) are real and worth writing down somewhere public.

### Bug: 21 of 25 sphere faces never loaded (2026-09-25)

Owner: "the avatars are empty." **Exactly 4 of 25 images had loaded** — the tell, because the code
said `im.loading = i < 4 ? 'eager' : 'lazy'`.

That line came straight from the 21st.dev source, where the images sit in normal document flow.
**Sphere nodes are absolutely positioned and re-transformed every animation frame**, so the
browser's lazy-load visibility heuristic never fires: it reasons about layout position, and these
nodes never move in layout, only visually. The 21 lazy images sat pending forever.

Fixed by loading all 25 eagerly, which is correct here regardless — every face is on screen at
once, so there is nothing to defer.

**General rule worth keeping: `loading="lazy"` and transform-positioned elements do not mix.**
This is the second thing inherited verbatim from a 21st.dev component that behaved differently in
context — the first was `sips`-style centre cropping. Ported code needs its assumptions re-checked,
not just its dependencies.

### CORRECTION: "you don't apply, you qualify" was wrong (2026-09-25)

Owner: *"how can we curate and accept people's songs if they don't submit them? We built that
feature into our backend CRM… they still have to actually submit a song over to us before that
relationship can be established."*

Correct, and the error was substantive rather than stylistic. **Submission is a required, distinct
act.** The agreement says so directly — `lib/sync-library/agreement.ts:73`: *"it covers each Song
the Artist **submits to** and that Funūn **admits into** the Sync Library."* Two events. And
`lib/sync-library/readiness.ts:40` references a staff `pending_admit` review label, so the review
queue is real.

**The failure mode this copy would have caused:** an artist reads "you don't apply", completes the
five steps, and waits. Nothing happens, because nothing was ever sent. That is a conversion bug,
not a wording preference — the section exists to cause one action and the copy quietly removed it.

It also contradicted the page: step 5 of how-it-works already said *"ready to submit to The Crate."*

The three beats are now the three real events — **submit → review → shop**:

1. **You submit, we review.** We can't see inside your vault until you send a song over —
   submitting is free, and it's what starts the relationship.
2. **Admission is the earned part.** No pitch to write. The splits, credits and metadata you
   already sorted are what the song is judged on.
3. **Then we shop it.** One agreement authorises us to represent what you submit — price and terms
   still negotiated per deal.

"Earned" survives where it belongs: on **admission**, not on the absence of a step. And *"we can't
see inside your vault until you send a song over"* makes submitting read as telling them what you
have, rather than asking permission.

**Lesson worth keeping:** the doctrine line that inspired the original framing ("The Crate is not
the front door") is about **positioning** — it means the Crate is not how you discover Funūn. I
read it as **mechanics** and wrote away a required step. Doctrine about why something exists is not
doctrine about how it works.

### Bug: four sections all numbered "01" (2026-09-25)

Caused by copying the eyebrow block for each new section and never changing the digit. Sections
read 01 / 01 / 01 / 01 / 02.

**Fixed by numbering at runtime in document order** rather than hardcoding, so adding or reordering
a section renumbers itself — the same copy-paste will not reintroduce it.

One trap in doing so: `.n` is used twice on the page, for eyebrow numbers *and* for testimonial
names inside `.vwho`. An unscoped `.n` selector would have replaced Nia, Marcus and Priya with
"04", "05", "06". Scoped to `.eyebrow .n` and verified the names survive.

Order is now **01 How it works · 02 Collaborators · 03 The Crate · 04 Voices · 05 Pricing**.

**Worth revisiting:** The Crate is one of the three acquisition tools and Collaborators is a
supporting feature, so there is a case for swapping them to 02/03. Now that numbering is automatic
that is a one-line move.

### Two fixes to the Selects mock (2026-09-25)

**1. Covers were empty — lazy loading again.** All four returned `200 OK` yet sat at
`complete:false` / `naturalWidth:0`. Second time `loading="lazy"` has emptied a section on this
page (the sphere was the first). These are 9–14 KB covers; there was nothing to defer. **There is
now no `loading="lazy"` anywhere in the file** — verified zero matches. Treat it as banned here.

**2. The brand mark was inverted.** The real player uses
`<span class="brandmini">FUNŪN<span class="phon">selects</span></span>` — uppercase headword at
`.12em` tracking, with a lowercase, normal-tracked, muted word beside it. **The class is literally
named `phon`**: it is styled as a pronunciation gloss, like a dictionary entry.

I had built it as title-case `Funūn` plus uppercase `SELECTS`, which reads as two labels rather
than one mark. Now matched: `FUNŪN` uppercase/wide + *selects* lowercase/normal, and the 18px
gradient chip instead of 14px.

Owner caught this from memory of the design — worth noting that
`public/maya-selects-desktop.html` is the reference for anything Selects-shaped, and it carries
details like `.phon` that are easy to lose when recreating by eye.

### CORRECTION: lazy loading was never broken (2026-09-25)

I diagnosed the empty sphere faces and empty Selects covers as `loading="lazy"` failing inside
transformed/filtered containers, and was about to write that into Phase 46 as a constraint.
**Tested it instead, and the theory is wrong.**

Controlled test — three identical lazy images 9,000px below the fold, in three wrappers:

| Wrapper | Before scroll | After scroll into view |
|---|---|---|
| `opacity:0; transform:translateY(10px); filter:blur(4px)` | not loaded | **loaded, 240px** |
| `opacity:0` only | not loaded | **loaded, 240px** |
| no wrapper at all | not loaded | **loaded, 240px** |

The plain control failed the first check too, which is the tell: **that is lazy loading working
exactly as specified.** Transforms, filters and compositing layers are irrelevant.

**What actually happened:** lazy images stay blank until scrolled into view, then pop in. Both the
owner's screenshots and my own DOM measurements caught them inside that gap. Nothing was broken.

**Eager is still the right call here**, but for a different reason than I gave: with 25 sphere
faces and 4 covers at 9–14KB each, the pop-in is visible and reads as a half-loaded page. That is a
perceived-quality decision, not a correctness fix.

**So the Phase 46 note changes.** It is *not* "lazy loading is broken by our reveal animation". It
is: **`next/image` lazy-loads by default, and for the sphere and the Selects mock that produces a
visible pop-in — mark those `priority`.** Genuinely heavy below-fold imagery can still lazy-load
normally.

**Process note.** I gave a confident mechanical explanation twice — containing blocks, compositing
layers, the `.reveal` filter — and it was wrong both times. It was plausible, it fitted the
evidence I had, and one controlled test with a plain control disproved it in under a minute. The
control is what did the work: without it I would have "confirmed" the theory and shipped a false
rule into the roadmap.

### Sphere and cover images halved to 280px (2026-09-25)

**1,740K → 672K, a 62% cut** — better than the ~50% predicted, because JPEG size falls faster than
linearly with dimension.

Measured headroom after the change, on fresh cache-busted fetches:

| | |
|---|---|
| Source | 280px |
| Largest node rendered | 72px |
| Ratio | **3.9×** |
| Headroom on a 2× retina display | **1.9×** |

Still nearly double the pixels a retina screen needs, and no visible loss at display size.

**This is what makes eager loading the right answer rather than a tradeoff.** The only real
objection to loading all 25 faces up front was weight; the weight just dropped by two thirds. When
the page becomes a Next route, these want `priority` on `next/image` — not because lazy is broken
(it is not, see the correction above) but because a sphere that fills in as you scroll reads as a
half-loaded page.

400px originals kept at `/tmp/img-400-backup/` for the session. Not worth preserving further given
the retina headroom.

### Stems added — and the asset list made consistent (2026-09-25)

Owner asked to add stems to the Sound Vault hero. The same list turned out to appear **three times
with three different contents**:

| Where | Was |
|---|---|
| Hero slide 2 lede | Masters, artwork, metadata and documents |
| Sound Vault popover | **the master** (singular), artwork, metadata and documents |
| How-it-works step 5 | Masters, artwork and metadata — **no documents** |

Now one canonical list everywhere: **masters, stems, artwork, metadata and documents.**

Stems are real and distinct — `components/vault/StemsUpload.tsx` (310 lines), and they use the
250MB resumable upload path rather than the 50MB one-shot route Writer's Room takes use
(`lib/catalogue/audio-mime.ts:13`). Worth knowing they are a separate asset class, not a synonym
for masters.

**Pattern worth watching:** this is the third time a fact has drifted across surfaces on this page
(the others were the attribution unit — line vs section — and the eyebrow numbers). Anything stated
in more than one place should be checked against the others when it changes.

**Credits added to both Sound Vault surfaces** (2026-09-25): *masters, stems, artwork, **credits**,
metadata and documents.* Real — `types/catalogue.ts:82` has `performers` as declared per-recording
credits feeding DDEX.

**Step 5 deliberately excluded.** It already says *"credits already filled in from the writing
rather than a last-minute round of emails"*, which is stronger than a list item because it says
where the credits came from. Adding them to its list would mention credits twice in one sentence.

So the division is: the two Sound Vault surfaces enumerate what the vault **holds**; step 5
explains how the credits **got there**.

**Six items is the ceiling for that list** — past this it reads as inventory rather than copy. If
anything else needs adding, group rather than extend.
