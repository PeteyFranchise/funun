---
created: 2026-09-08
severity: low
area: database
status: pending
origin: 38.0.3 plan-check W4
---

# Drop `public.zz_verify_b_results` — a public table with no RLS

## What it is

The Phase 38.0.1 and 38.0.2 behavioural harnesses created a scratch results
table in production:

```sql
CREATE TABLE IF NOT EXISTS public.zz_verify_b_results (
  ord INT, check_name TEXT, detail TEXT, verdict TEXT, run_at TIMESTAMPTZ DEFAULT now()
);
```

**No `ENABLE ROW LEVEL SECURITY`. No `REVOKE`.** Supabase grants `anon` and
`authenticated` on tables in `public` by default, so with no RLS this is a
PostgREST-readable table — the same defect class Phase 38.0.3 exists to close,
created by the work that closed it.

The harness footer says it was left "on purpose … the results survive the
session". That was the wrong call.

## Impact

Low. It holds verification output — check names, verdicts, fixture UUIDs — and
the fixtures were deleted by teardown. No user data. But it is an unnecessary
exposed surface and it should not be there.

## Fix

```sql
DROP TABLE IF EXISTS public.zz_verify_b_results;
```

## Already prevented going forward

Phase 38.0.3's Part A and Part B harnesses use `TEMP` tables instead, and
38.0.3's Part A F-block reports this table so it cannot be forgotten again.

## Note

Any future owner-run harness in this repo must use `TEMP`, or enable RLS and
revoke, before it writes anything to `public`.
