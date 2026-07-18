# Phase 16: GTM Adversarial Review

**Reviewed:** 2026-07-18
**Scope:** `/Users/peterzora/Desktop/Funun_GTM_Business_Plan.md`, `/Users/peterzora/Desktop/Funun_Roadmap_Gap_Review_Brief.md`, and current repo planning/code references.

## Findings

### P1: The buyer/license-request bridge should not be treated as temporary form plumbing

The external plan proposes a Tally/Typeform bridge that writes to `buyers` and `license_requests`. That is a sensible MVP instinct, but the repo does not currently have the buyer or license-request substrate. Since Funun can implement product quickly and buyer requests will become core business data, the right plan is an integrated buyer portal with manual/admin fallback, not a form-first sidecar.

Risk if left unchanged:

- Buyer identity, request terms, files, notes, and contract links fragment across form tools, email, and manual notes.
- The eventual Green Room "Request License" button becomes a migration/reconciliation project instead of a UI on top of existing tables.
- Early Hook data fails to train the future sales/playbook loop because it is not structured consistently.

Recommendation:

- Plan `buyers`, `buyer_profiles` or buyer capability, and `license_requests` as first-class product primitives.
- Use any external form only as an emergency/manual ingestion path that writes into the same API and tables.

### P1: Trust & Safety must gate broad buyer access

The GTM plan wants buyer discovery and a license-request flow soon. The repo roadmap still has Phase 13 Trust & Safety planned, not fully executed. Buyer access creates higher trust requirements than artist-only networking: buyers can inspect profiles, make commercial requests, potentially message members, and influence opportunity visibility.

Risk if left unchanged:

- Unverified buyers could spam artists or scrape public profiles.
- Artists may assume Green Room privacy/block settings protect them, while buyer surfaces bypass those rules.
- A commercial request could leak private project or readiness information if visibility rules are inconsistent.

Recommendation:

- Keep Phase 13 as a prerequisite for broad buyer portal rollout.
- Allow founder-assisted/private beta buyer flows earlier only if they are invite-only and admin-supervised.

### P1: E-sign provider strategy needs a fresh decision before live build

The repo has an e-sign abstraction and older Dropbox Sign/DocuSign planning. The external GTM plan recommends SignWell because it is lower-cost and supports embedded signing at low volume. Public provider pages checked on 2026-07-18 support the broad direction: SignWell advertises usage-based embedded API signing, while Dropbox Sign embedded signing requires Standard API or higher.

Risk if left unchanged:

- Engineering could implement the wrong provider first based on stale docs.
- Cost assumptions could be wrong before deal volume exists.
- Contract signing may become the blocker for the first buyer portal workflow.

Recommendation:

- Run a short provider decision checkpoint before implementation.
- Choose SignWell-first if legal/compliance review accepts it; keep provider interface compatible with Dropbox Sign/DocuSign fallback.

### P2: The revenue model is useful, but should be treated as validation math

The plan models 38 year-one sync deals and shows that sync commission alone does not cover burn. That is useful, but it should not trigger AE hiring or paid acquisition before the founder-led motion proves repeatability.

Risk if left unchanged:

- Hiring happens against spreadsheet confidence rather than closed-deal evidence.
- Paid marketing distracts from relationship-led buyer validation.
- The portal optimizes for volume before learning which deal types actually close.

Recommendation:

- Gate first AE hire behind 3-5 closed deals and a written playbook.
- Track request-to-quote time, quote-to-close rate, average sync fee, deal-cycle length, and repeat/referral signal.

### P2: Content ID should remain partner/ops planning, not a core Phase 16 blocker

The GTM plan correctly avoids building fingerprinting in-house. However, Content ID partner selection should not block the buyer portal MVP unless a specific buyer requires Content ID status as a licensing prerequisite.

Risk if left unchanged:

- A partner/BD dependency slows down the coded buyer portal.
- The product confuses "rights-ready for sync" with "Content ID administered everywhere."

Recommendation:

- Track Content ID status in readiness and deal notes.
- Treat partner selection as a parallel ops/legal workstream, not the first technical blocker.

### P2: Messaging and onboarding assets are missing operational artifacts

The plan has strong positioning and training ideas, but the repo does not yet contain a GTM beta enablement pack: buyer one-pager source, buyer FAQ, artist onboarding checklist, internal walkthrough, or AE/founder sales playbook.

Risk if left unchanged:

- Founder explanations stay tribal.
- Buyer portal UX and sales copy drift apart.
- Early support load increases because artists do not understand readiness blockers.

Recommendation:

- Include a Phase 16 enablement wave for buyer FAQ, artist readiness onboarding, internal platform walkthrough, and metrics definitions.

## Keep / Cut / Resequence

## Keep

- Artist-first positioning: "Still your song. Still your money."
- Buyer framing: clean rights, faster clearance, fewer legal surprises.
- Founder as AE #1 until closed-deal proof exists.
- Relationship-driven travel/events over paid ads in the earliest stage.
- 25% sync commission as a starting recommendation, pending legal/accounting review.

## Cut Or Defer

- Self-serve paid ad buying.
- Broad buyer marketplace search before Phase 13.
- AE hiring before 3-5 closed deals.
- Long-lived external form intake as the primary system.
- Content ID direct integration/fingerprinting.

## Resequence

1. Finish Phase 12/13 safety-discovery foundation.
2. Build Phase 16 buyer account/capability and license-request substrate.
3. Ship invite-only buyer portal beta for Hook-style buyers.
4. Wire request-to-contract flow into Contract Locker and e-sign provider.
5. Use real deal data to decide AE hire, buyer discovery expansion, and paid acquisition.

## Source Notes

- SignWell claims embedded signing/requesting/templates are included in its API product and usage-based pricing.
- Dropbox Sign's own help page says embedded signing requires Standard API.
- YouTube Content Manager/Content ID access is sensitive, policy-bound, and can be restricted for misuse, supporting the plan's "partner/admin, not DIY fingerprinting" stance.
