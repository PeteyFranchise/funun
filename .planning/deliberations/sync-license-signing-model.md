# Deliberation — Sync-License Signing Model (blanket pre-auth vs per-deal)

**Status:** OPEN — pending owner decision + music/IP legal counsel
**Opened:** 2026-08-03 (owner, mid Phase 16 Wave 3)
**Last refined:** 2026-08-11 (flat-rate opt-in mechanism — see refinement below)
**Blocks:** Phase 16 plan **16-09** (sync-license e-signing) — DEFERRED until this resolves · **Phase 24 Lane 2** (subscription self-serve — the flat-rate opt-in is its load-bearing consent)
**Related:** `esign-split-sheet-economics.md`, Phase 16 CONTEXT D-18a/b/c (DocuSeal provider), 16-04 (pre-cleared terms), `.planning/phases/24-buyer-onboarding-self-serve/24-RESEARCH-paid-tiers.md` (§8 hybrid, §9 content protection)

---

## The question

How does a sync license get **signed** — per deal, or once up front?

- **Per-deal signing** (what 16-09 was planned around): every license = artist signs + buyer signs, each time. The DocuSeal signing-*order* question (artist-first / buyer-first / parallel; `order: 'preserved'`) exists only because the artist is in every per-deal envelope.
- **Blanket pre-authorization** (owner's proposed model, 2026-08-03): the artist signs **once at onboarding** a standing agreement authorizing Funūn to execute sync licenses on their behalf, within terms the artist controls. At deal time the artist is NOT in the envelope; only the buyer signs (+ Funūn countersigns as authorized agent). The song reaches the buyer **already cleared** — buyer can sign first or in parallel.

## Why the owner leans blanket

Frictionless clearance is the GTM wedge: "instantly licensable catalog, no artist chase" is exactly what a sync buyer wants, and it removes the studio-phone availability problem (Phase 16 D-18b). If the artist isn't a per-deal signer, the signing-order question largely dissolves.

## How it plugs into what's already built

- **16-04 pre-cleared terms** = *what* an artist will license + price floor.
- **Blanket authorization (new)** = *permission to execute* within those terms.
- Together they are what let a buyer sign alone.

## Refinement (owner, 2026-08-05) — WHERE the blanket agreement lives

The buyer-onboarding discussion refined the blanket agreement's home: it is signed at **sync-library
submission** (per song/catalogue admission), **not** as a generic account-signup ToS. When a (chosen/invited)
artist submits songs to the sync-library, they **sign a blanket agreement authorizing Funūn to shop those
songs** — and that authorization is what turns on public view + admits the song to the catalogue. See the
**inclusion decision** (`buyer-catalogue-inclusion-model.md`, resolved 2026-08-05) and **Phase 26
(Sync-Library Inclusion)**, which owns the artist submission + blanket-agreement e-sign flow.

**Open scope question this raises (carried into Phase 26 + here):** does that submission-time blanket
agreement *also* pre-authorize licensing **terms** (true blanket pre-auth → buyer signs alone), or only
authorize Funūn to **shop** (with per-deal signing still needed)? That is the crux this deliberation still
must settle with counsel — the inclusion decision fixed *that* there's a blanket agreement, not its full legal scope.

## Refinement (owner, 2026-08-11) — the flat-rate opt-in mechanism (Lane 2 / subscription)

Prompted by the Phase 24 hybrid plan (Lane 1 = AE per-deal single-track sync, unblocked now; **Lane 2 =
Musicbed-style subscription** for small buyers — signing-model-gated). Owner asked: *for the flat-rate opt-in
Lane 2 needs, can we later change the Terms of Service and have all artists sign off that way — sequenced
after the Content ID aggregator clearance?* Working position (not a legal ruling — see caveat):

- **A terms change CAN be the vehicle, but the safe form is affirmative opt-in / re-consent — NOT a silent
  "we updated the ToS, continued use = you agree" update.** Flat-rate licensing is a **material** change: the
  artist goes from *"you shop deals, I approve the price per deal"* to *"you may license at a rate you set,
  without my per-deal say."* That cedes price control — a real concession. Broad IP-rights grants accepted by
  continued use are the most challengeable kind; a change this consequential wants conspicuous notice +
  affirmative consent, and it **cannot unilaterally override** the price term of an already-signed per-deal
  agreement without the artist's active agreement.
- **Cleaner structure:** *new artists* — bake the flat-rate opt-in into onboarding/submission terms from day
  one. *Existing artists* — an explicit in-app "review & accept the flat-rate addendum" re-consent flow.
  **Granular + revocable:** artists opt specific tracks (or whole catalogue) *into the subscription pool*, can
  opt out. The subscription-licensable pool then **grows as artists opt in** — a subset of the browsable
  catalogue — which fits "as we build the catalogue" (Lane 1 AE deals cover everyone else meanwhile).
- **One intertwined instrument (key sequencing insight):** the *same* opt-in agreement is where you'd also
  get the artist/distributor's **authorization for the aggregator to clear Content ID** on those tracks
  (see [[no-direct-youtube-content-id]] — Funūn never administers Content ID directly). So the legal opt-in
  and the clearance authorization are **one instrument, not two sequential steps.** Practical consequence:
  the two Lane 2 prerequisites — (1) flat-rate opt-in and (2) aggregator clearance — should be **designed
  together and can run in parallel** (draft the opt-in with counsel while the aggregator partnership is
  negotiated); both must be *done* before Lane 2 launches, but #2 does not strictly gate starting #1.
- **Caveat:** this is general framing, not legal advice — the exact vehicle (ToS addendum vs separate signed
  agreement), consent flow, opt-in-vs-opt-out, revocation, and interaction with existing signed agreements
  are a **music/IP counsel** decision. This is the *core* of this deliberation's still-open scope question.

## Open sub-decisions (to resolve before building 16-09)

1. **Legal validity + wording** — a blanket "license my copyright on my behalf" grant is real rights transfer. Needs tight scope (which works, which use types, price floors, exclusions), genuine consent (not a buried ToS checkbox), revocation, and per-buyer/per-use veto. **Requires music/IP counsel — not an engineering decision.**
2. **Hybrid?** Likely end state: blanket pre-auth as default for the frictionless catalog + a per-work "ask me first" flag for songs an artist wants to gatekeep + revocation. Preserves speed AND artist control. (Owner previously noted the likely answer is "a combination.")
3. **The onboarding signing surface** — the blanket agreement itself still needs signing at signup (DocuSeal or wet-sign upload). That moves the e-sign moment from per-deal to onboarding, but does not remove it.
4. **Funūn-as-agent representation** — the executed license must show Funūn signing on the artist's authorization; how that appears on the document and in `esign_envelopes`.
5. **DocuSeal `order: 'preserved'` technical behavior** — still worth confirming (the blanket agreement or a Funūn-countersign may need ordered signing somewhere), but it is NO LONGER the gating question; the product/legal model is.

## Decision on the build (owner, 2026-08-03)

- **Defer 16-09.** It implements the signing architecture, which is exactly what's undecided; building now would hard-code a guess on a revenue-transaction contract.
- Resolve this deliberation (owner + counsel) → then re-scope and build 16-09 (likely: onboarding blanket-agreement signing + buyer-only per-deal signing + Funūn agent countersign).
- Finish the rest of Phase 16 around 16-09 (16-08 Stripe, Wave 4 delivery/metrics) so the buyer portal ships end-to-end except the final signature step.
