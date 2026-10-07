# TRUNCATE and TRIGGER are granted to anon and authenticated on the rights tables

**Captured:** 2026-10-06 · **Status:** real, not live-exploitable, same class migration 070 already chose to close
**Found:** incidentally, reading `role_table_grants` while verifying migration 239

## What the grant check showed

Verifying 239's REVOKEs meant listing every privilege `authenticated` and `anon` hold on
`ai_entries` and `work_versions`. The REVOKEs had worked. The rest of the output had not been
looked at before:

```
ai_entries    anon           INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
ai_entries    authenticated  INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
work_versions anon           INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
work_versions authenticated  INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
```

**`TRUNCATE` bypasses RLS entirely.** One statement empties the whole table — the entire
AI-disclosure ledger, or every recorded take. No policy is consulted. `TRIGGER` allows attaching
arbitrary triggers to a table, which is a privilege-escalation surface.

## This repo already decided this is worth closing

Migration 070's own header, on five other tables:

> *"Migrations 042/056/057/058 revoked only INSERT/UPDATE/DELETE (and SELECT where applicable) on
> five socially-exposed tables; none touched TRUNCATE or TRIGGER, so Supabase's default full-table
> grant to authenticated/anon left both standing. TRUNCATE bypasses RLS entirely — the same class
> of gap migration 062 found and closed."*

So the judgement has been made; it was simply scoped to five tables. The rights tables were not
among them, and neither — almost certainly — are most of the rest of the corpus. **This should be
a sweep, not a one-table patch.**

## Why it is not urgent, stated precisely

**Not reachable through PostgREST.** No REST verb maps to TRUNCATE, and `anon`/`authenticated`
are PostgREST roles — they have no direct SQL session to issue one from. Exploiting this requires
a direct database connection, which requires credentials those roles do not have.

So this is defence-in-depth against a future change — a new SQL-capable surface, a connection
pooler misconfiguration, an RPC that accepts dynamic SQL — not a hole an attacker can walk
through today. That is exactly why it was left out of migration 239 rather than folded in: 239 is
a verified fix for a live hole, and widening it to a speculative one would have made it harder to
reason about and harder to verify.

## What the fix looks like

Mirror migration 070's statement for every table holding rights-bearing or identity-bearing data,
not just these two:

```sql
REVOKE TRUNCATE, TRIGGER ON public.<table> FROM authenticated, anon;
```

**Before writing it, enumerate.** The right first step is the grant census, not a migration:

```sql
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('authenticated','anon')
group by table_name, grantee
having string_agg(privilege_type, ',') like '%TRUNCATE%'
    or string_agg(privilege_type, ',') like '%TRIGGER%'
order by table_name, grantee;
```

That returns the real scope. My expectation is that it is most of the schema, since the default
Supabase grant includes both and only migrations 062 and 070 have ever revoked them — but that is
an expectation, not a finding, and the query settles it.

## Verification, when built

A text-lock proves nothing here — this is the exact shape migration 230 got wrong. Verify with
the same census query afterwards, asserting TRUNCATE and TRIGGER are **absent**, plus one
behavioural probe per class: a `TRUNCATE` attempt as `authenticated` must raise 42501, and the
ordinary INSERT/SELECT paths on the same table must still work.

## Related

- `supabase/migrations/070_readiness_definer_privilege_sweep.sql` — the precedent and its reasoning
- `supabase/migrations/062_split_sheet_esign_envelopes.sql` — where this class was first closed
- `supabase/migrations/239_rights_ledger_write_lockdown.sql` — the verification that surfaced it
- [[reference_column_revoke_noop]] — why the census must ask whether the privilege is gone
