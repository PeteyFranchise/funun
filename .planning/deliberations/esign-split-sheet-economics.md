# Deliberation: E-Sign Economics — Split Sheets as the Real Volume Driver

**Opened:** 2026-07-18 by Pete (raised during Phase 16 e-sign provider discussion)
**Status:** OPEN — marked for serious GSD deliberation after research. No decision made.
**Blocks:** nothing today (16-09 scope is sync-license e-sign only). Informs: e-sign provider commitment depth (D-18a), free/paid tier design, monetization roadmap.

---

## The reframing (why this deliberation exists)

D-18a chose SignWell on **sync-deal volume**: 3–5 licenses/month during beta, effectively free under the 25-doc/month tier. Pete's correction: **sync licenses are not the e-sign volume driver — split sheets are.**

- Funūn generates split sheets so artists and collaborators can sign *between each other*, long before any sync deal — it's part of meeting the documentation bar to even be considered for sync.
- This is core to the one-stop-shop / "entire career lives here" stickiness thesis, and a draw for business-minded artists specifically.
- Signed split sheets later become part of the natural document package any sync license requires (chain of title).
- **The cost inversion:** every e-signed split sheet costs Funūn money at the moment of signing, potentially years before (or without ever) producing sync revenue. An artist can have MANY signed split sheets and zero deals. Free-tier artists using Funūn purely for networking + master/metadata/document storage — which is fine and wanted — are a pure e-sign cost center if e-sign is free.

**Scale context:** competitors carry 60,000+ song catalogs. Funūn's *sync-worthy* subset will be curated, but the platform could plausibly hold thousands of artists × several collaborators × multiple songs each. At SignWell's published $0.85/doc entry rate: 1,000 split sheets/month ≈ $830/month; 10,000 ≈ ~$2,000–8,500/month depending on volume tier. Not catastrophic, but real pre-revenue burn that scales with success at *adoption*, not success at *revenue*.

## Current shipped state (grounding — verify before deliberating)

- Wave 2 shipped **upload-only** e-sign: Funūn generates the split sheet PDF, artists wet-sign offline, upload back; per-document signed/pending status tracked in Contract Locker, linked to vault projects. **This is already Pete's "option 3" and it works today.**
- `lib/esign/provider.ts` abstraction exists; no live provider account has ever been activated.
- Phase 16 (16-09) plans the FIRST live e-sign integration — SignWell, scoped to **sync licenses only**, admin-initiated, low volume. Nothing in Phase 16 gives artists self-serve e-sign for split sheets.
- Composer records already carry email/phone fields explicitly annotated "used to send the split sheet for e-signature" — the product has been pointing at this feature since Wave 2.

## The options on the table (Pete's framing, expanded)

**A. Everyone gets e-sign from day one; paid tiers / license revenue eventually cover it.**
   + Strongest wedge for business-minded artists; frictionless story; maximizes signed-doc coverage of the catalog (which raises sync-readiness platform-wide).
   − Cost scales with adoption not revenue; free riders unbounded; hard to claw back a free feature later (loss-aversion backlash).

**B. Gate e-signed split sheets to paid-tier artists; free tier keeps generated-PDF + wet-sign upload (current shipped behavior).**
   + Costs borne by those signaling willingness to pay; e-sign becomes a clean, understandable paid-tier feature; free tier still gets the full document workflow, just with manual signatures.
   − Weakens the wedge exactly for the ambitious-but-broke artists Funūn wants early; wet-sign friction may mean fewer documented songs overall, hurting the platform's sync-ready inventory.
   − NOTE: Funūn currently has no artist paid tier at all — this option implies designing one, which is a milestone-scale decision, not a toggle.

**C. Free tier = generated PDF + wet-sign upload; e-sign as a metered/earned perk rather than a tier.**
   Variants worth researching: N free e-sign envelopes per artist (lifetime or /year); e-sign unlocked per-project when a project hits a readiness threshold (ties cost to sync-funnel quality); e-sign unlocked when selected for the sync program (cost lands only on revenue-adjacent artists); pay-per-envelope at cost (~$1) as an à-la-carte microtransaction.

