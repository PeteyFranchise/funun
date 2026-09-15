---
status: testing
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
source: [39-VERIFICATION.md]
started: 2026-09-15T16:10:00Z
updated: 2026-09-15T16:10:00Z
---

## Current Test

number: 1
name: Pin cross-account invisibility (D-11)
expected: |
  Writer B and the work owner each see zero pins, zero count and zero trace in the UI, AND a
  direct authenticated request to the pins endpoint returns an empty array for both.

  Both halves are required. A visual absence could be a UI filter; only an empty API response
  proves the RLS policy — rather than the route — is what hides the rows.
awaiting: user response

## Tests

### 1. Pin cross-account invisibility (D-11)

expected: As writer A, drop 3 pins on a take. As writer B — a current room member on the same
work, not the pin author — open that take and (a) check the UI for any pin dot, count or trace,
and (b) issue a direct authenticated GET to
`/api/works/{workId}/versions/{versionId}/pins`. Repeat as the work owner, who holds the broadest
read in the room. All must return zero.

result: [pending]

why_human: RLS is only meaningful against a real Postgres role boundary, and Jest cannot
impersonate two authenticated users. This is D-11's only meaningful proof. Pins shipped to
production on 2026-09-15 without it, by deliberate owner decision (the 2026-08-25 precedent:
verify organically as beta testers arrive rather than fabricate accounts), not by oversight.

how: A facilitator-led session following the pattern in
`docs/verification/BETA-RLS-SMOKE-SESSION.md` — every refusal paired with a positive control, so
that "writer B sees nothing" is distinguishable from "writer B's page failed to load". Running it
on a live shared work is non-invasive by design: a pin is wordless, notifies nobody, and rides no
realtime channel.

state: As of 2026-09-15 there is one pin remaining in production, at 16.8s on version
`6a276fef…` in work `0d0402cf…` (3 people). That work already has the second and third
identities needed; what is missing is one of them at a keyboard.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
