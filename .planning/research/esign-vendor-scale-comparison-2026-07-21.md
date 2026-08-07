# E-Signature Infrastructure: Technical & Financial Research (external, Perplexity)

**Received:** 2026-07-21 · **Source:** External Perplexity research handoff, provided by Pete
**Status:** Filed for reference — see scope note below before using any figure in this document for planning.

---

## SCOPE NOTE — read this before using anything in Section 3

This research was generated from a prompt describing Funūn as **"a music sync-licensing SaaS platform"** processing **"thousands of e-signature transactions per day"** (~30,000–150,000+ docs/month). That does not match Funūn's actual, decided scope as of this date:

- Split sheets are **free for individual artists**, capped at **25 new recipients/month per artist** (AM-2c, `.planning/FINANCIALS.md` §5).
- Funūn's own re-decision trigger, **AM-3**, fires at **$500/month ≈ 2,500 DocuSeal completions TOTAL across the entire platform** — not per day (`.planning/FINANCIALS.md` §4).
- **Sync licensing is a separate, not-yet-built feature** (Phase 16), explicitly scoped in the deliberation doc at "3–5 licenses/month during beta" (`.planning/deliberations/esign-split-sheet-economics.md` — D-18a's original context).

So Section 3's cost table below — projecting **$6,000 to $225,000/month** — models a business roughly **10–50× larger** than what exists or is currently planned. **Do not read those figures as a Funūn budget projection.** They're a reasonable stress-test of how DocuSeal's and its competitors' pricing *models* behave at hypothetical future enterprise scale, useful if Funūn ever actually reaches that volume, but disconnected from any current decision.

**What DOES hold and is worth keeping**, independent of the scale mismatch:

- **§2 — the multi-tenant sender architecture** ("one platform-level API account; end users passed dynamically as signers, not provisioned as sub-accounts") — this matches what Funūn already built in `lib/esign/docuseal.ts`. Confirms the existing implementation follows the standard pattern used across the vendor field, not an idiosyncratic one.
- **§2.3 — "multi-party, multi-file submissions bill as ONE completion"** — independently confirmed live and NOT just from vendor marketing copy: Funūn's own provider-verification gate tested this directly (`.planning/phases/17-split-sheet-esign/17-PROVIDER-VERIFICATION.md` row (a), 3-signer submission 9477115) and it's the basis for `FINANCIALS.md`'s "a 5-writer sheet costs $0.20, not $1.00" note. This report is a second, independent confirmation from the vendor's own docs.
- **§4 — the AGPL-3.0 licensing note on DocuSeal** — genuinely new, not previously on file anywhere in this repo. Worth flagging to counsel: calling DocuSeal's hosted API from Funūn's separate, closed-source codebase does not itself trigger AGPL's network-use disclosure; that risk is specific to forking/modifying DocuSeal's own source and running the modified version as a network service. Funūn does not do this today (the adapter is a plain `fetch` client, no vendor SDK, no forked source), but this is worth keeping on record if anyone ever considers a custom DocuSeal fork.

Everything else below is reproduced as received, for completeness and future reference if Funūn's actual volume ever approaches the scale this report assumes.

---

*(Original document follows, unedited)*

# Funūn — E-Signature Infrastructure: Technical & Financial Handoff

**Prepared for:** Funūn engineering/finance handoff (for further deliberation with Claude Code)
**Date:** July 21, 2026
**Context:** Funūn is a music sync-licensing SaaS platform. Licensors and licensees sign sync license agreements directly inside the product. Expected volume: **thousands of e-signature transactions per day**, growing. Requirement: embedded, fully white-labeled signing (no vendor branding visible), predictable/low per-unit cost at scale, and clean API integration. **Current state: DocuSeal is already implemented.**

This document consolidates all research findings to date across two workstreams: (1) sender/architecture patterns for multi-tenant embedded signing, and (2) vendor cost/technical comparison at high volume. It's written to be handed to an engineering agent (Claude) for further scoping and to a finance/legal stakeholder for budget and compliance planning.

---

## 1. Executive Summary

- **Architecture pattern confirmed:** In every viable vendor (SignWell, DocuSeal, BoldSign, Anvil, Dropbox Sign), the correct multi-tenant model is **one platform-level API account/seat**, with each of Funūn's end users passed dynamically as a "requester"/"submitter"/"signer" at request time — no per-end-user seat or sub-account is needed or billed. Funūn is the sole billing entity; billing is metered by **document volume**, not by how many distinct humans use the platform.
- **The volume problem:** At "thousands of transactions per day" (roughly 30,000–150,000+ documents/month), essentially every commercial vendor's *published, non-negotiated* per-document/per-envelope rate becomes a six-figure-plus annual cost. This is true even for DocuSeal, Funūn's current vendor — self-hosting removes *infrastructure* markup but does **not** remove DocuSeal's own $0.20/document API fee.
- **Action required now, not later:** Before scaling further on DocuSeal, Funūn needs a **negotiated enterprise volume quote from DocuSeal sales** (they explicitly offer tiered volume discounts on request). Do not extrapolate the $0.20/doc list price to your real volume without this conversation — it is likely materially lower at true scale, but that must be confirmed and put in writing.
- **License risk to flag for legal:** DocuSeal is AGPL-3.0-licensed. Using it unmodified via API/embedding is permitted for commercial use. The copyleft "network use" disclosure obligation is triggered by **modifying or forking DocuSeal's own source** and running that modified version as a network service — not by simply calling its API from Funūn's separate, proprietary codebase. If any engineer forks or patches DocuSeal directly, get legal sign-off first or obtain a separate commercial license from DocuSeal for that derivative.
- **Bottom line recommendation:** Staying on DocuSeal is directionally sound (best cost structure of any vendor researched, genuine self-host option, legally valid under ESIGN/eIDAS), but it must be re-anchored on a negotiated enterprise rate and a properly sized, high-availability self-hosted deployment — not the default cloud Pro plan or an un-negotiated $0.20/doc rate.

---

## 2. Technical Architecture: Multi-Tenant Sender Model

### 2.1 The core question
Funūn has many users; documents are sent user-to-user. Question: is each Funūn user a billable "sender," or is Funūn (the platform) the single sender of record?

### 2.2 Finding
Across every embeddable vendor researched, the answer is consistent: **the platform is the sender of record; end users are passed as dynamic parameters, not provisioned accounts.**

- **SignWell** calls this pattern "custom requesters": *"If your platform sends documents on behalf of many customers, you don't need to create an account or pay for a seat for each of them. Using what we call custom requesters, you set the sender for each document at request time — created in real time within the same API call, with no extra fee and no separate API calls to provision users or senders."* ([SignWell API](https://www.signwell.com/api/))
- **SignWell's "Senders" pricing tier** (1 Sender free, 3 Senders on Business, +$12/mo per additional sender) applies only to people logging into SignWell's *own dashboard* — i.e., Funūn's internal team, not Funūn's customers ([SignWell pricing](https://www.signwell.com/pricing/)).
- **DocuSeal** uses the same split: *"People using the Web UI = Pro seat ($20/month)"* vs. *"1 document signed via API/Embedding = $0.20"* — API-driven submissions to external signers are not seat-gated; only internal dashboard users consume seats ([DocuSeal deep-dive](https://note.com/ai_driven/n/n4c7e4f5f15de?hl=en), [DocuSeal pricing](https://www.docuseal.com/pricing)). Signer identity (name/email) is supplied per API call, with no requirement that the signer hold a DocuSeal account.
- **Dropbox Sign** and **BoldSign** follow the same architecture: embedded/API signers never need their own accounts; billing is per document/envelope against the integrator's single account.

### 2.3 Implication for Funūn's build
- Funūn's backend should hold **one API credential set** per environment (staging/production), not per-user credentials.
- Each sync-license transaction: Funūn's backend calls the vendor's API, passing the licensor's and licensee's name/email as dynamic signer fields, generates an embedded signing session (iframe/JS SDK), and stores the signed document + audit trail via webhook callback.
- **Open question to resolve with the vendor (and re-verify for DocuSeal specifically):** exact definition of a billable "document" — e.g., is a single agreement with 2 signers 1 billable unit, or 2? DocuSeal's docs state *"a single document submission might include multiple files signed by multiple parties — this counts as a single $0.20 document completion"* ([DocuSeal pricing](https://www.docuseal.com/pricing)) — i.e., **multi-party, multi-file agreements are billed as ONE completion**, which is favorable for Funūn's two-party licensing contracts.

---

## 3. Financial Model at Scale

### 3.1 Volume assumptions (for modeling — adjust with real projections)

| Scenario | Docs/day | Docs/month | Docs/year |
|---|---|---|---|
| Low | 1,000 | ~30,000 | ~360,000 |
| Mid | 3,000 | ~90,000 | ~1,080,000 |
| High | 5,000+ | ~150,000 | ~1,800,000 |

### 3.2 Cost at published (non-negotiated) list pricing

| Vendor | Unit rate (list) | Low (30k/mo) | Mid (90k/mo) | High (150k/mo) | Notes |
|---|---|---|---|---|---|
| **DocuSeal** (current) | $0.20/doc + $20/seat ([DocuSeal pricing](https://www.docuseal.com/pricing)) | ~$6,000/mo | ~$18,000/mo | ~$30,000/mo | Same fee applies whether cloud or self-hosted ([Verdocs](https://verdocs.com/docuseal-pricing-guide/)). Tiered volume discounts explicitly offered — "Email sales@docuseal.com for a custom quote" ([DocuSeal](https://www.docuseal.com/pricing)) |
| **SignWell** | $0.20–$0.85/doc, decreasing with volume ([SignWell API](https://www.signwell.com/api/)) | ~$6,000–$25,500/mo | ~$18,000–$76,500/mo | ~$30,000–$127,500/mo | "Custom enterprise plans" and prepay discounts up to 40% at high volume, but exact curve beyond $0.20 floor not published — requires direct quote |
| **BoldSign** | $0.75/envelope flat after 40 free ([BoldSign](https://boldsign.com/electronic-signature-pricing/)) | ~$22,500/mo | ~$67,500/mo | ~$112,500/mo | Marketing claims "volume discounts" exist but no published high-volume curve found ([BoldSign](https://boldsign.com/docusign-alternative/)) |
| **Anvil** | $1.50/executed packet ([Anvil](https://www.useanvil.com/pricing/)) | ~$45,000/mo | ~$135,000/mo | ~$225,000/mo | No published volume-discount curve; would need enterprise negotiation to be viable at this scale |
| **DocuSign / Adobe Sign** | Overages typically $1.50–$2.50/envelope beyond plan caps; API/embedding/white-label require custom Enterprise contracts, often $500+/mo just to unlock ([Zignt](https://zignt.com/blog/e-signature-for-high-volume-contracts), [APIbenchmarks](https://apibenchmarks.com/esign/adobe-acrobat-sign-api)) | Six figures+/mo at list price | Six figures+/mo | Six figures+/mo | Not viable at this volume without deep enterprise negotiation; historically the most expensive path |

**Read on this table:** at published list pricing, *every* vendor is expensive at "thousands of transactions per day." The differentiator is which vendors (a) even publish a path to a real volume discount, and (b) let you self-host to control the infrastructure layer of the cost. DocuSeal and SignWell are the only two in this set with genuine, near-term-negotiable enterprise volume pricing paths; DocuSeal additionally lets you own the infrastructure via self-hosting.

### 3.3 What actually happens at true enterprise volume (context, not a quote)
Real-world negotiated enterprise per-envelope rates for legacy vendors (DocuSign/Adobe) at very high volume are commonly cited in the $0.10–$0.50/envelope range once heavily negotiated — but only for large, established enterprise accounts with multi-year commitments and typically $50k+/year minimums ([Zignt](https://zignt.com/blog/e-signature-for-high-volume-contracts)). For a scaling startup, this is a worse deal (in cash flow terms and flexibility) than negotiating volume pricing directly with an API-first vendor like DocuSeal or SignWell, which don't require large upfront minimums to start.

### 3.4 Self-hosted DocuSeal infrastructure cost (separate from the $0.20/doc vendor fee)

| Deployment tier | Spec | Approx. monthly infra cost | Suitable volume |
|---|---|---|---|
| Small | 1 vCPU / 2GB RAM VPS | ~$15/mo | Up to ~500 docs/mo |
| Medium | 2 vCPU / 4GB RAM + managed Postgres | ~$80/mo | Up to ~5,000 docs/mo |
| Large / HA | 4 vCPU / 8GB RAM clustered app servers, multi-AZ managed Postgres, S3 for PDF storage, Redis for background jobs | ~$250–$500+/mo | Tens of thousands+ docs/mo |

Source basis: [DocuSeal deployment sizing](https://stack-alternative.com/docusign-pricing-vs-docuseal/), [Opsily deployment guide](https://opsily.com/blog/docuseal-self-hosted-free). **At Funūn's target volume (thousands/day), plan for the Large/HA tier from day one** — a single VPS will not reliably handle bursty, high-concurrency signing traffic, webhook delivery, and PDF generation/storage at this scale.

### 3.5 Net financial picture for Funūn
Total realistic monthly cost on DocuSeal at scale = **(negotiated per-document rate × volume) + (HA infrastructure, ~$250–$500/mo) + (Pro seats for internal team, $20/seat/mo) + (DevOps/maintenance time)**. The per-document rate is the dominant lever and the one item that is *not yet confirmed* — this is the single most important number to get from DocuSeal sales before finalizing the financial model.

---

## 4. Legal & Compliance Notes

- **Signature validity:** DocuSeal signatures are legally binding in the US under the ESIGN Act and in the EU under eIDAS, provided the audit trail feature is enabled and used ([Opsily](https://opsily.com/blog/docuseal-self-hosted-free)). Confirm this is sufficient for cross-border sync licensing deals (some EU counterparties may expect a qualified/advanced electronic signature — eIDAS QES/AES — which DocuSeal's standard flow may not provide; verify against your actual counterparty jurisdictions).
- **AGPL-3.0 license (DocuSeal):** *"Using unmodified DocuSeal as-is for commercial operations is permitted under AGPL. However, modifying the code, forking, or linking it into proprietary applications requires either open[-sourcing the derivative or a separate commercial license]"* ([DEV.co license summary](https://dev.co/devops/open-source/docuseal)). Practical guidance:
  - Calling DocuSeal's API/embedding from Funūn's own separate, closed-source codebase is standard integration and does not itself trigger AGPL disclosure.
  - Risk arises specifically if an engineer forks the DocuSeal repository, patches its source, and runs that modified version as Funūn's signing backend — that modified version, run as a network service, could trigger source-disclosure obligations.
  - **Action item:** confirm with counsel before any DocuSeal source modification; if custom behavior is needed, prefer the documented Pro/API/webhook extension points over forking, or purchase a commercial license from DocuSeal for the modified deployment.
- **Data residency / audit trail:** self-hosting gives Funūn full control over where signed contracts and PII are stored — relevant if licensing deals involve EU counterparties (GDPR) or specific data residency requirements.

---

## 5. Engineering Scoping Items (for Claude Code)

1. **Confirm real "document" billing unit with DocuSeal sales** — verify that a two-party sync license agreement (1 file, 2 signers) is billed as a single $0.20 completion, not per signer.
2. **Negotiate enterprise volume pricing** with DocuSeal (contact: sales@docuseal.com) before scaling past pilot volume — get a written quote at the Low/Mid/High volume tiers modeled above.
3. **Re-architect infra for HA at scale**: move from any single-VPS setup to the Large/HA tier — clustered app servers, managed multi-AZ Postgres, Redis for background job processing (email/webhook delivery, PDF generation), S3-compatible storage for signed document artifacts.
4. **Validate the multi-tenant sender pattern in DocuSeal's actual API** — confirm signer/submitter fields can be populated per-request without pre-provisioning a DocuSeal user/account for each Funūn end user (expected: yes, based on documented seat-vs-API-completion billing split).
5. **Load-test for burst concurrency** — thousands of transactions/day implies peak bursts (e.g., end-of-month licensing deadlines); test webhook delivery reliability and PDF generation latency under concurrent load.
6. **White-label QA pass** — verify no DocuSeal branding leaks through in the embedded iframe, email notifications, signing certificate/audit trail PDF, or redirect domains; DocuSeal's Pro plan includes white-labeling ([note.com deep-dive](https://note.com/ai_driven/n/n4c7e4f5f15de?hl=en)) but this should be visually verified end-to-end.
7. **Backup/DR** — implement the documented 3-2-1 backup strategy (daily `pg_dump` + off-site storage sync) for self-hosted deployments ([Opsily](https://opsily.com/blog/docuseal-self-hosted-free)).
8. **Keep a live fallback quote from SignWell** — since it shares the same "custom requester," per-document billing architecture and also offers custom enterprise/prepay pricing, use it as negotiating leverage and a documented Plan B if DocuSeal's enterprise quote isn't competitive.

---

## 6. Open Items / Unknowns to Resolve

- DocuSeal's actual negotiated rate at Funūn's real projected volume (not yet obtained — highest priority).
- SignWell's actual high-volume/custom enterprise rate beyond the published $0.20 floor (not published; needs a direct quote for comparison leverage).
- Whether any EU counterparties in Funūn's licensing flow will require eIDAS Qualified/Advanced Electronic Signatures rather than standard e-signatures.
- Exact multi-party/multi-file billing behavior confirmed directly against DocuSeal's API docs and support, not just marketing copy.

---

*All figures above are based on publicly published vendor pricing pages and industry cost-comparison sources cited inline, current as of July 2026. E-signature vendor pricing changes frequently and enterprise/volume rates are negotiated privately — treat the cost table in Section 3 as a planning model, not a quote.*
