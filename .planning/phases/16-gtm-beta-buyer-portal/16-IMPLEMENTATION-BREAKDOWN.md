# Phase 16: GTM Beta Launch & Buyer Portal - Implementation Breakdown

## Phase Goal

Ship the product foundation for founder-led sync buyer deals: a specialized buyer account/portal, structured license requests, admin/deal workflow, Contract Locker/e-sign handoff, and beta metrics that tell Funun whether the GTM motion is repeatable.

## Success Criteria

1. A verified or invite-only sync buyer can create an account or claim an invited buyer profile.
2. A buyer can submit a structured license request for a track, artist, release, or custom brief without emailing the founder first.
3. A buyer can see their submitted request status and provide missing information.
4. Admin/founder can review, qualify, assign, quote, negotiate, close, or decline a license request from inside Funun.
5. The request can link to artist/project/track records, readiness status, signed contracts in Contract Locker, and e-sign state.
6. Artist consent and visibility are respected server-side; no buyer request exposes private or blocked profile/project data.
7. Beta metrics are recorded: request-to-quote time, quote-to-close rate, average sync fee, deal stage counts, buyer repeat signal, artist readiness pass rate.

## Wave Plan

### Wave 1: Buyer Identity & Access Model

- Decide whether buyer is a `capability_grants` capability, a linked `buyer_profiles` table, or both.
- Add schema for buyer profiles, verification state, company/contact metadata, and invitation/claim flow.
- Define buyer permissions: request license, view public catalog/profile cards, save shortlist, message only after verification/relationship approval.
- Add admin invite/approve/verify flow.

### Wave 2: License Request Data Model & API

- Add `license_requests` schema with structured usage terms.
- Add request lifecycle states: draft, submitted, needs_info, qualified, quoted, negotiating, contract_sent, signed, closed_won, closed_lost, declined.
- Add buyer-facing request create/read/update routes.
- Add admin/founder list/detail/update routes.
- Add privacy checks for referenced artist/profile/project/track visibility.

### Wave 3: Buyer Portal MVP

- Add buyer portal routes, likely `/buyer` or `/sync`.
- Build onboarding, request composer, request detail/status page, and lightweight dashboard.
- Add "Request License" entry points on safe surfaces: public profile/release/Green Room card where visibility allows.
- Add saved shortlist only if it does not create privacy leakage.

### Wave 4: Deal Room, Contract Locker & E-Sign Handoff

- Link license requests to vault projects/tracks and Contract Locker documents.
- Generate or attach sync-license agreement artifacts from request fields.
- Add provider-decision checkpoint for SignWell-first vs Dropbox/DocuSign fallback.
- Wire signed contract state back to request lifecycle.
- Keep legal review/human approval explicit for sync license terms.

### Wave 5: GTM Beta Metrics & Enablement

- Add admin beta metrics dashboard or structured report source.
- Create buyer FAQ, internal platform walkthrough, founder/AE playbook, and artist readiness onboarding checklist.
- Define gates for broader rollout: 3-5 closed deals, repeat buyer signal, request-to-quote SLA, trust/safety UAT, and e-sign completion proof.
- Document when to hire fractional artist relations or AE.

## Suggested Plan Files

- `16-01-PLAN.md` - Buyer identity, capability, and verification model.
- `16-02-PLAN.md` - License-request schema, lifecycle, and API routes.
- `16-03-PLAN.md` - Buyer portal MVP UI and safe request entry points.
- `16-04-PLAN.md` - Deal room, Contract Locker, and e-sign handoff.
- `16-05-PLAN.md` - GTM beta metrics, enablement, and rollout gates.

## Dependencies

- Phase 12 should be merged or stable enough to expose safe Green Room request entry points.
- Phase 13 should be implemented and verified before broad buyer discovery/messaging access.
- Phase 15 capability model can be extended or used as precedent for buyer access.
- Legal must decide Funun licensor/agent posture before final contract-generation behavior.
- E-sign provider decision must be revisited before live provider implementation.

## Non-Goals

- Do not ship self-serve paid ads.
- Do not automate legal approval.
- Do not expose private artist/project data to buyers.
- Do not require Content ID partner onboarding before the buyer portal MVP unless a specific buyer deal requires it.
- Do not create a separate manual spreadsheet workflow.
