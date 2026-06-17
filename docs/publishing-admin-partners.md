# Publishing administration partners — scope, fees & integration

Status: **Research / BD reference** · No integration built yet
Last updated: 2026-06-10

Companion to [`cwr-plan.md`](./cwr-plan.md). That doc covers generating registration
artifacts ourselves (CWR + pre-filled portals — "self-submit"). This doc covers the
**partner route**: handing registration + collection to a third party that already
holds the society relationships, so ArtistOS artists get paid end-to-end without us
clearing memberships at 50+ societies.

The short version: **the realistic API path is a publishing administrator's
white-label/partner program — and Songtrust is the strongest lead because it already
powers other platforms' publishing admin. None of these expose a public self-serve
REST API; integration is a BD conversation, not a signup.**

---

## First principle: admin vs. direct-licensor (don't conflate them)

| Model | What it does | Examples | Needs a PRO too? |
|---|---|---|---|
| **Publishing administrator** | Registers your works *into* the global society network (PROs + MLC + mechanical CMOs) and collects through it. Grabs the mechanical + international + publisher-share money your PRO doesn't. | Songtrust, TuneCore, Audiam, CD Baby Pro (defunct) | **Yes** — you keep your PRO for the writer's performance share |
| **Direct licensor** | Pulls digital rights *out* of the CMO system and licenses platforms directly. | ReRight, (Kobalt/AMRA at scale) | Partly — withdrawal model; offline performance stays with PRO |

**None of these replace a PRO** for the writer's performance share (radio/TV/live).
They are complements that capture what the PRO leaves on the table. ReRight is the only
one positioning as a partial PRO *replacement* (digital only, via rights withdrawal).

---

## Comparison matrix

| | **Songtrust** | **TuneCore Publishing** | **Audiam** | **CD Baby Pro** | **ReRight** |
|---|---|---|---|---|---|
| **Type** | Full admin | Full admin | Digital/YouTube specialist | Full admin (bundled) | Direct licensor |
| **Upfront fee** | $100 once / writer | $75 once / writer | none | bundled w/ distribution | undisclosed |
| **Commission** | 15% performance · 20% mechanical | 20% | 20% mechanical · 25% YouTube (3rd-party channel) · 30% back-collection | 15% | undisclosed |
| **Performance (writer share)** | via your PRO | via your PRO | ❌ | via your PRO | digital only, via withdrawal; offline stays w/ PRO |
| **Mechanical (incl. intl)** | ✅ worldwide | ✅ 200+ territories | ✅ digital/streaming | ✅ worldwide | ✅ digital |
| **Sync** | ✅ | ✅ + micro-sync | ✅ | ✅ | ✅ (direct pitching) |
| **YouTube / unclaimed recovery** | partial | partial | ✅ **core strength** | partial | partial |
| **Neighbouring rights (master)** | ❌ (SoundExchange) | ❌ | ❌ | ❌ | ❌ |
| **Territory reach** | 215+ countries / ~98% market | 200+ territories | digital platforms (50+) | worldwide via sub-pubs | global direct, territory-gated |
| **Bundles distribution?** | No (admin only) | No | No | **Yes** (required) | No |
| **Exclusive admin rights?** | Yes | **Yes (exclusive)** | per-catalog | Yes | Yes (rights withdrawal) |
| **Accounting cadence** | ~quarterly | quarterly | faster (digital) | quarterly | monthly |
| **Public API / white-label** | **Yes — powers other platforms** (CD Baby, Symphonic). Best lead. | Not advertised | Not advertised | (was Songtrust under the hood) | Not advertised |

> Fees and terms are as found publicly (June 2026) and change often. Confirm current
> numbers and any exclusivity/term-length clauses directly before relying on them.

---

## Per-partner notes

### Songtrust — primary integration target
- Pure admin, **no distribution bundling** — fits ArtistOS (we're not their distributor).
- Explicitly positions as "the technical partner to the publishing industry" and
  **white-labels its admin to other platforms** — it powered CD Baby Pro and powers
  Symphonic's publishing option. That proven B2B/partner pipe is exactly the
  "intermediary API" we want.
- Full scope: registers with PROs + The MLC + international societies; collects
  performance (publisher share) + mechanical worldwide.
- **Action:** contact Songtrust's partner/Amplified program re: white-label / API onboarding terms.

### TuneCore Publishing — viable alternative
- $75/writer + 20%. Collects **only the publisher's share** (mechanical, print, sync,
  micro-sync, performance) across 200+ territories; the **writer's share is paid
  directly by your PRO**. Requires **exclusive** admin rights. Quarterly accounting.
