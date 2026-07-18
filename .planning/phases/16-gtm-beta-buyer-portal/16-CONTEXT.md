# Phase 16: GTM Beta Launch & Buyer Portal - Context

**Gathered:** 2026-07-18
**Status:** Planning drafted

<domain>
## Phase Boundary

Phase 16 turns the GTM plan into a product-backed beta launch motion. It does not replace Green Room Phase 12 or Trust & Safety Phase 13. It builds on them by adding a buyer-facing pathway for sync buyers, agencies, filmmakers, brands, and creator teams to discover rights-ready catalog, request licenses, and move through a structured deal workflow.

The original GTM plan proposed a lightweight Tally/Typeform license-request bridge. The revised direction is stronger: Funun should plan a fully integrated buyer-side portal, possibly with specialized sync-buyer accounts, so the first Hook-style deals create reusable product infrastructure instead of an operational side-channel.

This phase covers:

- Buyer account/capability model for sync buyers.
- Buyer onboarding and verification-lite flow.
- License-request schema and API routes.
- Buyer portal UI for request creation and request tracking.
- Artist/admin deal workflow tying requests to Sound Vault projects, Contract Locker documents, and readiness state.
- GTM beta metrics and founder-led sales instrumentation.

This phase does not cover:

- Self-serve paid ads or campaign targeting.
- Fully automated contract negotiation.
- Legal advice or automated legal approval.
- Direct Content ID administration.
- Marketplace-scale search/ranking beyond beta-safe discovery.

</domain>

<decisions>
## Locked Decisions

- **D-01:** Phase 16 is a new post-Green-Room planning lane: GTM Beta Launch & Buyer Portal.
- **D-02:** The buyer/license-request gap should be solved with an integrated portal, not a long-lived manual intake form.
- **D-03:** Manual intake is allowed only as a temporary admin fallback or founder-assist path. It should write into the same tables and workflows as the portal, never a separate spreadsheet/system.
- **D-04:** Sync buyers are a distinct user audience. They may need specialized account capability, profile, verification, and permissions separate from artists and industry members.
- **D-05:** Buyer accounts should not automatically receive broad Green Room social privileges. Buyer messaging, profile access, and search depth should be gated by verification/trust state.
- **D-06:** The first buyer portal should optimize for Hook-style founder-led deals: fewer, higher-signal requests, structured rights terms, and fast legal/admin handoff.
- **D-07:** License requests should become first-class data: requested tracks/artists, usage context, territory, term, exclusivity, budget, need-by date, buyer identity, stage, owner, notes, and linked contract/document artifacts.
- **D-08:** Contract Locker should be the document destination for signed sync licenses and related legal PDFs. Phase 16 may link into Contract Locker but should not expand into the full Contract Locker Intelligence roadmap unless explicitly planned later.
- **D-09:** Trust & Safety from Phase 13 is a prerequisite for broad buyer visibility, because buyer access affects profiles, messaging, reporting, verification, and block/privacy expectations.
- **D-10:** The GTM model should use real beta metrics before hiring an AE: 3-5 closed deals, request-to-quote time, quote-to-close rate, average sync fee, artist readiness pass rate, and buyer repeat/referral signal.

## Open Product Questions

- **Q-01:** Should "sync buyer" be a new capability in `capability_grants`, a separate buyer table linked to auth users, or both?
- **Q-02:** Can an existing artist/industry account also request buyer capability, or should buyer accounts be separately verified?
- **Q-03:** What buyer actions require verification: requesting a license, messaging artists, viewing non-public contact/availability signals, or saving private shortlists?
- **Q-04:** Should artists approve every license opportunity before contract drafting, or can they opt into pre-cleared terms by catalog/project?
- **Q-05:** What is the minimum buyer portal we need for Hook: request form only, request dashboard, searchable catalog, saved shortlist, or all of the above?

</decisions>

<canonical_refs>
## Canonical References

- `/Users/peterzora/Desktop/Funun_GTM_Business_Plan.md` - external GTM/business plan reviewed 2026-07-18.
- `/Users/peterzora/Desktop/Funun_Roadmap_Gap_Review_Brief.md` - external roadmap-gap audit instructions and bundled GTM plan.
- `.planning/ROADMAP.md` - current phase map and sequencing.
- `.planning/REQUIREMENTS.md` - Green Room discovery/feed/trust requirements.
- `.planning/phases/12-discovery-feed-people-search/12-CONTEXT.md` - feed/search/discovery substrate and sponsored-placement decisions.
- `.planning/phases/13-network-trust-safety/13-CONTEXT.md` - block/report/visibility/verification prerequisites.
- `.planning/phases/15-account-capability-model/15-CONTEXT.md` - capability-grants precedent for multi-capability accounts.
- `.planning/quick/260715-contract-locker-intelligence-roadmap/PLAN.md` - future Contract Locker intelligence note.
- `docs/e-sign-integration.md` - provider abstraction and live e-sign integration spec.
- `lib/esign/provider.ts` - existing provider-agnostic e-sign interface.
- `lib/vault/stage3.ts` - readiness/documents/content-ID status logic.
- `app/(artist)/vault/[projectId]/rights/page.tsx` - rights guidance surface.
- `app/(artist)/green-room/page.tsx` and `components/green-room/` - Green Room entry and feed/search surfaces.
- `lib/capabilities/` - capability model created by Phase 15.

</canonical_refs>

<code_context>
## Existing Product Substrate

- Artists already have Sound Vault, metadata, document lifecycle, rights guidance, Launchpad, Antenna, Green Room, profile, connection, DM, and capability infrastructure.
- Upload-signed PDF flow exists for documents; live provider-backed embedded e-sign is abstracted but not implemented end-to-end.
- Phase 12 adds Green Room feed/search/discovery and admin-curated placements.
- Phase 13 is planned to add full block/report/visibility/verification controls.
- Phase 15 created multi-capability account infrastructure, which is the likely precedent if buyer capability is added.

## Known Gaps

- No `buyers` or `license_requests` schema was found during the review.
- No buyer portal route exists.
- No public "Request License" flow exists on profile, release, project, or Green Room surfaces.
- No deal-stage workflow connects a buyer request to Contract Locker documents.
- No GTM beta dashboard exists for deal/request metrics.
- Current e-sign docs are not aligned on provider recommendation: older docs lean Dropbox Sign, while the external GTM plan recommends SignWell.

</code_context>

<deferred>
## Deferred Ideas

- Self-serve paid ad buying, targeting, budgets, Stripe billing, ad review, and ad analytics.
- Fully public buyer marketplace search before Phase 13 safety controls are verified.
- Content ID direct partnership or fingerprinting build.
- Automated legal negotiation or legal advice.
- AE hiring automation, CRM replacement, or broad sales tooling before the first 3-5 closed deals.

</deferred>

---

*Phase: 16-GTM Beta Launch & Buyer Portal*
*Context gathered: 2026-07-18*
