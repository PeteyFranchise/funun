---
status: testing
phase: 12-discovery-feed-people-search
source: [12-PR-REVIEW-PACKET.md, 12-ADVERSARIAL-REVIEW.md]
scope: Wave 5 only (12-09 People Search, 12-10 Admin placements)
started: 2026-07-17T00:00:00Z
updated: 2026-07-17T00:00:00Z
---

## Current Test

number: 1
name: People Search returns correct, privacy-safe results in-browser
expected: |
  Signed-in member opens /green-room, uses the People Search module, and gets
  results that respect visibility, blocks, and public-safe fields.
awaiting: user response

## Notes

Wave 5 is code-complete and pushed to PR #37 (commits 56d67f3, 7807244, 863b604).
The following were already verified WITHOUT a browser session and are NOT re-listed
as pending UAT — they are done:

- Migrations 054–057 live (LOCAL=REMOTE; remote up to date).
- GET /api/green-room/discover returns 401 unauthenticated on the running server.
- Discover query executes against real Postgres (full builder shape → HTTP 200);
  a jsonb `open_to` containment bug was found via live smoke test (array form →
  HTTP 400 22P02) and fixed to the JSON-string form (→ HTTP 200), regression-locked
  in __tests__/green-room-discover.test.ts.
- Private columns are DB-blocked: selecting contact_phone → 42501 permission denied
  (migration-040 column grant enforces the public-safe projection, not just the app).
- 34 focused unit tests green; full green-room suite 88/88; tsc + lint clean; build green.

The two tests below need an authenticated (and, for #2, admin) browser session —
they are the only Wave 5 items that could not be driven headlessly.

## Tests

### 1. People Search results are correct and privacy-safe (12-09)
expected: |
  As a signed-in member on /green-room, the People Search module returns members
  filtered by keyword / role / open-to / genre / location / relationship / member
  type. Results exclude: yourself, non-public profiles, and members you have blocked
  or who have blocked you (test both block directions). Each card shows only public
  info (name, handle, avatar, headline, roles, genre, location, open-to, verified) —
  never email, legal name, or contact fields. The Message action is hidden on your
  own card; Follow appears only for outside-network results and, when clicked, the
  member starts following. "Show more" paginates without duplicates.
result: pending

### 2. Admin placement create → activate visibility gate (12-10)
expected: |
  As an admin at /admin/green-room-placements: (a) create a placement targeting a
  PRIVATE profile/project and click Activate → rejected with a 409 / "Destination is
  not public/visible" error, placement stays draft. (b) Create one targeting a PUBLIC
  destination (or a valid https external URL) and Activate → succeeds and shows active.
  (c) Pause / Resume / Archive transitions work; an active placement then renders as a
  labeled card in the Green Room feed, and a paused/archived/expired one does NOT
  render. (d) A non-admin hitting /api/admin/green-room/placements is refused (403).
result: pending

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
