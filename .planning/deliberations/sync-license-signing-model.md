# Deliberation — Sync-License Signing Model (blanket pre-auth vs per-deal)

**Status:** OPEN — pending owner decision + music/IP legal counsel
**Opened:** 2026-08-03 (owner, mid Phase 16 Wave 3)
**Blocks:** Phase 16 plan **16-09** (sync-license e-signing) — DEFERRED until this resolves
**Related:** `esign-split-sheet-economics.md`, Phase 16 CONTEXT D-18a/b/c (DocuSeal provider), 16-04 (pre-cleared terms)

---

## The question

How does a sync license get **signed** — per deal, or once up front?

- **Per-deal signing** (what 16-09 was planned around): every license = artist signs + buyer signs, each time. The DocuSeal signing-*order* question (artist-first / buyer-first / parallel; `order: 'preserved'`) exists only because the artist is in every per-deal envelope.
- **Blanket pre-authorization** (owner's proposed model, 2026-08-03): the artist signs **once at onboarding** a standing agreement authorizing Funūn to execute sync licenses on their behalf, within terms the artist controls. At deal time the artist is NOT in the envelope; only the buyer signs (+ Funūn countersigns as authorized agent). The song reaches the buyer **already cleared** — buyer can sign first or in parallel.

## Why the owner leans blanket

Frictionless clearance is the GTM wedge: "instantly licensable catalog, no artist chase" is exactly what a sync buyer wants, and it removes the studio-phone availability problem (Phase 16 D-18b). If the artist isn't a per-deal signer, the signing-order question largely dissolves.

## How it plugs into what's already built

- **16-04 pre-cleared terms** = *what* an artist will license + price floor.
- **Blanket authorization (new, at signup)** = *permission to execute* within those terms.
- Together they are what let a buyer sign alone.

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
