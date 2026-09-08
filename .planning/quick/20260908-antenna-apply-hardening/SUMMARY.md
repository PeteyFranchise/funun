---
quick_id: 260908-antenna
slug: antenna-apply-hardening
status: complete
date: 2026-09-08
phase_ref: 38.0.2
migration: 200
applied: false
---

# Summary — migration 200

## Delivered

- `supabase/migrations/200_apply_to_opportunity_atomic_hardening.sql` — 201 lines.
  `search_path` tightened from `public` to `''`, all **nine** relation
  references qualified (including the three `%ROWTYPE` declarations), REVOKE
  re-issued naming `PUBLIC, anon, authenticated`.
- `__tests__/migration-200.test.ts` — 14 assertions, five mutations proved.
- ROADMAP ledger: 200 claimed, Phase 38.2 moved to 203/204. **Codex's 201–202
  untouched.**

## Verified, not asserted

The body was generated from 046 programmatically and then compared back:
107 lines each, **zero residual differences** once qualification and the
`search_path` line are normalised. The only intended behavioural change in this
migration is how unqualified names resolve.

## Why the two properties are one property

An empty `search_path` with even one unqualified name left behind is *worse*
than what 046 shipped — it does not resolve at all. Mutation M1 leaves a single
`FROM vault_projects` unqualified and fails, which is the assertion that
matters most here.

## Mutations proved

| Mutation | Result |
|---|---|
| One table left unqualified | 1 failed ✓ |
| `search_path` reverted to `public` | 1 failed ✓ |
| A lock mode changed to `FOR NO KEY UPDATE` | 2 failed ✓ |
| Body logic altered (`already_applied` → `already_done`) | 1 failed ✓ |
| Grant widened to `authenticated` | 1 failed ✓ |

## Deliberately not changed

`FOR UPDATE` on `public.opportunities` and `public.opportunity_matches` stays.
LO-2 would prefer `FOR NO KEY UPDATE` — opportunities is an FK parent of
opportunity_matches, so `FOR UPDATE` conflicts with the `FOR KEY SHARE` every
concurrent child INSERT takes. That is a **concurrency behaviour change** and
belongs in its own migration with its own behavioural verification. A test
asserts the lock modes so it cannot be folded in here silently.

## A correction to the record

`38.0.2-CONTEXT.md` says migration 046 has "no REVOKE at all." **False** — 047
revokes from `PUBLIC` and 048 grants `service_role`. The posture was never wide
open. The migration header states this, and a test anchors it against 047.

## OWNER: run this after applying, to settle the open question

This migration closes blind the one thing no file in the repo can answer —
whether `anon` or `authenticated` ever held a **direct** EXECUTE grant that
047's PUBLIC-only revoke left untouched. Read-only:

```sql
SELECT p.proname,
       p.prosecdef                                          AS security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(none)') AS proconfig,
       coalesce(
         (SELECT string_agg(a.grantee || '=' || a.privilege_type, ', ' ORDER BY a.grantee)
            FROM information_schema.routine_privileges a
           WHERE a.specific_schema = 'public'
             AND a.routine_name = p.proname),
         '(no grants)')                                     AS execute_grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'apply_to_opportunity_atomic';
```

Expected after applying: `proconfig` = `search_path=""`, and `execute_grants`
naming **service_role only**. If `anon` or `authenticated` appears in that
column *before* you apply 200, the exposure was real rather than theoretical —
tell me and I will treat it as an incident rather than hygiene.

## Gate

`npx tsc --noEmit` clean. Full suite green. **NOT APPLIED** — human-gated.
