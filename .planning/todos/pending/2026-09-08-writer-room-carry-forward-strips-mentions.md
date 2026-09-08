---
created: 2026-09-08
severity: medium
area: writer-room
status: pending
origin: 38.0.3 research, incidental finding
---

# Carrying a Writer Room comment forward silently strips its @mentions

## What happens

`review_work_version_comment_carry` copies a comment to a new version and
filters its `mentioned_user_ids` through:

```sql
-- supabase/migrations/160_writer_room_timed_track_comments.sql:350
ARRAY(
  SELECT mentioned_id
  FROM unnest(source.mentioned_user_ids) AS mentioned_id
  WHERE public.is_work_owner(p_work_id, mentioned_id)
     OR public.work_member_tier(p_work_id, mentioned_id) IS NOT NULL
)
```

Migration 174 bound both helpers to the caller:

```sql
p_uid = auth.uid() OR auth.role() = 'service_role' OR pg_trigger_depth() > 0
```

`mentioned_id` is **another user's** id, so `p_uid = auth.uid()` is false.
`review_work_version_comment_carry` is a plain RPC (not a trigger, so
`pg_trigger_depth()` is 0) and `app/api/works/[workId]/versions/[versionId]/
comments/carry-forward/route.ts:15` uses `createApiClient()` — a **user-scoped**
client, so `auth.role()` is `authenticated`, not `service_role`.

All three branches fail for every mentioned user other than the caller, so the
filter drops them. **Mentions vanish on carry-forward.**

## Confidence

Derived from reading SQL and tracing the call site. **Not reproduced in the
app.** Verified: line 350 is inside `review_work_version_comment_carry`
(declared line 262), the route's client is `createApiClient()`, and migration
174 is the latest definition of both helpers.

Reproduce by carrying forward a comment that @mentions someone other than
yourself and checking whether the mention survives.

## Not a security issue

The opposite — a security bind is causing a functional regression. Nothing is
exposed and nothing is corrupted; the mention is simply not copied.

## Note for whoever fixes it

The same shape may affect migrations 146 and 160's trigger-side calls
(`is_work_owner(NEW.work_id, v_mentioned_user_id)`). Those are inside trigger
functions, so `pg_trigger_depth() > 0` currently saves them — which is exactly
why migration 174 included that branch. **Do not remove it from 174** while
those callers exist. Phase 38.0.3 omits that branch only for the thirteen NEW
binds, where no trigger calls them.

Deliberately kept out of Phase 38.0.3: folding an unrelated fix into a security
phase is what migration 200's header warns against.
