---
created: 2026-09-01T06:30:00-04:00
title: Implement accountable download history across protected delivery surfaces
area: sound-vault
priority: near-term-planning
status: ready-for-gsd-discussion
depends_on:
  - Sound Vault custody D-01 through D-06
  - shared expiring access-grant foundation
  - privacy and counsel retention review
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/sound-vault-master-custody.md
  - .planning/todos/pending/2026-09-01-expiring-access-link-lifecycle.md
  - .planning/todos/pending/2026-09-01-provenance-delivery-attribution-rights-enforcement.md
  - app/api/selects/[token]/download/route.ts
---

## Owner-approved outcome

Create an accurate, privacy-conscious record of every protected or clean-file delivery
that identifies the exact asset, authority, recipient and context while stating only
what Funūn's systems can technically observe.

This TODO is an execution plan, not a claim that complete download history is live.

## Locked rules

- Download history is separate from ordinary preview listening.
- Records bind to the exact asset hash, version, grant, recipient and authority snapshots.
- Use requested, authorized, started, substantially transmitted, interrupted, refused
  and revoked-before-access states.
- A transmission does not prove saving, opening, listening, use or later infringement.
- Group byte ranges and resumes into one logical session.
- Technical retries do not automatically consume a fresh allowance.
- Restrict raw security data and expose only useful context to artists.
- Use documented retention rather than permanent collection by default.
- Alerts cause human review, never automatic accusation or enforcement.

## GSD discussion agenda

### Delivery-path capability audit

- Inventory application-proxied, signed-URL, CDN, storage, e-sign document and partner
  delivery paths.
- Determine which paths can truthfully observe request, start, bytes and completion.
- Decide whether high-value downloads require a controlled endpoint or callback rather
  than a direct storage URL.
- Identify range-request, browser retry and mobile resume behavior.

### Event and session model

- Define immutable download sessions, request attempts and state transitions.
- Specify correlation IDs, range aggregation, completion threshold and timeout rules.
- Bind events to D-03 hashes/provenance and D-05 access grants.
- Make idempotency and concurrent-request behavior explicit.
- Define counted-use decisions independently from raw HTTP requests.

### Privacy, disclosure and retention

- Classify artist-visible, recipient-visible, operations-only and security-only fields.
- Decide IP truncation/hash strategy, retention windows and legal-hold behavior.
- Add clear recipient notice at protected-download and clean-delivery surfaces.
- Define access/export/deletion handling under applicable privacy obligations.

### Product and operations

- Create an artist-facing delivery-history timeline with understandable states.
- Add staff drill-down for support and security without exposing restricted data broadly.
- Define review alerts, severity, ownership, resolution and false-positive feedback.
- Link investigations to watermark recovery, licence checks and delivery receipts.

## Recommended implementation stages

1. **Observability audit** - verify what each current delivery path can prove.
2. **Schema and state machine** - immutable sessions, attempts, states and idempotency.
3. **Controlled delivery instrumentation** - request/start/byte/terminal events for the
   highest-risk watermarked and clean-master paths.
4. **Range/retry reconciliation** - logical-session grouping and fair allowance counting.
5. **Artist history** - clear recipient, asset, purpose, time and status presentation.
6. **Restricted operations view** - support/security evidence with permission controls.
7. **Privacy controls** - disclosure, retention, minimization, export and legal holds.
8. **Review alerts** - anomaly signals with human disposition and no automated punishment.
9. **Cross-surface rollout** - stems, sidecars and sensitive Contract Locker downloads.

## Acceptance pilot

- One named recipient completes a watermarked WAV download through multiple range requests
  and the artist sees one logical completed event.
- An interrupted download resumes without improperly consuming a second allowance.
- An expired and a revoked request appear as distinct refused/revoked states.
- A clean-master delivery binds to its exact hash, version, deal and rights/metadata snapshots.
- A raw IP or detailed device signal is unavailable to the artist-facing view.
- A suspicious retry pattern creates a review alert but does not accuse, suspend or claim.
- An operator can reconstruct the technical record while the UI states the evidence limits.
- Retention and legal-hold tests pass under the approved privacy policy.

## Claude / GSD instruction

Do not label a signed-URL mint as a completed download. Begin with an observability audit
and design the state machine around facts the current delivery path can actually prove.
Preserve D-03 provenance, D-04 least authority and D-05 parent-grant/child-credential
separation. Treat privacy and retention review as a blocking implementation checkpoint.
