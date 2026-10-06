# Finish behavioural verification of migrations 235–237 (Pass 6 criticals)

**Captured:** 2026-10-06 · **Status:** migrations APPLIED to production, PR open and green, NOT merged
**Blocker:** the probe harness hits a pre-existing grant problem before reaching the guards

## State, exactly

- **Migrations 235, 236, 237 are applied to production** (`supabase db push`, confirmed by the owner).
- **PR: https://github.com/PeteyFranchise/funun/pull/171** — all six checks green, deliberately unmerged.
- Branch: `pass6-criticals-rights-table-lockdown`. The local working tree is on that branch.
- No probe fixture leaked: the stray-row check returned `0 / 0 / 0`.

## What the probes established

| probe | result | trustworthy? |
|---|---|---|
| P1 editor changes writers | 42501 | likely genuine |
| P2 editor changes isrc | 42501 | likely genuine |
| P3 editor changes metadata | 42501 | likely genuine |
| P4 OWNER reassigns user_id | 42501 | likely genuine |
| P5 editor deletes track | 0 rows | likely genuine |
| P6 editor changes title/lyrics | **42501 — should have been ALLOWED** | harness fault |
| P7 owner changes writers/isrc | **42501 — should have been ALLOWED** | harness fault |
| P8 service_role changes writers | allowed | genuine |

`auth.uid()` and `auth.role()` were confirmed resolving correctly inside the harness, so the
blanket-denial theory was ruled out.

## The actual blocker

P6 and P7 both failed with:

```
42501 :: permission denied for function calculate_vault_readiness
```

**This is pre-existing and unrelated to 235.** Migration 070:206 does
`REVOKE EXECUTE ON FUNCTION public.calculate_vault_readiness(uuid) FROM PUBLIC, anon, authenticated`,
and some trigger on `tracks` calls it. The guard never ran — the UPDATE died earlier in the chain.

## The one unanswered question, and why it matters

**No migration in the corpus creates a readiness trigger on `tracks`.** `grep "ON tracks|ON public.tracks"`
returns only `tracks_updated_at` (001), `tracks_guard_work_id_write` (231) and
`tracks_guard_rights_columns` (235). Production evidently has one the files do not show.

- If its function is `SECURITY DEFINER` → this is purely a probe artifact; rerun the probes with a
  role that can execute the function, and the guards are testable as designed.
- If it is **not** `SECURITY DEFINER` → **authenticated track updates are broken in production**,
  which is a separate and more serious finding than anything Pass 6 reported, and would mean the
  Metadata Studio / ISRC / audio routes are failing for real users.

Settle it with this read-only query before touching anything else:

```sql
select t.tgname,
       p.proname as fn,
       p.prosecdef as is_security_definer,
       t.tgenabled
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.tracks'::regclass and not t.tgisinternal
union all
select 'GRANT CHECK', 'calculate_vault_readiness',
       has_function_privilege('authenticated', 'public.calculate_vault_readiness(uuid)', 'EXECUTE'),
       null;
```

## Then

1. Rewrite the 235 harness so the readiness-touching probes run under a role that can execute
   `calculate_vault_readiness`, so the guard is what is under test rather than migration 070's
   grant posture.
2. Re-run 235's eight probes. All eight must PASS.
3. Run 236's nine probes (P6 — the live upload-only e-sign path — matters most).
4. Run 237's nine probes (P8 — the recreated SELECT policy — matters most; losing it would make
   the initiator's own sheets silently vanish).
5. Merge #171 only once all three read clean.

## Why leaving it applied-but-unverified is safe

The only failure mode the evidence suggests is the guards being **too strict**, which fails closed.
And every track-write route in the app scopes with `.eq('user_id', user.id)`, so no editor has a
working track-write path to be broken in the first place.

## Related

- `.planning/deliberations/2026-10-05-pass-6-identity-access-review.md` — C-2, C-3, C-4
- `supabase/migrations/070_readiness_definer_privilege_sweep.sql:206` — the REVOKE
- [[project_migration_behavioural_verification]] · [[reference_sql_null_comparison_disarms_guard]]
