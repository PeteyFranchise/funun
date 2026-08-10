---
phase: 27-artist-invite-only-onboarding
plan: 11
subsystem: auth
tags: [supabase, postgres, auth-trigger, invite-gate, production-cutover]
requires:
  - phase: 27-artist-invite-only-onboarding
    provides: migrations 097-103 and invite-only signup implementation
provides:
  - Production migrations 097-103 applied with LOCAL=REMOTE parity
  - Live invite-gate smoke evidence for uninvited, invited, and existing artists
  - Reproducible non-artist provisioning regression discovered during cutover
affects: [artist-onboarding, staff-provisioning, buyer-provisioning, industry-provisioning]
tech-stack:
  added: []
  patterns: [database-trigger invite gate, service-role smoke with disposable cleanup]
key-files:
  created:
    - .planning/phases/27-artist-invite-only-onboarding/27-11-SUMMARY.md
  modified: []
key-decisions:
  - "Stopped without improvising a fix after the live buyer-lane regression was reproduced."
  - "Used direct Auth-admin trigger smoke as the authoritative gate check because the production check-invite API currently returns 404."
patterns-established:
  - "Production cutovers must smoke actual auth.users trigger behavior, not only the application allowlist proxy."
requirements-completed: []
coverage:
  - id: D1
    description: "Migrations 097-103 are applied to production with migration parity."
    requirement: INVITE-11
    verification:
      - kind: integration
        ref: "npx supabase migration list"
        status: pass
    human_judgment: false
  - id: D2
    description: "Invite-only artist gate rejects uninvited artists and admits invited artists."
    requirement: INVITE-10
    verification:
      - kind: integration
        ref: "Production Auth-admin disposable-user trigger smoke"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-artist provisioning remains unaffected by the artist-only gate."
    verification:
      - kind: integration
        ref: "Production Auth-admin buyer-lane smoke"
        status: fail
    human_judgment: true
    rationale: "Buyer creation is rejected before post-create reconciliation can run; a corrective migration/code change requires review."
completed: 2026-08-09
status: blocked
---

# Phase 27 Plan 11: Live Cutover Summary

**Migrations 097-103 are live and the artist invite gate works, but non-artist provisioning is blocked by Auth metadata timing and requires a reviewed corrective change.**

## Production Push

- **Auth method:** Existing authenticated and linked Supabase CLI session; `SUPABASE_ACCESS_TOKEN` fallback was not needed.
- **Pre-push safety count:** `user_profiles.member_type = 'artist'` returned **9**, satisfying the required `>= 1` checkpoint.
- **Applied in order:** 097, 098, 099, 100, 101, 102, 103.
- **Push result:** Success; `supabase db push` completed without an error.
- **Parity:** `supabase migration list` shows LOCAL=REMOTE through 103.
- **PostgREST:** Service-role reads of `artist_invites` and `artist_waitlist` both succeeded; each contained 0 rows before smoke fixtures.

## Live Gate Smoke

### A. Uninvited artist — PASS

- Production Auth-admin `createUser` for a unique uninvited email was rejected with `Database error creating new user`.
- No `auth.users` row remained.
- No `user_profiles` row was created.
- Production `POST /api/signup/check-invite` returned **404**, so the deployed application proxy is not currently available; the database trigger itself was tested directly and passed.

### B. Invited artist — PASS

- Inserted one temporary pending, unexpired `artist_invites` row.
- Auth-admin `createUser` succeeded.
- Exactly one `user_profiles` row and one `subscriptions` row were created.
- The invite changed to `accepted`, its `accepted_user_id` matched the new user, and `accepted_at` was populated.
- The disposable user and invite were deleted afterward.
- Production `POST /api/signup/check-invite` returned **404**; direct trigger behavior passed.

### C. Existing artist account — PASS (scriptable auth verification)

- Located an existing auth user backed by an artist `user_profiles` row.
- Generated a one-time magic-link sign-in without changing its password.
- Supabase verified the link with HTTP **303** and redirected to `https://www.funun.studio/`.
- A browser-rendered post-login page was not exercised; the Auth sign-in exchange itself succeeded.

### D. Non-artist lane — FAIL

- A disposable buyer was created using the same Auth-admin metadata shape as `createBuyerAccount`: `app_metadata.role = 'buyer'`.
- Auth returned `Database error creating new user`; no disposable auth row remained.
- The buyer branch in `handle_new_user()` did not observe the role during the insert trigger and the request fell into the default artist gate.
- `lib/buyers/createBuyerAccount.ts` already documents the underlying production behavior: this Supabase instance applies `app_metadata` after the `auth.users` insert, so its post-create phantom-row cleanup cannot run once the new artist gate rejects the transaction first.
- Staff and other app-metadata-selected lanes may share the same risk and should be covered by the corrective review.

## Cleanup

- Disposable auth-user remnants: **0**
- Disposable invite remnants: **0**
- No migration was edited and no retry/workaround was attempted.

## Blocking Follow-up

1. Author and independently review a new corrective migration/code change that makes staff/buyer/industry/curator provisioning distinguishable before the artist gate executes, without weakening the artist gate.
2. Deploy the application code containing `/api/signup/check-invite`; production currently returns 404 for that endpoint.
3. Re-run smoke D for at least one real non-artist provisioning primitive, plus staff and industry because they also rely on Auth metadata.

## GSD Execution Note

The existing Phase 27 plan was used directly through Codex's GSD bridge workflow. No additional quick-plan fallback was needed.

---
*Phase: 27-artist-invite-only-onboarding*
*Cutover date: 2026-08-09*
