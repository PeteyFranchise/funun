# Phase 24 — Paid-tier model research (buyer self-serve)

> Research pass for the Phase 24 business-model decision (roadmap item (a): a paid tier that
> lets buyers preview/access catalog ahead of licensing). Compiled 2026-08-10 from public
> pricing pages/reviews; **treat prices as mid-2026 ballpark — verify current before quoting.**
> Companion to the content-protection question (b), summarized at the bottom.

## The one thing that reframes this decision

The competitors below almost all win with **subscription-as-license**: pay a monthly/annual fee,
download unlimited tracks, and the subscription *is* the license. That works because they **own or
exclusively/blanket-license their whole catalog at flat rates**.

**Funūn does not have that.** Per the sync-license signing model, Funūn *represents* independent
artists' catalogs and pays them **per deal** (artist→Funūn blanket pre-authorizes terms **except
price**; price is set per placement). So Funūn **cannot** offer "subscription = unlimited license to
the whole catalog" without a *separate* artist opt-in to flat-rate/blanket pricing — which is exactly
the unresolved **sync-license signing model** + **Phase 29 (flat-price self-serve)**.

**→ The market-winning paid tier (sub-as-license) is coupled to the signing-model decision. The
version of Phase 24 that's buildable *without* it is a weaker "paid access/preview membership."**
That tension IS the business-model call.

## Three archetypes

### 1. Subscription-as-license (the dominant model)
Sub = the license. Tiered either by **use** (personal → commercial → business) or by **content
bundle** (music → music+SFX+video+AI). Unlimited downloads. Requires flat-rate rights to the catalog.

| Platform | Entry (personal) | Commercial | Business/Team | License validity | Notes |
|---|---|---|---|---|---|
| **Epidemic Sound** | Creator ~$9.99/mo (annual) | Pro ~$16.99/mo | Business ~$29.99/mo; Enterprise custom | **While subscribed** (safelisting active) | Tiered by USE; 1 channel/platform on lower tiers; Content-ID safelisting |
| **Artlist** | Music Pro ~$16.58/mo | (same) | Max ~$39.99/mo (music+video+AI bundle); AI to $99.99 | **Perpetual** — keep what you used forever, even after cancel | Tiered by CONTENT bundle; "universal" license |
| **Soundstripe** | Personal $9.99/mo (non-commercial) | Pro $19.99/mo | Pro Plus $33.99/mo (+video); Business ~$999/yr | Perpetual for licensed use | Single-use track $49 |
| **Uppbeat** (freemium) | **Free** w/ attribution + ~3–10 dl/mo | Premium ~$7.99/mo (no attribution, full catalog, whitelisting) | — | While subscribed | Undercuts everyone; smaller catalog (~10k) |
| **Audiio** (lifetime) | Annual $199/yr | (same) | — | **Lifetime** $299 (music) / ~$498 (+SFX) one-time | Rare lifetime option |

**Pricing shape:** entry ~$8–10/mo, commercial ~$17–40/mo, business ~$30–100/mo or ~$999/yr,
enterprise custom. Annual billing ~40–50% cheaper than monthly.

### 2. Agency / per-deal, rights-managed (Funūn's native model)
Browse → license **per placement**, custom-priced by **scope / media / reach**. Preview/"comp"
the track in your edit before you license it for real.

- **Marmoset** — à-la-carte per-project sync, negotiated per placement; also does custom scoring;
  also runs **Track Club** (a separate subscription product with stems/AI search). This is the
  closest analog to Funūn's represent-and-negotiate posture.
- **Musicbed (single-track)** — per-use licenses from ~$59, priced by use.

### 3. Hybrid (subscription for volume + per-deal for premium)
- **Musicbed** — unlimited annual **subscription** (categories: Individual / Business / Non-Profit /
  Wedding, ~$30–100/mo by category) **AND** single-track (~$59+). Same category structure across
  both, so buyers compare cleanly.
- **Marmoset + Track Club** — negotiated licensing alongside a subscription tier.

## Options for Funūn's Phase 24 paid tier

