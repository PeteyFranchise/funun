---
phase: quick-261017-u6a
plan: 01
status: complete
tags: [auth, middleware, migration, claim-loop]
requirements: [GH-191, ROUTE-GATE-ARTIST]
commits:
  - af5649a5  # fix(auth): set claim sentinel for verified signups without an invite (Closes #191)
  - 3f11c4e8  # fix(auth): require sign-in on all artist routes
migration_244_applied: false
---

# Quick 261017-u6a: Claim loop sentinel and artist route gating

Migration 244 stops the per-request collaborator-claim retry for confirmed accounts with no usable invite token. Middleware now requires sign-in on every `app/(artist)` route through a tested `isProtectedPath` predicate.

## Task 1: Migration 244 (af5649a5, Closes #191; review fixes in a follow-up commit)

- `supabase/migrations/244_verified_signup_claim_sentinel.sql`: `CREATE OR REPLACE` of `complete_verified_signup_claim`, based on 214 (still the only file defining it, confirmed with grep). Wrapped in `BEGIN`/`COMMIT` with `NOTIFY pgrst` inside, matching 214's layout. 214's combined guard is split in two, and the dead-end is covered too:
  1. `IF NOT FOUND OR v_email IS NULL THEN RETURN FALSE` (unconfirmed or email-less users: no write, they keep retrying).
  2. `IF v_token IS NULL OR v_token !~ '^[A-Fa-f0-9]{64}$' THEN UPDATE user_profiles SET claimed_at = COALESCE(claimed_at, now()); RETURN FALSE` (tokenless case).
  3. The `collaborator_invites` `IF NOT FOUND` dead-end writes the same sentinel before `RETURN FALSE` (well-formed token, no redeemable invite: expired, revoked or consumed).
- Explicit `p_invite_token` is used only when it matches the 64-hex pattern. A malformed non-empty parameter no longer overrides a valid metadata token; the metadata token is used instead.
- Everything from the `artist_invites` lookup through the final `RETURN TRUE` is identical to 214 except the one added dead-end sentinel write. The test strips that write and compares the span to 214's.
- Grants re-issued service_role only. Backfill covers confirmed users with an email, NULL `claimed_at`, no ledger row, and either no well-formed metadata token or a well-formed token that no invite redeems under the function's own predicates. It is deliberately not "all confirmed users with NULL claimed_at": that would set the sentinel for users whose metadata token still redeems a live invite and short-circuit a pending middleware redemption. Owner verification block has C1, C1b (dead token), C2, C3, C3b (malformed explicit token) and C4.
- `lib/invites/completeSignupClaim.ts` and `app/api/claim-collaborators/route.ts` need no change. Both FALSE branches still return FALSE, so the helper still reports `completed: false` and the route still returns 409.
- Test: `__tests__/migration-244-verified-signup-claim-sentinel.test.ts` (14 tests). The `auth.users` `SELECT ... FOR UPDATE` block is asserted exactly (tail compared to 214 and to a literal), so dropping `FOR UPDATE` fails the suite (confirmed by mutation).

### Review follow-up (GitHub #191)

Production check on 2026-10-18 (read-only): 10 `user_profiles`, 0 with `claimed_at` NULL. Nobody is stuck today; the migration is preventive. `claimed_at` is read only by middleware as a retry sentinel. The function keys on the ledger and token + email, never on `claimed_at`, and later invites are redeemed with an explicit token, so setting the sentinel never blocks a later legitimate claim.

### Who is affected by #191

Not every tokenless user. Under 214, `handle_new_user` (214:109-112) raises `invalid_invite` for a self-serve member with no token, so new tokenless self-serve signups are rejected at creation. The affected population is confirmed accounts that exist without a usable token by another route: rows created before 214's trigger landed in an environment, accounts created outside the self-serve branch, and accounts whose token was malformed or already stripped from metadata without `claimed_at` being set. Size is unknown until the count below is run. Admin-provisioned users get `claimed_at` at creation and are not affected.

## Task 2: Artist route gating (3f11c4e8)

