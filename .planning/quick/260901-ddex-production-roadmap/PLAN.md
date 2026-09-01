# DDEX Production Roadmap Promotion

## Objective

Convert the DDEX licensing, conformance and partner-acceptance strategy into an ASAP operating plan and two sequenced GSD roadmap candidates.

## Scope

- Create an immediate administrative track for the free Implementation Licence, DPID and named-partner discovery.
- Define Phase 37.4 as DDEX Production Readiness: current-standard implementation, validation, semantic rules and truthful claims.
- Define Phase 37.5 as Partner-Validated Delivery: partner profile, transport, acknowledgments, retries, updates/takedowns and production UAT.
- Record membership as a post-production business review, not a certification shortcut.
- Correct the current DDEX standards-map status so it reflects the actual ERN 3.5.1 implementation.

## Files Expected to Change

- `.planning/ROADMAP.md`
- `.planning/deliberations/ddex-production-readiness.md`
- `.planning/todos/pending/2026-09-01-ddex-license-dpid-and-partner-discovery.md`
- `docs/ddex-standards-map.md`
- `.planning/quick/260901-ddex-production-roadmap/PLAN.md`
- `.planning/quick/260901-ddex-production-roadmap/SUMMARY.md`

## Validation Plan

- Confirm the roadmap distinguishes licence, DPID, schema validation, partner acceptance and membership.
- Confirm the current-state description matches the implementation: ERN 3.5.1, RDR-N/MLC 1.31, placeholder DPIDs and no production partner feed.
- Confirm direct-delivery work is blocked on a named partner profile rather than invented generically.
- Run `git diff --check` on all changed planning and documentation files.

## Risks / Coordination Notes

- There is no broad company/product certification claim to pursue; marketing language must remain scoped and evidence-backed.
- The target ERN version/profile/choreography must be agreed with the receiving partner.
- Licence/DPID application is an external legal-entity action and remains owner-executed.
- Existing unrelated worktree changes belong to the user and will not be modified.
