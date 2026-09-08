---
created: 2026-09-08
status: AWAITING PETER'S APPROVAL — nothing moved, applied, renamed or renumbered
authors: Claude (Phase 38.0.3) + Codex (Playbook R27–31)
---

# Shared go/no-go: migration promotion & doctrine publication

**Nothing in this document has been executed.** No candidate was moved, applied,
renamed or renumbered. It answers the six coordination questions with evidence
and proposes an order for approval.

---

## Q1 — Safe promotion / application order

### The constraint that turned out not to exist

**The two workstreams are fully dependency-disjoint, verified in both
directions.** No Codex candidate (201–207) references any of the eighteen
helpers that migrations 208/209 revoke, drop or bind. Neither 208 nor 209
references any `playbook_*` object — the only occurrence is a filename inside a
comment explaining why the number moved from 207.

So there is **no technical ordering requirement between the two chains**. Order
is a policy choice, not a dependency.

### The constraints that do exist

- **Within Codex's chain:** 207 depends on 201, 202, 204, 205, 206.
- **Within Phase 38.0.3:** 209 after 208, and **both only after Part A's
  pre-run gate clears** — the pre-run is the sole evidence the disclosure
  existed and cannot be reconstructed afterwards.
- **210** (Tier 3, `no_block`) waits until 208/209 are applied *and verified*
  (owner decision D4), and its plan 04 must **deploy** before 210 applies.

### RECOMMENDED ORDER

```
1.  Part A PRE-RUN                    (read-only; the disclosure evidence)
2.  208  → 209                        (Phase 38.0.3 Tier 1 + Tier 2)
3.  Part A post-run → Part B          (verify)
4.  200                               (Antenna hardening; independent, low risk)
5.  201 → 202 → 204 → 205 → 206 → 207 (Playbook, AFTER the Q3 revisions)
6.  Plan 04 deploy → 210              (Phase 38.0.3 Tier 3)
```

**Why 208/209 go first, out of numeric order.** They are authored, tested,
harnessed and verified-ready, and they close a disclosure that is live right
now. The Playbook chain needs the Q3 revisions before it should go anywhere.
Blocking a ready security fix behind a feature chain that still needs work is
the wrong trade.

**The cost, stated plainly.** Applying 208/209 before 201–207 means the database
receives migrations out of numeric order. That is **already the norm here** —
196, 197, 198 and 199 were all applied by hand through the Supabase SQL Editor,
which maintains no migration-history table. See the probe in Q4: if
`supabase_migrations.schema_migrations` does not already reflect reality, the
CLI path is *already* unusable and this changes nothing. If it does reflect
reality, applying out of order forfeits `supabase db push` until someone
reconciles it deliberately.

**Either way: do not run `supabase db push` without reconciling first.**

---

## Q2 — Do candidates 201–206 need the same hardening?

**Yes — 204 and 205 materially, 201/202/206 for consistency.** Measured:

| Candidate | Functions | `search_path = ''` | `= pg_catalog, public` | Verdict |
|---|---|---|---|---|
| 201 | 0 definers, trigger fns | 0 | 4 | **harden** |
| 202 | 0 definers, trigger fns | 0 | 1 | **harden** |
| **204** | **7** (3 trigger + 4 RPC, ≥3 `SECURITY DEFINER`) | **0** | **10** | **HARDEN — highest priority** |
| 205 | 1 `SECURITY DEFINER` + trigger fns | 0 | 2 | **harden** |
| 206 | 0 definers, trigger fns | 0 | 1 | **harden** |
| 207 | 2 RPC + 1 trigger | **3** | 0 | **DONE** ✓ |

Zero of the 79 definer migrations already in `supabase/migrations/` use
`pg_catalog, public`. The house standard is `SET search_path = ''` with every
relation schema-qualified.

**Trigger functions are not exempt.** A trigger function with a mutable
`search_path` carries the same `pg_temp` shadowing hazard as an RPC — the temp
schema is searched *first* for relation names when it is not explicitly listed.
201, 202 and 206 have no `SECURITY DEFINER` RPCs but do have trigger functions
on the mutable path.

**Grant posture is already CORRECT in 204, 205 and 207** — `REVOKE ALL … FROM
PUBLIC, authenticated, anon` on functions plus table-level revokes from
`authenticated, anon`. That is exactly what migration 047 omitted, and that
omission is what left `apply_to_opportunity_atomic` callable by anyone holding
the public anon key until 2026-09-08. **Verify the same posture in 201, 202
and 206 before promotion.**

### A correction to my earlier review

I described 207's two RPCs as "new `SECURITY DEFINER` functions." **They never
were.** Both the committed version and the current one contain zero
`SECURITY DEFINER` clauses — they are `SECURITY INVOKER` (the default) with
service-role-only EXECUTE. That is a *stronger* posture than DEFINER, not a
weaker one: it removes the privilege-escalation surface entirely while still
bypassing RLS, because `service_role` carries `BYPASSRLS` regardless. My
review read the label off my own grep's section header instead of its output.

---

## Q3 — Revise, do not renumber

**Revise in place, keep every number.** 201, 202, 204, 205 and 206 each need:

1. `SET search_path = ''` on every function, RPC and trigger alike.
2. Every relation reference schema-qualified (`public.playbook_…`). With an
   empty `search_path`, one unqualified name does not resolve at all — an
   empty path plus a missed reference is **worse** than the mutable path it
   replaced. The two must land together.
3. `%ROWTYPE` declarations qualified too — an easy miss.
4. Confirm the `REVOKE … FROM PUBLIC, authenticated, anon` posture (201, 202,
   206 unverified).

