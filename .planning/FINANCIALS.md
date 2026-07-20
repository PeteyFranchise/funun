# Funūn Financials — Costs, Revenue Lanes, and Triggers

**Purpose:** one place for what Funūn spends, what it plans to earn, and the thresholds that force a decision. Cost decisions were previously scattered across deliberations, roadmap candidates, and phase contexts; this consolidates them.

**Status of numbers:** ✅ = verified against a vendor's published pricing or a live account during this project. ⚠️ = estimate or not yet activated. Nothing here is an accounting record — it is the decision surface.

**Last updated:** 2026-07-20

---

## 1. Per-transaction costs (scale with usage)

| What | Cost | Status | Notes |
|---|---|---|---|
| **DocuSeal** — split-sheet e-signatures | **$20/user/mo + $0.20 per completed document** | ✅ verified; account upgraded to Pro 2026-07-20 | Bills per *completed* doc. **Voided/archived-before-completion envelopes do NOT bill** (verified live during the provider gate — hence `VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false`). A multi-party sheet is ONE completion regardless of signer count — a 5-writer sheet costs $0.20, not $1.00. |
| **SignWell** — sync-license e-signatures | 25 free API docs/mo, then ~$0.85/doc | ⚠️ not yet activated (Phase 16, 16-09) | Chosen for the sync-license lane because embedded signing is pay-as-you-go; Dropbox Sign gates embedded signing behind $300/mo for 250 requests. At beta volume (3–5 licenses/mo) this is $0. |
| **Anthropic API** | usage-based | ✅ live | PitchPlug, contract verification (`lib/contracts/verify.ts`), Launchpad campaign generation. |
| **Resend** — transactional email | usage-based | ✅ live | Split-sheet invites move here in 17-10 (Funūn-branded, `send_email: false` on DocuSeal). |
| **Stripe** | standard processing + Connect | ⚠️ not yet built (Phase 16) | Funūn is merchant of record on sync deals (D-17); artists paid via Connect (D-17a). |
| Supabase, Vercel | plan-based | ✅ live | Not itemized here. |

## 2. One-off / optional costs

| What | Cost | Status |
|---|---|---|
| **GRid issuer code** (IFPI) | ~£150 + compliance agreement; recurrence **not publicly documented** | ⚠️ **deliberately NOT purchased.** Machinery built with the issuer code left null (Option 2, 2026-07-18). Buys a one-off *organisation* allocation — release numbers are then self-assigned, so there is no per-release cost. Revisit only when a real deal or DDEX delivery needs one. |

## 3. Revenue lanes (planned)

| Lane | Model | Status |
|---|---|---|
| **Sync-license commission** | Funūn is merchant of record; every deal records gross fee, commission %, artist net (D-20). Stripe Connect splits automatically. | Phase 16, not built |
| **Green Room sponsored placements** | Endemic advertisers (instrument, plugin, DAW brands). Phase 12's admin-curated placement infrastructure already exists and was designed for this. | Infra shipped; no sales motion yet. **Decoupled from e-sign costs by AM-4** — pursued on its own merits, not as a subsidy. |
| **Paid tier for prolific writers** | **NEW idea, 2026-07-20.** Everyone gets split sheets free; artists documenting at professional volume (dozens of songs/year) are the natural paid conversion. | Idea only — see §5. |

## 4. Decision triggers

| Trigger | Threshold | What happens |
|---|---|---|
| **AM-3 — e-sign spend** | **$500/month** (≈2,500 DocuSeal completions) | Reopens the free-access deliberation (`deliberations/esign-split-sheet-economics.md`) with real usage data. Not an automatic gate — a prompt to re-decide. |
| **D-10 — GTM readiness** | 3–5 closed sync deals | Gate before hiring an AE. Also wants: request-to-quote time, quote-to-close rate, average sync fee, artist readiness pass rate, buyer repeat/referral signal. |

## 5. Abuse guardrails on free e-sign (AM-2 series)

Free e-signatures need a brake, but the brake must not punish correct use.

- **Structural (does the real work):** artists can only e-sign a **Funūn-generated template** — there is no arbitrary-PDF path (AM-2, widened to the contract library by AM-2b). "Free DocuSign for my apartment lease" is *impossible*, not merely discouraged.
- **AM-2c — RECIPIENT-BASED LIMIT (decided 2026-07-20).** The original ~10 sheets/month document cap is **replaced** by a limit on **distinct NEW recipients** per month — people this artist has never sent a sheet to before. Regular collaborators stop counting after the first send, so a stable writing team is free forever.
  - **Why:** the every-track decision (P18-15) means a 12-track album needs 12 sheets. A document cap punished exactly the artist doing the right thing. Counting documents also mismeasures the risk — an album is *12 documents to 3 people*, which is not spam; *10 documents to 10 strangers* is the thing worth stopping.
  - **No binding document cap** for now. Cost is watched by AM-3's aggregate trigger rather than a per-artist number.
  - **CONFIRMED: 25 new recipients/month** (Pete, 2026-07-20) — "ok for now, adjust later if needed." Keep it a single named constant so tuning is one line.
  - **Uploads are exempt entirely.** A wet-signed sheet from years ago mints no envelope and costs nothing, so it counts toward nothing. This also solves catalog backfill with no admin queue: an artist may upload their entire history freely.
  - **Re-assess if cost becomes a problem** (Pete, 2026-07-20). AM-3's trigger is the monitor; a paid tier (§3) is the likely answer if it fires, since prolific writers would be the volume driver and are the right cohort to convert.
  - **Implementation:** `lib/split-sheets/envelopes.ts` holds the cap helpers (17-01, shipped); enforcement is at the mint route in **17-06, which is NOT yet executed** — so this change lands in an unexecuted plan, no rework.

## 6. Cost sanity, for scale intuition

At DocuSeal's $0.20/completed document (multi-party = one completion):

| Split sheets/month | Monthly cost | Notes |
|---|---|---|
| 50 (beta) | **$10** | Plus the $20 Pro seat. |
| 1,000 | **$200** | Well under the AM-3 trigger. |
| 2,500 | **$500** | **AM-3 fires** — reopen the access model. |
| 10,000 | ~$2,000 | Would need volume pricing and almost certainly a paid tier. |

Context: a single closed sync deal at the beta target fee covers months of e-sign at the 1,000/month level. The economics only strain if adoption dramatically outruns deal flow — which is precisely what AM-3 is watching for.

---

## Open financial decisions

2. **Paid-tier shape** — what it includes beyond higher e-sign volume, and whether it interacts with the post-beta account-model review.
3. **GRid registration** — gated on a real ask plus the deferred artist-value discussion.
4. **Green Room ad sales motion** — infra exists; no pricing, inventory, or sales process defined.