- No advertised white-label program — likely a consumer-funnel partnership, not an API.
- Note: TuneCore Publishing has had recent program changes — re-verify scope/terms.

### Audiam — specialist add-on, not a full admin
- Digital mechanical + **YouTube** + sync. Core strength is hunting **unclaimed /
  back-catalog royalties** (incl. a SOCAN partnership for US YouTube money).
- Fee tiers: 20% mechanical, 25% YouTube on 3rd-party-channel use, 30% for money
  collected *before* you signed up.
- **Not** a performance-PRO admin. Best framed as a "found money" recovery feature
  layered on top of a real admin, not a Songtrust substitute.

### CD Baby Pro — effectively dead for new signups
- **Pro Publishing was discontinued Aug 8, 2023**; replaced by "CDB Boost." Legacy Pro
  releases keep service. Historically the publishing admin was **Songtrust under the hood**.
- **Do not target as a new partner** — go to the underlying provider (Songtrust) instead.

### ReRight — niche, UK/international + sync (see separate analysis)
- UK direct-licensor. Covers **digital** performance + mechanical + sync by
  **withdrawing digital rights from the CMOs**; offline performance stays with the PRO;
  no neighbouring rights. Fee undisclosed.
- **US limitation:** ASCAP/BMI operate under DOJ consent decrees — a US writer can't
  pull only digital rights while keeping the PRO for broadcast (the Pandora-era
  partial-withdrawal rulings). The withdrawal model fits **UK/EU** writers, not the US
  stack ArtistOS is built around. Revisit if our international user base grows.

---

## How this maps to the readiness-score lanes

The lane-based registration model (see readiness-score discussion) lines up like this:

| Lane | Satisfied by |
|---|---|
| **Performance — writer share** | A **PRO** (ASCAP/BMI/SESAC/GMR, SOCAN…). No admin replaces this. |
| **Performance — publisher share + international** | Admin (Songtrust/TuneCore) or self-publish + foreign sub-pub |
| **Mechanical (US digital)** | The MLC directly (free) **or** an admin |
| **Mechanical (international) / print / micro-sync** | Admin — the main value-add |
| **Sync** | Admin pitching, Audiam, or ReRight |
| **Neighbouring / digital performance (master)** | **SoundExchange** (US) / PPL etc. — separate, none of these |

**Implication:** "enrolled with a publishing admin" is **not one binary flag**. A single
admin satisfies the mechanical + international + publisher-share lanes, but the
**writer-share performance lane still requires a PRO** and the **master lane still
requires SoundExchange**. The score must track these lanes separately.

---

## Recommendation for ArtistOS

1. **Primary:** pursue **Songtrust's white-label/partner program** — full scope, no
   distribution bundling, and a proven B2B pipe (already powers other platforms).