- `lib/auth/protectedRoutes.ts`: pure, no imports, `isProtectedPath(pathname)`. Legacy prefixes keep raw `startsWith` semantics (`/vault /dashboard /settings /collaborators /split-sheets /launchpad /admin`, plus `/w` exact or `/w/`). New segment-matched bases: `/antenna /benchmarks /coach /contracts /deals /earnings /green-room /ideas /messages /network /opportunities /sync-library /tools`. `/curators` exact only. `/ideas/join/` carved out.
- `middleware.ts`: inline allowlist replaced with `const isProtected = isProtectedPath(pathname)`. The `if (isProtected && !user)` redirect, `next` param, marketing rewrite and claim branch are textually unchanged. `/earnings` anonymous now redirects to `/signin?next=/earnings`.
- Tests: `lib/auth/protectedRoutes.test.ts` (55 tests), one source-text test added to `__tests__/middleware-auth.test.ts`.

### Decision: middleware predicate, not layout

A layout redirect would break `/ideas/join/[token]`, which deliberately renders a sign-in card for anonymous visitors. Layouts also receive no pathname, so building `next` would need a new forwarded header. Middleware already owns the redirect. "Covered by default" comes from a test that walks the top-level directories of `app/(artist)` and fails if any is not protected. `app/(artist)/layout.tsx` is untouched.

### Route enumeration (orchestrator note)

Route groups: `(admin)`, `(artist)`, `(auth)`, `(curator-portal)`. Top-level dirs: `api approve auth curators help join marketing-document pitch profile profile-preview r selects status sync team-fit u unsubscribe w`. There are no `route.ts` handlers outside `app/api`. A filesystem-driven test maps every `page.tsx` outside `(artist)` to its URL and asserts none is protected except under legacy `/admin` and `/w`. The only shared-prefix case is `/curators/claim` and `/curators/claim/[token]`, covered by a separate test. Not protected before or after (unchanged, out of scope): `/portal` (curator-portal), `/checklist` and `/tips` (admin group, no `/admin` prefix), `/profile`.

## Deviations from Plan

**1. [Rule 1 - Bug] `__tests__/profile-preview-route.test.ts` asserted the literal `pathname.startsWith('/settings')` in middleware.ts.** Extracting the predicate removed that text, so the test failed. Replaced with a behavioral assertion (`isProtectedPath('/settings')` true, `isProtectedPath('/profile-preview')` false). A seventh file beyond the plan's six; same intent, stronger check. Included in 3f11c4e8.

## Verification

- Target tests (Task 1 set: 244, 214, claim-collaborators-rpc, verified-signup-invite-flow, 233, completeSignupClaim, claim-collaborators route): 7 suites, 45 tests passed.
- `npx jest lib/auth/protectedRoutes.test.ts __tests__/middleware-auth.test.ts __tests__/marketing-root-route.test.ts`: 3 suites, 82 tests passed.
- `npm run security:migrations:verify`: PASS (214 to 218 digests intact).
- Full `npm test -- --runInBand`: 666 of 666 suites, 8401 of 8401 tests passed (an earlier run showed 1 failure, the profile-preview test above, now fixed).
- `npm run typecheck:strict`: exit 0.
- `npm run lint`: exit 0 via `rtk proxy npm run lint` (plain `npm run lint` errors on eslint config in this environment).
- No em dashes and none of the excluded words in added lines.

## Owner steps

1. Apply 244 by hand (not applied by this task). Before and after, run `select count(*) from public.user_profiles where claimed_at is null;`. On 2026-10-18 it was 0, so the backfill is expected to be a no-op and the C1 to C4 probes need a synthetic user created inside the probe transaction.
2. Out of scope: the ledger early-return TRUE branch does not set `claimed_at`. Normally unreachable, since the success path sets it in the same transaction. The backfill skips users with a ledger row for the same reason.

### Review follow-up verification

- `npx jest __tests__/migration-244`: 14 of 14 passed; removing `FOR UPDATE` from the migration fails the suite (mutation checked, then restored).
- `npm run security:migrations:verify`: PASS.
- Full `npm test`: 673 of 673 suites, 8554 of 8554 tests passed.
- `rtk proxy npm run lint`: exit 0 (`--max-warnings=0`). `npm run typecheck:strict`: exit 0.

## Self-Check: PASSED

Files exist (migration 244, its test, `protectedRoutes.ts` and test); commits af5649a5 and 3f11c4e8 present on `worktree-agent-ab86b1eafb7a4fd2c`; 214 and `app/(artist)/layout.tsx` untouched; migration not applied; nothing pushed.