**D. Cover costs through third-party revenue instead of gating: targeted advertising in the Green Room feed** (guitar brands, MIDI hardware/plugin makers, DAWs — categories the member base genuinely wants). Admin-curated placements infrastructure ALREADY EXISTS (Phase 12: green_room_placements, admin UI, visibility gates) — sponsored placements were designed in from the start. This is a monetization lane regardless of the e-sign question; the deliberation point is whether it can *subsidize* free e-sign, and on what timeline (ad revenue needs audience scale that beta won't have).

These are not mutually exclusive: plausible end-state is C + D (metered free e-sign, subsidized by ads/deal revenue, with wet-sign always available as the floor).

## Considerations to weigh (both directions)

- **Stickiness asymmetry:** a signed split sheet stored in Funūn is high-gravity data — collaborators' signatures live there. Wet-signed uploads have the SAME gravity once captured. The stickiness argument supports easy *generation and storage* for everyone; it does not by itself require free *e-signatures*.
- **Legal parity:** a wet-signed, scanned split sheet is just as valid as an e-signed one. The e-sign premium is convenience/completion-rate, not validity.
- **Completion-rate value is real though:** chasing 3 collaborators for wet signatures is exactly the friction-death the founding thesis targets. E-sign completion rates are materially higher. Research should try to quantify this.
- **Per-document vs per-signature pricing:** SignWell prices per DOCUMENT. A split sheet routinely has 2–5 signers. If one envelope covers all signers, the cost story improves ~3× vs per-signature mental math. VERIFY this in research — it changes every number in this deliberation.
- **Provider fit re-check (D-18a):** D-18a was decided on sync-license volume. If split-sheet e-sign at artist scale is coming, the provider evaluation should be re-run against 100–10,000 docs/month projections (SignWell's published curve still looks favorable, but e.g. Documenso (open-source, self-hostable), Docuseal, or others might change the calculus at volume — self-hosted = near-zero marginal cost, at the price of compliance/ops burden). D-18a is NOT reversed — 16-09 proceeds for sync licenses — but its scope should be understood as "beta sync licensing," not "Funūn's e-sign strategy forever."
- **Free-tier abuse surface:** unlimited free e-sign is also an abuse vector (using Funūn as a free DocuSign for non-music documents). Any free allowance needs the split-sheet template to be the only free envelope type.

## Research agenda (before the GSD deliberation session)

1. SignWell: per-document vs per-signer billing; template/envelope semantics; whether embedded signing for multi-party async signing (collaborators sign days apart) works cleanly; true cost curve 100/1k/10k docs/mo (get actual quote if possible).
2. Self-hosted alternatives (Documenso, Docuseal): compliance posture (ESIGN/UETA/eIDAS), ops burden, audit-trail quality vs hosted providers.
   **Preliminary findings (2026-07-18, web research — verify before deciding):**
   - **Both support embedded signing** with first-class SDKs, arguably more dev-friendly than Dropbox Sign's iframe model. Documenso ships `@documenso/embed-react` (+ Vue/Svelte/Solid/Angular/web-component variants) with direct-link-template and per-recipient signing-token modes. DocuSeal ships embeddable signing-form components for React/Vue/Angular/plain JS.
   - **Documenso gating:** on their hosted cloud, embedding requires Teams plan or above, and white-label embedding (`embedSigningWhiteLabel`, `hidePoweredBy`) is Enterprise-gated. Self-hosting removes the plan gates but Documenso is AGPL-licensed — verify the licensing implications for embedding into a commercial SaaS before committing (their "Early Adopter" and platform terms have shifted over time).
   - **DocuSeal pricing found:** API + embedding require a Pro seat (~$20/mo) and then **$0.20 per completed document** with volume discounts — and notably "a single document submission that includes multiple files signed by multiple parties counts as a single $0.20 completion." For split sheets (one doc, 2–5 signers) that is ~4× cheaper than SignWell's $0.85 entry rate and equals SignWell's published high-volume floor, at low volume. Self-hosted DocuSeal (Docker, AGPL core) is free with iframe embedding and free white-labeling, BUT verify whether API/embedding license keys are still required when self-hosted — sources conflict.
   - **Net:** the "self-hosted = near-zero marginal cost" thesis holds technically, but the practical sweet spot may be DocuSeal's *hosted* $0.20/doc tier: SignWell-floor pricing without the ops burden. The real evaluation axes vs SignWell become audit-trail quality, deliverability (their SMTP vs yours), template ergonomics for the split-sheet form, and AGPL/licensing hygiene.
3. Competitor benchmark: do any artist-platform competitors offer free e-signed split sheets? What do TuneCore/DistroKid/Songtrust charge for split-sheet tooling, if they have it?
4. Wet-sign completion-rate vs e-sign completion-rate data (industry or vendor studies) — quantifies what gating actually costs in documented-catalog coverage.
5. Green Room ad monetization sizing: realistic CPM/sponsorship revenue at 1k/5k/20k MAU against e-sign burn at matching adoption; validates or kills the D subsidy path. (Placements infra from Phase 12 is reusable; Buffer-integration spike findings may be adjacent for social-adjacent revenue.)
6. Paid-tier landscape prerequisite: what would an artist paid tier even contain besides e-sign (this deliberation shouldn't accidentally design the tier, but the deliberation can't conclude "gate to paid tier" without knowing one is viable).

## Related standing items

- ROADMAP "Embedded License-ID Metadata" candidate — per-license generated artifacts; same "documents as provenance" thesis.
- 16-CONTEXT deferred: GRid artist-value discussion pass — same "unexplored artist value" review Pete wants; consider running these deliberations together.
- Account-model post-beta review (memory: cross-capability + buyer unification) — if a paid tier emerges from this deliberation, it lands in the same account-model review.

## Decision record

- 2026-07-18 — Deliberation opened; NO decision. 16-09 (sync-license e-sign, SignWell) proceeds unchanged. Wave 2 upload-only flow remains the split-sheet path for now.