- **A — Paid buyer MEMBERSHIP (access/preview, NOT a license).** A "Pro buyer" subscription that
  grants enhanced *access*: full-catalog browse, **watermarked preview/comp downloads** for
  consideration, saved shortlists, early access to new drops, priority AE response. Licensing still
  happens **per deal** (existing flow). **Buildable now — decoupled from the signing model.** Weaker
  value prop (buyers may balk at paying for access *and* per-deal licenses).
- **B — Subscription-as-license (Epidemic/Artlist-style).** The market-winning model, but requires a
  curated sub-catalog where **artists opt into flat-rate/blanket-price licensing** → gated on the
  sync-license signing model **and** Phase 29 **and** artist supply. Bigger, later.
- **C — Freemium (Uppbeat-style).** Free browse + limited watermarked comps (friction: attribution/
  caps/watermark) → paid tier removes friction, unlocks full preview + (if/when B exists) licensed
  downloads + channel whitelisting. Pairs naturally with A or B.
- **D — Hybrid (Musicbed-style).** Paid membership + a **flat-price self-serve** lane (Phase 29) for
  small deals, with AE-negotiated for premium/exclusive. The likely long-term end state — but it
  needs the signing model resolved for the flat-price lane.

## Content protection (question b) — corrected for Funūn (does NOT own the catalog)

**CORRECTION (owner, 2026-08-10):** the subscription libraries above register their catalog in YouTube
Content ID because they **own / exclusively license** it. **Funūn must NOT do this.** Funūn *represents*
independent artists; it doesn't own the songs. Content ID requires verifiable ownership/exclusive
rights, YouTube gates direct Content ID access to large owned-catalog rights holders (not attainable/
appropriate for a representative), and the artists' released music is typically **already in Content ID
via their own distributors** — so Funūn registering would double-claim, false-claim the artists' own or
their fans' uses, or assert rights it doesn't hold. This is already an explicit out-of-scope constraint
(16-CONTEXT: *"Direct Content ID administration."*).

What Funūn does instead:

1. **NOW — in-house, no ownership required:**
   - **Watermarked preview vs clean-licensed download.** Buyers only ever get a **watermarked comp**
     (audible tag deters; inaudible **forensic** watermark tied to the buyer traces a leaker; survives
     compression/re-recording). The clean master is released **only after an executed per-deal license**.
   - **Embedded license-ID metadata** in every delivered file — provenance tying the file to a specific,
     verifiable license. Pure engineering, no vendor dependency; strengthens the "artists paid fairly,
     everything documented, consent explicit" pitch.
2. **LATER — partnership, NOT a Funūn build:** once catalog + deal volume justify it, partner with a
   **Content ID aggregator** that already holds direct Content ID access (AdRev/Symphonic, Pex, Song Zu,
   Too Lost) and plug Funūn's license DB in, so a *licensed* buyer's upload is auto-cleared (Musicbed's
   **SyncID** model) — **with the artist/distributor's authorization**. Funūn never becomes the Content ID
   owner. This is a partnership/negotiation task, not engineering.
3. **The real wrinkle (ties to the signing model):** a released track is often already in the artist's
   **distributor's** Content ID, so even a *licensed* buyer's video can get claimed by that distributor.
   The per-deal license therefore needs a **clearance mechanism** — via the aggregator partner, or
   coordinated per-deal with the artist/distributor — to release the claim on licensed use. Another
   reason the sync-license signing/clearance model is load-bearing.

## Follow-ups (owner Qs, 2026-08-10)

**Q1 — Is there ANY scenario where Funūn should hold its own Content ID?** Yes, one narrow, legitimate
case: tracks where Funūn holds **exclusive** sync + Content-ID-administration rights AND that are **not
already registered in anyone else's Content ID** — i.e. **unreleased / Funūn-exclusive Sync Library
catalog** (exactly how production-music libraries operate). Even then Funūn wouldn't get direct YouTube
CMS access at its stage — it would register through a **Content ID aggregator** (AdRev/Symphonic,
Pex/Vobile). Requirements: (a) an exclusive artist grant covering Content-ID admin; (b) no existing
registration to conflict with — Content ID can't have two owners of the same reference in a territory;
(c) aggregator access. For the **default** model (non-exclusive representation of already-distributed
tracks) it stays a NO. **→ Signing-model decision: does Sync Library inclusion grant Funūn EXCLUSIVE
rights (Content ID viable for that subset) or non-exclusive (not)?**

