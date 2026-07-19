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

1. SignWell: per-document vs per-signer billing; template/envelope semantics; whether embedded signing for multi-party async signing (collaborators sign days apart) works cleanly; true cost curve 100/1k/10k docs/mo (get actual quote if possible). **Mobile: verify the embedded widget at phone viewport — thumb-signable, no redirect.**
1b. **Mobile embedded-signing UX shootout (REQUIRED, per locked requirements):** test SignWell and DocuSeal (and Documenso if licensing clears) embedded signing on a real phone: signature capture with a thumb, field navigation, load weight on cellular, behavior inside a WebView/PWA context. The studio-with-only-a-phone scenario is the canonical test case. A provider that fails this is disqualified for split sheets regardless of price.
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

## Locked requirements (2026-07-18, Pete)

These are REQUIREMENTS for any e-sign mechanism Funūn ships, decided ahead of the open questions below:

1. **Seamless embedding** — signing happens inside the Funūn experience; the user is never taken elsewhere. This is a hard requirement, not a preference. (Rules out any provider tier that redirects to a vendor-hosted page — e.g. Dropbox Sign's sub-$300 tiers.)
2. **Mobile-first signing** — split-sheet signing conversations happen in studios where collaborators most likely have only their phones. The embedded signing surface must be genuinely easy on a phone: tap-friendly, no pinch-zoom archaeology, signature capture that works with a thumb. This is a product-positioning bet: being the most convenient split-sheet solution on the market for artists and songwriters IS the wedge.
3. Consequence for provider evaluation: **mobile embedded-signing UX is a first-class evaluation axis**, equal to price and audit-trail quality. Any sandbox spike must test on a phone-sized viewport (and ideally a real phone in one hand), not a desktop browser.

## Architecture decision (2026-07-18, Pete)

**Dual-provider behind `lib/esign/provider.ts` is the direction:**
- **SignWell for admin-initiated sync licenses** (16-09, as planned): low volume, buyer-facing polish, and the hosted provider's legal defensibility (audit trail, completion certificates, vendor-attested signing records) is worth the per-document cost on a transaction that actually produces revenue. A real sync placement deserves paid-grade paper.
- **DocuSeal-or-similar for artist split-sheet volume** (provider NOT yet final): unit cost dominates at catalog scale; candidate must meet the embedding + mobile requirements above. DocuSeal's hosted $0.20/completed-document tier (multi-party = one completion) is the front-runner on price; its mobile embedded UX and audit-trail quality are the open verification items.
- The provider interface stays the single seam: neither the deal flow nor the split-sheet flow imports vendor code.

## Spike results (2026-07-18 — spikes 006a/006b/007, see .planning/spikes/)

The mobile shootout and licensing verification RAN. Summary:

- **006a DocuSeal mobile (VALIDATED):** full signing flow completed at 375px on DocuSeal's live embedded demo — bottom-sheet field wizard (never hunt/zoom the PDF), one-tap Set-Today date, signature via draw / type / **camera capture of a wet signature**, zero redirects. The mobile disqualification test does NOT disqualify the front-runner; its phone ergonomics are the best seen.
- **006b SignWell mobile (VALIDATED, caveats):** embedded flow completed at 375px on SignWell's live demo. Document-centric guided tabs rather than a wizard; first-paint horizontal overflow; small on-document tap targets; Type/Draw/Upload modal (no camera). Fine for the buyer-facing sync-license flow (16-09); notably less phone-native than DocuSeal for the studio split-sheet case. Also confirmed for 16-09: X-Api-Key auth header, completed/closed embed events, webhook HMAC scheme still unpublished (Task 1 checkpoint stands).
- **007 licensing/audit (VALIDATED):** hosted-DocuSeal path is **AGPL-clear** — `@docuseal/react` embed SDK is MIT (verified on npm); AGPL only binds if self-hosting the server. **Correction to earlier research:** embedded signing is a PAID Pro feature even self-hosted, so the hosted ~$0.20/completed-doc tier is the realistic path (self-hosting buys little). Audit story credible: Certificate of Signature PDF, ESIGN/UETA/eIDAS positioning, cryptographic doc-hash signatures — quality of the actual certificate artifact still needs one real inspection.

**Standing after spikes:** dual-provider direction (D-18b) holds and strengthens — SignWell validated for the sync-license embed, DocuSeal validated on all three desk-checkable axes for split sheets. Remaining before the split-sheet provider is FINAL (all account-gated): certificate artifact inspection, white-label scope/price, multi-party async template test, deliverability. The access-model economics (Options A–D) remain the open deliberation.

## Decision record

- 2026-07-18 — Deliberation opened; NO decision. 16-09 (sync-license e-sign, SignWell) proceeds unchanged. Wave 2 upload-only flow remains the split-sheet path for now.
- 2026-07-18 (later) — Pete locked two REQUIREMENTS (seamless embedding; mobile-first signing) and the DUAL-PROVIDER architecture (SignWell for sync licenses — legal defensibility worth the cost on revenue transactions; a cost-optimized embedded provider for split-sheet volume). Still open: which provider serves split sheets (DocuSeal front-runner pending mobile-UX + audit-trail + licensing verification), and the free/paid/metered access model (Options A–D) — the economics question this deliberation exists for. Mobile UX added as first-class evaluation axis to the research agenda. D-18b added to 16-CONTEXT; 16-09 must-haves updated with the mobile viewport check.
