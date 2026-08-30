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
