# Phase 12 Browser UAT Checklist

**Prepared:** 2026-07-18
**Scope:** Remaining authenticated browser checks for Phase 12 Wave 5.
**Do not use this file as pass evidence until a human actually completes the steps.**

## Preconditions

- Use the branch/PR that contains Phase 12 Wave 5.
- App is running against the intended Supabase environment.
- Test accounts exist:
  - Viewer account.
  - Public member account.
  - Private member account.
  - Blocked relationship pair for both block directions.
  - Admin account.
- At least one public profile/project and one private profile/project exist.
- If testing placement rendering, one valid public target or external HTTPS URL is available.

## Test 1: People Search Privacy-Safe Results

Goal: prove `/green-room` People Search returns useful results without leaking private or blocked member data.

Steps:

1. Sign in as the viewer.
2. Open `/green-room`.
3. Use People Search with a keyword that should match the public member.
4. Confirm the public member appears.
5. Search/filter by role.
6. Search/filter by `Open to`.
7. Search/filter by genre.
8. Search/filter by location.
9. Search/filter by relationship/member type if controls are present.
10. Confirm the viewer's own profile does not appear as an actionable outside-network result.
11. Confirm private/non-public profiles do not appear.
12. Confirm members blocked by the viewer do not appear.
13. Confirm members who blocked the viewer do not appear.
14. Inspect each result card and confirm it shows only public-safe fields: name, handle, avatar, headline, roles, genre, location, open-to if public, verified.
15. Confirm no email, legal name, contact phone, private notes, or hidden open-to data appears.
16. Confirm Message is hidden on the viewer's own card.
17. For an outside-network public result, click Follow.
18. Confirm the follow state updates and no page-level error appears.
19. Use Show more pagination if enough results exist.
20. Confirm pagination does not duplicate cards.

Pass criteria:

- Public-safe matching works.
- Blocked/private/self leakage does not occur.
- Actions behave correctly.
- Pagination has no duplicates.

Failure notes to capture:

- Search/filter used.
- Expected member/result.
- Actual result.
- Screenshot if UI-related.
- Browser console/network error if present.

## Test 2: Admin Placement Create And Activate Visibility Gate

Goal: prove admin-curated Green Room placements cannot activate private destinations and render only when active/visible.

Steps:

1. Sign in as admin.
2. Open `/admin/green-room-placements`.
3. Create a placement targeting a private profile or private project.
4. Click Activate.
5. Confirm activation is rejected with a 409 or visible "Destination is not public/visible" style error.
6. Confirm the placement remains draft.
7. Create a placement targeting a public profile, public project, public opportunity, or valid HTTPS external URL.
8. Activate the public/valid placement.
9. Confirm activation succeeds and status becomes active.
10. Open `/green-room`.
11. Confirm the active placement renders as a clearly labeled placement/sponsored/featured card.
12. Pause the placement.
13. Refresh `/green-room` and confirm the paused placement does not render.
14. Resume the placement.
15. Confirm it can render again while active.
16. Archive the placement.
17. Confirm archived placement does not render.
18. If expiry controls exist, set an expired `ends_at` and confirm expired placement does not render.
19. Sign in as non-admin or use a non-admin session.
20. Attempt to access `/api/admin/green-room/placements`.
21. Confirm the non-admin request is refused with 403.

Pass criteria:

- Private target activation is blocked.
- Public/valid target activation succeeds.
- Active placements render with clear labeling.
- Paused/archived/expired placements do not render.
- Non-admin API access is refused.

Failure notes to capture:

- Target type and ID/URL.
- Expected status.
- Actual status/error.
- Screenshot or response body.

## Sign-Off Template

Use this when reporting results:

```text
Phase 12 Browser UAT

Environment:
Branch/commit:
Tester:
Date:

Test 1 People Search:
Result: pass/fail
Notes:

Test 2 Admin Placements:
Result: pass/fail
Notes:

Issues opened/fixed:
Remaining blockers:
```

## Current Status

- Test 1: EXECUTED on Sunday, July 19, 2026 — limited pass on authenticated localhost
  session. Empty-state/auth/UI behavior verified; rich-result behavior remains data-limited.
- Test 2: BLOCKED on Sunday, July 19, 2026 — no admin test account exists, and the app
  currently has no sign-out/switch-account path for changing identities in-place.

## Execution Notes (2026-07-19)

- A host mismatch between `127.0.0.1` and `localhost` initially caused misleading
  `Unauthorized` results in Green Room data surfaces. Re-running the browser pass on the
  signed-in `http://localhost:3000` session resolved that issue.
- Test 1 outcome:
  - `/vault` confirmed authenticated.
  - `/green-room` loaded without `Unauthorized`.
  - Feed empty state rendered correctly.
  - People Search accepted input and stayed in a valid empty state without console errors.
  - No live result cards were available in this environment, so card-level assertions,
    follow behavior, and pagination over actual results remain unexercised.
- Test 2 outcome:
  - The current session is non-admin.
  - `/admin/green-room-placements` did not expose the admin UI for this account.
  - Without an admin user, private/public destination activation checks could not be
    verified interactively.

## Blockers Fixed (2026-07-19, quick task 260719-uat-signout-admin-account)

Both execution blockers above are resolved in code:

- **Sign-out/switch-account:** the orphaned `SignOutButton` is now mounted in the
  artist sidebar footer and the admin nav — sign out → `/signin` → sign in as the
  next identity.
- **Admin account:** run `node scripts/provision-test-admin.mjs --email <email>`
  (with `.env.local` sourced) to create or promote an admin test user
  (`app_metadata.is_admin=true`, the flag lib/admin/gate.ts checks). Password is
  generated and printed once on create.

Test 1's remaining data limitation (no rich result cards) still needs seeded
public/private/blocked member accounts — the sign-out control now makes creating
and switching those identities practical in one browser.