2. **Specialist add-on:** **Audiam** as an optional "recover unclaimed royalties"
   feature — strong YouTube/back-catalog story, complements (doesn't replace) an admin.
3. **Skip:** CD Baby Pro (defunct → go to Songtrust, its underlying provider).
4. **Defer:** ReRight — revisit when we have meaningful UK/EU artists; US consent-decree
   constraint makes it a poor fit for the core US base today.
5. **Always-available baseline:** PRO affiliation + The MLC + SoundExchange are **free
   and direct** — keep the self-submit artifact path (`cwr-plan.md`) as the no-partner
   default so artists are covered even before any partnership lands.

## Due-diligence checklist before signing any partner

- [ ] Exact royalty streams collected vs. excluded (get it in writing)
- [ ] Writer share vs. publisher share — who pays which, and how
- [ ] Exclusivity scope + **term length / exit terms** (how to get works back)
- [ ] Whether they require **withdrawing rights** from an existing PRO/CMO (ReRight)
- [ ] Real fee/commission for *our* volume (and any minimums)
- [ ] Does a **partner/white-label API** exist, or only a consumer funnel?
- [ ] Accounting cadence + statement granularity (per-source data we can show artists)
- [ ] Double-claim conflict handling if an artist is already registered elsewhere

---

## Dual-partner architecture (Songtrust + ReRight)

Can we run **both**? Yes — but only with a clean mandate split. Pointed at the same
digital rights they **conflict**; scoped to their distinct strengths they **complement**.

### Why they conflict (the cardinal risk)
They collect digital money through **opposite mechanisms**:

- **Songtrust** registers a work *into* the society system (MLC/PROs/foreign CMOs) so
  the societies pay out, and collects the publisher share.
- **ReRight** *withdraws* digital rights *from* the society system and licenses DSPs directly.

For the **same composition's digital streaming rights in the same territory** you can't
do both: the DSP/MLC sees **two parties claiming one work** → suspended royalties,
disputes, money in limbo. Any dual setup must guarantee a right is never claimed twice.

### Where they complement
| Lane | Owner |
|---|---|
| Identity/registration (IPI, ISWC, into the global system) | Songtrust |
| Performance — writer + publisher share (radio/TV/live via PROs) | Songtrust (PRO stays) |
| International mechanical, 215+ territories | Songtrust |
| Sync placement | Either (ReRight pitches actively) |
| **Bespoke direct deals** (TikTok Commercial Music Library, custom platform deals) | **ReRight** — its real edge |
| Monthly cash flow on the direct slice | ReRight |

### Two models

**Model A — Backbone + opt-in "direct" overlay.** Songtrust is the universal backbone
(every artist, all territories). ReRight is an opt-in tier for eligible artists; the
rights it handles are **carved out** of the Songtrust mandate per work/territory so
nothing is double-claimed. Higher upside, higher complexity.

**Model B — Songtrust collects everything; ReRight = sync/direct-deal engine only
(RECOMMENDED).** Songtrust does *all* blanket collection incl. digital streaming.
ReRight is used **only** for sync + commercial-library placements — *separate licenses*
from blanket streaming mechanicals, so **no withdrawal, no conflict, no US
consent-decree problem.** Tradeoff: drops ReRight's "withdraw to earn more on
streaming" pitch — which is exactly the conflicting + US-incompatible part.

### What the pairing accomplishes
1. **Full coverage, no gaps** — society baseline for everyone (incl. US) + direct/sync upside.
2. **Moat: ArtistOS becomes the rights router** — owns orchestration of which right is
   assigned to whom per work/territory, *preventing* double-claims. Neither partner
   offers this alone.
3. **Programmatic backbone** — Songtrust's white-label pipe is the API; ReRight bolts on
   as the direct/sync module.

### Conflicts to manage
- **Double-claim on digital rights** — carve at work/right/territory level (Model B avoids entirely).
- **Overlapping exclusivity clauses** — both want exclusivity over *their* slice; needs contractual carve-outs (the hard legal lift).
- **Territory mismatch** — ReRight withdrawal is impractical in the US, so any "direct streaming" tier is effectively non-US.
- **Reconciliation** — two payers, two cadences (Songtrust ~quarterly vs. ReRight monthly), two statement formats to normalize into one artist view.
- **Informed consent** — rights withdrawal is serious and sometimes hard to reverse; surface the tradeoff explicitly before opt-in.

### Recommendation
Partner with both, **lead with Model B**: Songtrust as the universal collection
backbone, ReRight scoped to **sync + direct commercial-library deals** (not streaming
withdrawal). Keep Model A on the roadmap for non-US power users once the rights-router
plumbing is mature.

### Model B lanes (confirmed) + the sync carve-out

| Right | Who handles it | Withdrawal? |
|---|---|---|
| Performance (radio/TV/live + streaming performance) | **PRO** (ASCAP/BMI/SESAC/SOCAN); Songtrust registers as publisher/admin alongside | none — PRO untouched |
| Mechanical (MLC for US digital + international societies) | **Songtrust** | none |
| Blanket streaming royalties | Through the societies (**Songtrust**) | none |
| **Sync + direct commercial-library deals** (e.g. TikTok CML) | **ReRight** | none |

Because nothing leaves the society system, **no consent-decree issue and no territory
barrier** — US artists included. That is the whole win of Model B.

> **⚠ The one contractual seam — the sync carve-out.** Songtrust's admin agreement
> typically *includes* sync representation. In Model B you must **carve sync out of
> Songtrust's mandate** and designate **ReRight as the sole sync agent**, or both could
> claim the same placement. That single carve-out is what keeps Model B conflict-free.
> Everything else (mechanical, performance) stays cleanly with Songtrust + the PRO.

**One-liner:** *Every artist keeps their PRO and gets full Songtrust mechanical/
performance collection; eligible artists additionally get ReRight as their dedicated
sync/commercial-library agent — with sync explicitly carved out of Songtrust's deal so
the two never overlap.*

### Who qualifies for the direct overlay

"Qualify" = **hard gates** (legal/rights — can't proceed without them) + **soft gates**
(readiness/curation/worth-it). Bar differs by tier.

- **Tier 0 — Songtrust baseline:** *no qualification.* Universal, every artist, every
  territory incl. US. The "no gaps" floor.
- **Tier 1 — Sync + commercial-library (Model B):** clean rights + sync-ready assets.
  Open to US *and* non-US (no withdrawal).
- **Tier 2 — Streaming withdrawal (Model A):** Tier 1 gates **plus** territory/PRO gate.

**Hard gates (rights) — disqualifying if unmet:**
- It's a **cover** → composition isn't theirs; direct licensing off the table.
- **Uncleared samples/interpolations** → licensing rights they don't hold (→ SampleClear).
- **Unresolved splits** → can't license un-agreed ownership (→ SplitSheet, signed, =100%).
- **Co-writes with a writer's share administered elsewhere** → partial-claim conflict.
- **Digital rights already assigned to another publisher/admin** → can't double-assign.

**Territory/PRO gate (Tier 2 only):**
- US writers on **ASCAP/BMI do NOT qualify** for streaming withdrawal (consent decrees =
  all-in or all-out). They still qualify for Tier 1 (no withdrawal needed).
- SESAC/GMR (US, no consent decree): more flexible — verify case-by-case.
- **UK/EU writers (PRS etc.):** withdrawal feasible → the ones who qualify for Tier 2.

**Asset/curation gate (sync & libraries):** proper masters, often **stems/instrumentals**,
clean cleared metadata, brand-safe content, curatorial fit. *Eligibility ≠ guaranteed
placement* — being eligible means ReRight can pitch the catalog, not that every track
lands a deal. (ReRight's exact curation criteria aren't public — confirm in the partner
conversation.)

**"Worth it" gate (soft):** direct deals pay off at **volume / clear sync appeal**; a
brand-new artist with a few hundred streams gains little. Gate the *nudge*, not the door.

**Computed eligibility flag:**
```
ReRight-eligible (Tier 1) IF:
  ✓ not a cover            ✓ samples cleared (SampleClear)
  ✓ splits = 100% signed   ✓ no conflicting prior admin assignment
  ✓ sync-ready assets (master + stems/instrumental)
Tier 2 adds:
  ✓ territory/PRO allows digital withdrawal (non-US / non-consent-decree)
  ✓ explicit informed-consent step on the withdrawal tradeoff
```

### Where ArtistOS shines: eligibility as a guided product, not a gate

The strategic point: **most artists won't be eligible on day one — and that's our
opening.** Every hard gate maps to a tool we already have (or should build), so we don't
just *check* eligibility, we **walk the artist into it** and then **coach them on how to
GET the deals**. Eligibility becomes a guided, improvable journey, not a pass/fail wall.

| Gate that blocks them | How ArtistOS moves them past it |
|---|---|
| Unresolved splits | **SplitSheet** — drive to a signed 100% split |
| Uncleared samples | **SampleClear** — assess + draft clearance requests |
| Cover / not original | Flag it; guide toward original or licensed-cover paths |
| Missing sync assets | Prompt for masters + **stems/instrumental**; checklist |
| Conflicting prior admin | Detect + explain how to resolve before opt-in |
| Thin traction ("worth it") | Growth tools (SoundBait, DropReady, The Antenna) build the case |

On top of the gates, **AI coaching on how to win placements**: what sync supervisors and
commercial libraries actually want, how to tag mood/tempo for discovery, how to pitch,
which catalog is most placeable, and what to fix first. We turn "you don't qualify yet"
into "here are the 3 steps to qualify, and here's how to get picked once you do."

**Net:** the partnerships supply the *pipes* (Songtrust collection + ReRight sync/direct
deals); ArtistOS supplies the *guidance layer* that gets artists eligible and gets them
chosen. That guidance layer — powered by our existing tools + AI — is the differentiated
moat neither partner offers alone.

---

## Sources

- Songtrust — [Pricing](https://www.songtrust.com/pricing) · [Technical partner](https://blog.songtrust.com/songtrust-as-your-technical-partner-in-music-publishing-administration) · [Amplified partners](https://amplified.songtrust.com/partners)
- TuneCore — [What royalties they collect](https://support.tunecore.com/hc/en-us/articles/115006689428) · [Cost](https://support.tunecore.com/hc/en-us/articles/115006502527) · [Exclusive admin rights](https://support.tunecore.com/hc/en-us/articles/115006508347)
- Audiam — [audiam.com](https://www.audiam.com/) · [Audiam + SOCAN YouTube service](https://www.socan.com/audiam-socan-provide-new-youtube-service-to-get-music-creators-and-publishers-their-portion-of-millions-of-dollars-of-earned-but-unpaid-u-s-youtube-royalties/)
- CD Baby — [Pro Publishing agreement terms](https://support.cdbaby.com/hc/en-us/articles/203823089) · [Worldwide royalty collection](https://cdbaby.com/cdb-boost/royalty-collection/)
- ReRight — [rerightmusic.com](https://www.rerightmusic.com/) · [Music publishing sub-rights](https://www.rerightmusic.com/blog/what-are-music-publishing-subrights)
