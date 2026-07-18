# Phase 16: GTM Beta Launch & Buyer Portal - Validation

## Validation Philosophy

Phase 16 validation must prove both product correctness and GTM usefulness. The feature is not successful just because a buyer can submit a form; it is successful when a real buyer request becomes structured data, respects artist privacy, reaches an admin/founder workflow, can produce contract artifacts, and gives the team measurable learning.

## Product Validation

| ID | Requirement | Validation |
|---|---|---|
| V16-01 | Buyer account/capability exists and does not accidentally grant artist/industry privileges | Unit tests for capability checks; manual account-role smoke test |
| V16-02 | License requests are private to buyer, admin, and authorized artist/deal participants | RLS/API adversarial tests for cross-user reads/writes |
| V16-03 | Request references only visible/public/authorized artists, projects, tracks, or opportunities | API tests for private/non-public/blocked references |
| V16-04 | Buyer portal creates a structured request without email/manual intervention | Browser UAT with a test buyer account |
| V16-05 | Admin/founder can qualify, assign, quote, and close/decline a request | Browser UAT through admin workflow |
| V16-06 | Contract Locker/e-sign state links back to the request lifecycle | Integration smoke test with uploaded signed PDF first, provider-backed e-sign later |
| V16-07 | Buyer cannot message or access deeper discovery without the intended verification/trust state | API and UI tests after Phase 13 safety gates land |

## GTM Validation

| ID | Metric | Gate |
|---|---|---|
| GTM-01 | Closed deals | 3-5 closed deals before AE hire |
| GTM-02 | Request-to-quote time | Baseline captured for every beta request |
| GTM-03 | Quote-to-close rate | Baseline captured before paid acquisition |
| GTM-04 | Average sync fee | Used to validate 25% commission/runway assumptions |
| GTM-05 | Buyer repeat/referral signal | At least one repeat request or qualified referral before broad buyer outreach |
| GTM-06 | Artist readiness pass rate | Identifies whether supply is blocking demand |
| GTM-07 | Support burden | Track founder/manual touches per request before scaling volume |

## Security / Abuse Cases

- Unverified buyer attempts to scrape people search or profile data.
- Buyer submits a license request for a private/unpublished/non-owned/unavailable project.
- Buyer attempts to reference an artist who blocked them.
- Artist sees another artist's deal terms.
- Buyer sees another buyer's request.
- Admin-curated placement promotes a request target that later becomes private or unavailable.
- Contract signed state is spoofed without uploaded signed PDF or provider webhook.

## Manual UAT

- Invite or create a test sync buyer account.
- Submit one request against a public project/track.
- Confirm request appears in admin workflow.
- Move request through needs_info, qualified, quoted, and closed_lost or closed_won.
- Attach/upload a signed PDF into Contract Locker and verify status synchronization.
- Confirm the buyer can see only their own request history.
- Confirm a blocked/private profile cannot be requested or discovered through buyer surfaces.

## Release Gates

- Phase 13 safety implementation complete and smoke-tested for broad buyer visibility.
- Buyer portal MVP passes privacy/adversarial tests.
- E-sign provider decision recorded.
- Legal signs off on license-request fields and consent model.
- Founder/beta playbook exists before first non-Hook buyer invite.