**Q2 — How do we FLAG unlicensed use? What is MusicBed's "ID"?** Separate the two halves:
- **Detection (flag *any* use).** Two ways: YouTube's own **Content ID** (requires ownership → not
  Funūn) OR **third-party audio-fingerprint monitoring** — ACRCloud, Audible Magic, Gracenote,
  **Pex (Vobile)** — which scan YouTube + dozens of social/UGC platforms for a track's fingerprint
  **without any Content ID ownership**. Funūn (authorized by the artist) runs represented tracks through
  one of these, cross-references hits against its **license database**, and flags any use with no Funūn
  license (and not the artist's own authorized use) for follow-up. The **forensic watermark** in preview
  files additionally pinpoints a leaked *preview* to the specific buyer.
- **Clearance (release claims on *licensed* use) = MusicBed's "ID".** MusicBed's system is **SyncID**
  (plus a "**SyncID Key**" — a code the buyer drops in the video description / dispute box). It is NOT a
  detector — it's a **claim-clearing** service: it cross-references (linked channel) × (subscription) ×
  (license) and auto-releases the Content ID claim in seconds for *licensed* users, leaving *unlicensed*
  uses claimed. It works only because **MusicBed owns/registers its catalog in Content ID** (that
  registration is what detects use; SyncID clears it for the licensed). Funūn can replicate this only for
  the exclusive subset in Q1, via an aggregator, with artist/distributor authorization.

**Net:** Funūn's flagging layer = **fingerprint monitoring (no ownership needed) + license-DB cross-ref +
forensic preview watermark.** A SyncID-style auto-clear is only for the exclusive-catalog subset via an
aggregator. Direct Funūn-owned Content ID stays off the table except for that exclusive/unreleased subset.

## Open questions for the business-model discussion

1. **Will buyers pay for access if licensing is still per-deal (Option A)?** Or does a paid tier only
   make sense once it bundles *licensing* (Option B/D) — which needs the signing model?
2. **Is Phase 24 therefore blocked on the sync-license signing model** (like 16-09 and Phase 29), or
   can the Option-A membership ship independently as an interim monetization?
3. **Which tiering axis** — by *use* (Epidemic: personal/commercial/business) or by *bundle*
   (Artlist)? Funūn's buyers are commercial by nature, so a use-based split may be thin.
4. **Free/freemium entry?** A free browse+watermarked-preview tier drives funnel; paid removes
   friction. (Uppbeat proves freemium converts.)
5. **Content-protection scope for beta** — Content ID registration is table stakes; is forensic
   watermarking in scope for the first cut, or audible-tag-only?

## Recommendation (for the deliberation, not a decision)

Lead the discussion with question #2. If the answer is "the paid tier must include licensing to be
worth paying for," **Phase 24 collapses into the same signing-model dependency as 16-09/Phase 29** —
resolve that first, then Phase 24 = Option B/D. If a **paid access/preview membership (Option A)** is
judged worth shipping on its own, it's the one piece that can move **now**, independent of counsel —
and it seeds the buyer base + content-protection plumbing that B/D will reuse.

## Sources
- Epidemic Sound: [pricing](https://photutorial.com/epidemic-sound-pricing/) · [safelisting](https://help.epidemicsound.com/hc/en-us/articles/26248340314258-Safelisting)
- Artlist: [plans](https://artlist.io/blog/artlist-pricing-and-plans-explained/) · [pricing](https://photutorial.com/artlist-pricing/)
- Musicbed: [new pricing](https://www.musicbed.com/articles/at-musicbed/announcing-new-pricing-plans/)
- Soundstripe: [pricing](https://photutorial.com/soundstripe-pricing/)
- Marmoset: [music licensing](https://www.marmosetmusic.com/music-licensing) · [alternatives/Track Club](https://www.marmosetmusic.com/journal/marmoset-music-alternatives-how-do-we-compare/)
- Uppbeat: [pricing](https://uppbeat.io/pricing)
- Audiio: [lifetime](https://audiio.com/lifetime-music-licensing)
- Content protection: [audio watermarking/fingerprinting](https://www.scoredetect.com/blog/posts/how-audio-watermarking-prevents-digital-piracy)
