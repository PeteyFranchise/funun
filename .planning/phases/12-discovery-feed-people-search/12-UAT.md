---
status: testing
phase: 12-discovery-feed-people-search
source: [12-PR-REVIEW-PACKET.md, 12-ADVERSARIAL-REVIEW.md]
scope: Wave 5 only (12-09 People Search, 12-10 Admin placements)
started: 2026-07-17T00:00:00Z
updated: 2026-07-18T00:00:00Z
---

## Current Test

number: 1
name: People Search results correct + privacy-safe (visual confirmation only)
expected: |
  All privacy invariants, action gating, and pagination are now machine-verified
  (see Verification Strengthened below). Remaining: a logged-in member visually
  confirms results render and Follow/Message clicks work end-to-end.
awaiting: user visual confirmation (logged-in browser session)

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

## Verification Strengthened (2026-07-18)

The two items below were originally "needs a browser session." A second pass
converted every machine-checkable part into automated + live-SQL verification,
so the residual human need is narrowed to pure visual/interactive confirmation.
Full green-room suite: 104 tests green; tsc + lint clean.

The step-by-step human walkthrough for the residual visual confirmation lives in
`12-BROWSER-UAT-CHECKLIST.md` — run that in a logged-in/admin session to close both
items to `pass`.

### 1. People Search results are correct and privacy-safe (12-09)
expected: |
  As a signed-in member on /green-room, the People Search module returns members
  filtered by keyword / role / open-to / genre / location / relationship / member
  type. Results exclude: yourself, non-public profiles, and members you have blocked
  or who have blocked you (both block directions). Cards show only public info —
  never email, legal name, or contact fields. Message is hidden on your own card;
  Follow appears only for outside-network results. "Show more" paginates without
  duplicates.
result: pending-visual
automated_evidence: |
  - Public-safe projection: DISCOVER_PUBLIC_COLUMNS asserted to exclude every
    PII/private column; live probe confirmed selecting contact_phone → 42501.
  - is_public filter, self-exclusion (.neq id), and bidirectional block exclusion
    (.not id in (blocked-by-me ∪ blocked-me)) unit-tested and live-verified (query
    shape → HTTP 200; non-public rows are RLS-readable so the app filter is
    load-bearing and present).
  - Role match across BOTH industry_roles (TEXT[]) and roles JSON presets
    (profileMatchesRole) unit-tested.
  - Action gating (personActionFlags): Message hidden on self, Follow only for
    outside_network, never re-offered to following/connected — unit-tested.
  - Pagination cursor (over-fetch + in-app role filter) unit-tested for
    full-page, short-page, and non-matching-row-advance cases (no skips/dupes).
  residual_human: Visually confirm results render and Follow/Message clicks work
    end-to-end in a logged-in browser session with real data.

### 2. Admin placement create → activate visibility gate (12-10)
expected: |
  As an admin at /admin/green-room-placements: (a) a placement toward a PRIVATE
  destination is rejected 409 on activate and stays draft. (b) a PUBLIC destination
  (or valid https external URL) activates. (c) Pause/Resume/Archive work; active
  placements render as labeled feed cards, inactive/expired ones do not. (d) a
  non-admin is refused 403.
result: pending-visual
automated_evidence: |
  - Non-admin → 403; activate-toward-not-visible → 409 (POST and PATCH) unit-tested.
  - isDestinationVisible now unit-tested for ALL destination types: profile,
    project, track (two-step parent-project lookup), opportunity, post, external,
    plus null-id → false.
  - DELETE archive-guard: active placement refused 409 ("archive first"); archived
    deletes 200 — unit-tested.
  - Feed active-window rendering (buildPlacementWindowPredicate) covered in
    green-room-feed-api tests; RLS revokes authenticated writes (migration 057).
  residual_human: Visually confirm the admin create→activate→pause→archive flow and
    that an active card actually renders (and a paused/expired one does not) in the
    Green Room feed.

## Summary

total: 2
passed: 0
issues: 0
pending: 2   # both narrowed to visual-only confirmation; all logic machine-verified
skipped: 0
blocked: 0

## Gaps

None found. The reworked role filter + pagination from the adversarial-fix commit
were audited and are correct (regression tests added). No confirmed issues remain.
