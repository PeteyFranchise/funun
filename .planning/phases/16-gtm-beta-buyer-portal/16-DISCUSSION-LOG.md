# Phase 16: GTM Beta Launch & Buyer Portal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 16-gtm-beta-buyer-portal
**Areas discussed:** Buyer identity model, Verification gating, Artist consent flow, Beta portal scope

---

## Buyer identity model

| Option | Description | Selected |
|---|---|---|
| Capability grant + buyer profile | Extend Phase 15 capability_grants + buyer_profiles table | (recommended, not chosen) |
| Capability grant only | Third capability value on artist_profiles | |
| Fully separate buyer accounts | New account type like Wave 3 curators | ✅ + user-specified org layer |

User expanded the choice: separate accounts **with a company layer** — linked profiles showing company + individual activity, company-level admins, admins add employees with specific buying permissions.

Follow-ups: org origin → **Funūn-admin created** (over self-serve-with-approval, domain-verified); permissions → **two tiers requester/approver** (over three tiers, admin-only); solo buyers → **allowed via auto-created personal org** (over org-only, two account shapes); attribution → **dual-level, company always shown** (over company-only, individual-first).

## Verification gating

| Question | Selected |
|---|---|
| What does verification gate? | **Org-level verification only** (over org+per-member, action-based escalation) |
| Default buyer reach (multi) | **Browse rights-ready catalog + Submit license requests**; explicitly NOT direct messaging, NOT non-public signals |
| Deal communication | **Admin-mediated for beta** (over request-scoped thread — the recommendation — and DM-unlock-on-accept) |
| Shortlists | **Yes, org-shared** (over personal-only, not-in-beta) |

## Artist consent flow

| Question | Selected |
|---|---|
| Artist approval model | **Pre-cleared terms per project** (over per-request approval — the recommendation — and both-from-day-one) |
| Non-matching requests | **Admin negotiates first** (over fall-back-to-artist-approval — the recommendation — and auto-decline) |
| Pre-clearable fields | User asked "what does Marmoset do?" → researched Marmoset's model (custom per-project quotes on media type/reach/territory/term/exclusivity; representation agreement = artist pre-clearance) → **"Marmoset five"**: min fee, usage/media types, territories, exclusivity, term length |
| Artist surface | **Dedicated Deals sidebar room** (over vault-project + notification — the recommendation — and email/admin-only) |

## Beta portal scope

| Question | Selected |
|---|---|
| Catalog discovery | **Filtered browse** (genre/mood/vocals/usage-cleared filters, no free-text ranking) (over curated-collections-only, full search) |
| Request tracking | **Org dashboard with deal stages** submitted → in negotiation → terms agreed → contract → closed/declined (over simple status list, email-only) |

## Deal flow model (follow-up session, plain-language walkthrough)

| Question | Selected |
|---|---|
| Who does the buyer pay? | **Buyer pays Funūn, Funūn pays artist** (over direct-pay+fee-invoice, off-platform) |
| Who drafts + how signed? | **Admin drafts from template, embedded e-sign** (over draft-then-sign-offline, buyer-brings-own-paper) |
| File delivery | **Through the portal via Phase 14 Export pack** (over admin-manual, artist-direct) |
| Commission | **Track commission % on every deal** — gross/commission/net in the data (over flat-manual, no-cut-in-beta) |
| E-sign provider | User asked "which keeps the deal flow solely inside Funūn?" → researched: Dropbox Sign gates embedded signing behind $300/mo Standard plan (cheap tier redirects to hosted UI); SignWell embeds pay-as-you-go (25 free/mo, ~$0.85/doc) → **SignWell** |
| Artist payout | **Stripe Connect from day one** (over manual-beta-payout — the recommendation — and balance-withdrawal) |

---

Notable pattern: user consistently chose the more product-forward option on artist/buyer-facing surfaces (Deals room, pre-clearance, org dashboard) while choosing the most founder-concierge option on operations (admin-created orgs, admin-mediated comms, admin-negotiation fallback).
