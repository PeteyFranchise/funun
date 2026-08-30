---
created: 2026-08-27
area: security / account identity
title: TRIPWIRE — if handle-less accounts start posting, reopen the NOT NULL decision
recurring: true
---

# Tripwire: handle-less accounts posting = reopen D-13

**Owner decision (2026-08-27, Phase 36):** the database rule "every account must have
a handle" (`NOT NULL`) was DEFERRED — option 1, defer-not-null. The unskippable
sign-in screen enforces it for people; the database enforces uniqueness, reserved
names, retired names, and format.

**The owner's exact condition for reopening it:**

> "option 1, for now. The moment we start to see handle-less accounts posting on the
> website, we need to reconsider our options."

## What to watch for

A **nameless account acting on social surfaces** — Green Room posts, wall posts, DMs,
comments — where the actor has no `@handle`. That can only happen via direct API use
(the UI gate blocks page loads), so seeing it means someone is deliberately bypassing
the UI.

Quick check, any time:

```
select id, artist_name, handle, created_at from user_profiles where handle is null;
```

3 rows are expected today (Pete + Thomas ×2, until they next sign in and the gate
collects a handle). The signal is not "rows exist" — it is a handle-less account
WITH social activity.

## If the tripwire fires

Reopen the decision with real evidence in hand. The prepared path is
**not-null-with-trigger-rework** (its own phase): placeholder handles for
staff/buyer/industry provisioning + reworking the D-10b gate condition + its test
suite. Scoped in `.planning/phases/36-*/36-07-PLAN.md`'s decision checkpoint and the
D-13 amendment in `36-CONTEXT.md`.

**A cheaper interim, if the sighting is a one-off rather than a pattern:** extend the
presence check to the write paths that actually produce public activity (the wall,
endorsement and DM POST routes). That closes the API-only hole — which is the whole of
the exposure here — without touching D-10b's gate condition, plan 06's test suite, or the
schema. Worth pricing before committing to the full rework.

## Why the schema route is not simply "add the constraint"

The obstacle was never the old un-backfilled rows, so draining them did not clear it (and
neither did deleting the five fixture accounts on 2026-08-27). On this Supabase instance
`app_metadata` is invisible to `handle_new_user()` at INSERT — the Phase 27 `27-13`
diagnostic — so the buyer, staff, industry and curator branches cannot fire and every
provisioning lane falls through to the default branch, which carries a handle only for a
self-serve artist signup. A non-nullable column would reject all four admin lanes outright,
and would also fire inside migration 133's D-15 fallback, the handler whose entire purpose
is to insert a handle-less row so a lost race costs a handle rather than an account.

## References

- `.planning/phases/36-account-identity-mandatory-handle-for-user-accounts-artist-d/36-CONTEXT.md` — D-13 as amended, plus D-09, D-10b, D-15
- `supabase/migrations/133_handle_identity.sql` — the D-15 fallback and the reserved/retired guard
- `supabase/migrations/134_handle_format_and_backfill.sql` — the format constraint; its header records why no nullability alteration is present