**No renumbering.** Numbers are settled: 203 retired, 208/209 Phase 38.0.3, 210
Tier 3, 211–212 Phase 38.2. Renumbering is what caused today's 204 collision.

**Recommended: one diff per candidate, each with a drift guard proving the body
is byte-identical apart from qualification and the `search_path` line** — the
shape used for migrations 199 and 200. It is what makes "nothing else changed"
checkable rather than asserted.

---

## Q4 — Production verification probes

### Before anything (run once)

**P0 — is the CLI path already forfeit?**
```sql
SELECT version, name FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;
```
Compare against `ls supabase/migrations/`. If the table is missing, empty, or
stops below 199, `supabase db push` is *already* unusable and the ordering
concern in Q1 is moot. This has never been checked.

### After 208 + 209

Use the harness already written and committed:
`38.0.3-VERIFY-A-STRUCTURAL.sql` (pre-run, then post-run) and
`38.0.3-VERIFY-B-PRODUCTION-SINGLE.sql`. Part A is verified 0-write; Part B
seeds nothing.

**Carry-forward W1:** `workspace_member_role` cannot be behaviourally proven
while D-56 is off, because the workspace tables are empty. Re-run Part B rows
B5/B6 once D-56 is switched on, **before beta traffic**.

### After EACH Playbook migration

**P1 — definer/exposure sweep.** The same query that found the original
disclosure:
```sql
SELECT p.proname, p.prosecdef,
       coalesce(array_to_string(p.proconfig,','),'(none)') AS proconfig,
       has_function_privilege('anon', p.oid,'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid,'EXECUTE') AS authed_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'playbook%' OR p.proname LIKE '%playbook%'
ORDER BY anon_exec DESC, authed_exec DESC, p.proname;
```
Expected: `proconfig = search_path=""` on every row; `anon_exec` and
`authed_exec` **false** on every row.

**P2 — RLS on every new table.**
```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'playbook_%'
ORDER BY c.relrowsecurity, c.relname;
```
Expected: `relrowsecurity = true` on all. **A public table with RLS off is
PostgREST-readable** — this is the exact defect my own harness left behind as
`public.zz_verify_b_results`, still pending a `DROP`.

**P3 — table grants.**
```sql
SELECT table_name, grantee, string_agg(privilege_type,',' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'playbook_%'
  AND grantee IN ('anon','authenticated')
GROUP BY table_name, grantee ORDER BY table_name;
```
Expected: **empty**, or SELECT-only where a policy intentionally allows it.

### After the whole chain

Re-run 38.0.3's Part A. It sweeps every definer in `public`, so it will catch a
regression introduced by any Playbook migration, not just its own.

---

## Q5 — Doctrine publication sequence

Codex's proposed sequence is sound. Adding gates:

1. **Adopt source** — import the approved Markdown through
   `lib/playbook/publication-manifest.ts`.
   *Gate: the manifest resolves every source file; no silent skips.*
2. **Create draft** — DB-backed entry, unpublished.
   *Gate: P2 confirms RLS is on before the first row exists.*
3. **Assign reviewers** — room leads per the RBAC model.
4. **Review visibility & security** — the reviewer sees exactly what a Team
   Member would.
   *Gate: check as an ordinary Team Member and as a revoked user, not only as
   Leadership. Most visibility bugs only appear from the lower-privilege seat.*
5. **Publish.**
   *Gate: re-run P1 — publication paths often add functions.*
6. **Supersede legacy entries EXPLICITLY** — never delete.
   *Gate: a superseded entry is still reachable by its old link and clearly
   marked, so nobody follows stale doctrine believing it current.*

**Do not begin before the schema is installed and P1–P3 are clean.** Publishing
into a table whose RLS or grants are wrong exposes doctrine content to every
authenticated user, and unpublishing does not un-disclose it.

---

## Q6 — R27–31 activation

Codex's sequence is right. One addition, and it is not optional:

### FIRST — the cron jobs are already live

`ee7e72f1` added two scheduled jobs to `vercel.json`:

```
/api/cron/playbook-review-reminders    daily 14:00 UTC
/api/cron/playbook-reading-reminders   daily 13:00 UTC
```

These are **deployed and will fire on schedule**. R27–31 is "default-off with
emergency stop", but **a cron does not respect a feature flag unless the route
itself checks it.** Vercel calls the endpoint regardless of any activation
control.

**Gate before the next 13:00 UTC:** confirm both handlers check the same
activation control and cohort gate as the rest of R27–31, and no-op when off.
If they do not, people receive reminders about a feature that is supposed to be
disabled — the one failure mode "default-off" was designed to prevent.

### Then

1. **Named beta cohort** — explicit membership, no inference.
2. **One feature at a time**, verifying between each.
3. **Emergency stop retained and tested** — trigger it once deliberately and
   confirm access actually stops. An untested stop is not a stop.
4. **Test five seats:** Leadership, room lead, ordinary Team Member, **revoked
   user**, and **cross-room access**. The last two are where authorization bugs
   live; the first three usually pass by construction.

---

## Recommended go/no-go

| Item | Verdict |
|---|---|
| Apply 208 → 209 (after Part A pre-run) | **GO** — ready, harnessed, closes a live disclosure |
| Apply 200 | **GO** — independent, low risk |
| Promote 201/202/204/205/206 | **NO-GO** until the Q3 revisions land |
| Promote 207 | **NO-GO** — it is ready itself, but depends on the five above |
| Doctrine publication | **NO-GO** until schema installed and P1–P3 clean |
| R27–31 activation | **NO-GO** until the cron gate in Q6 is confirmed |
| `supabase db push` | **NO-GO** until P0 is run |
| Drop `public.zz_verify_b_results` | **GO** — my own leftover, no RLS |

Awaiting Peter's approval.
