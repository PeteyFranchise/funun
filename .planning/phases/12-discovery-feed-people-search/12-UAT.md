---
status: partial
phase: 12-discovery-feed-people-search
source: [12-PR-REVIEW-PACKET.md, 12-ADVERSARIAL-REVIEW.md]
scope: Wave 5 only (12-09 People Search, 12-10 Admin placements)
started: 2026-07-17T00:00:00Z
updated: 2026-07-19T00:00:00Z
---

## Current Test

number: 2
name: Admin placement create → activate visibility gate
expected: |
  As an admin at /admin/green-room-placements: (a) a placement toward a PRIVATE
  destination is rejected 409 on activate and stays draft. (b) a PUBLIC destination
  (or valid https external URL) activates. (c) Pause/Resume/Archive work; active
  placements render as labeled feed cards, inactive/expired ones do not. (d) a
  non-admin is refused 403.
awaiting: admin test account plus browser session on localhost

## Notes

Wave 5 is code-complete and pushed to PR #37 (plus July 18 follow-up fixes).
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

As of Sunday, July 19, 2026, one of the two browser-only checks has been partially
closed with a real signed-in localhost session. The remaining blocked item is the
admin placement walkthrough, because there is no admin test account and the app
currently has no sign-out/switch-account flow in the same browser session.

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
result: pass-limited
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
  residual_human: Rich-result behaviors (block filtering on actual returned members,
    follow action, and pagination over real results) still require populated member
    data to verify in-browser.
browser_execution_2026_07_19: |
  - Signed-in localhost session verified on /vault.
  - /green-room loaded without Unauthorized once the browser host matched the signed-in
    session (localhost instead of 127.0.0.1).
  - Feed resolved to a valid empty state: "The room is quiet on this tab."
  - People Search rendered, accepted a keyword submission ("producer"), and stayed in a
    valid empty state: "Search to discover members across the network."
  - No browser console warnings/errors were observed during this flow.
  - Limitation: there are currently no seeded/eligible member profiles in this
    environment, so result-card, follow, block-filter, and pagination behavior could
    not be exercised against live results.

### 2. Admin placement create → activate visibility gate (12-10)
expected: |
  As an admin at /admin/green-room-placements: (a) a placement toward a PRIVATE
  destination is rejected 409 on activate and stays draft. (b) a PUBLIC destination
  (or valid https external URL) activates. (c) Pause/Resume/Archive work; active
  placements render as labeled feed cards, inactive/expired ones do not. (d) a
  non-admin is refused 403.
result: blocked
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
blocking_condition_2026_07_19: |
  - The current localhost browser session is a non-admin account.
  - Navigating to /admin/green-room-placements does not expose the admin placement UI.
  - There is currently no admin test account available.
  - The app also has no sign-out/switch-account flow, so the same browser session
    cannot cleanly pivot to an admin identity for this test.

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

No new product bugs were found during the July 19 browser pass. The remaining gap is
environmental: admin placement UAT cannot be executed until an admin test account exists
or a session-switch path is available.
