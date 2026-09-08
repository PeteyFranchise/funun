---
quick_id: 260908-2dc
slug: migration-199-redeem-invitation-conflict
date: 2026-09-08
phase_ref: 38.0.2
---

# Migration 199 — fix 42702 in `workspace_redeem_invitation`

## What is broken

Part B behavioural verification against production (assertion **B18**, the only
caller of this RPC anywhere) returned:

```
42702: column reference "workspace_id" is ambiguous
```

`public.workspace_redeem_invitation` therefore **fails whenever it reaches seat
creation**. Invitation redemption is entirely non-functional in the applied
migration 198.

## Root cause

`workspace_id` is simultaneously:

1. an **OUT parameter** of the function (`RETURNS TABLE`, migration 198 line 1814), and
2. a real **column** on `public.workspace_members`.

Line 2229 reads:

```sql
ON CONFLICT (workspace_id, user_id) WHERE user_id IS NOT NULL
```

An `ON CONFLICT` index-inference specification is parsed as *expressions* —
it legally accepts expression indexes such as `ON CONFLICT (lower(email))` —
so PL/pgSQL applies variable substitution to it. An INSERT column list does
not have this property, which is why line 2213's identical-looking
`workspace_id, user_id, …` is fine and only 2229 raises. `user_id` is not a
declared name, which is why the error singles out `workspace_id`.

## Why `#variable_conflict use_column` is the right fix

Rejected alternatives:

- **Rename the OUT parameter** — changes the `RETURNS TABLE` signature; callers
  read `workspace_id` off the result. Breaking.
- **`ON CONFLICT ON CONSTRAINT`** — impossible. Migration 198's own COMMENT
  records that the upsert infers migration 182's **PARTIAL** unique index
  `idx_workspace_members_unique_user`, and a partial index cannot back a
  constraint.
- **Restructure into a conditional branch** — forbidden. 198 states the design
  property: "there is still exactly one INSERT and no conditional UPDATE
  against this table." A fork reintroduces the F11 double-INSERT race.

`use_column` is safe here, verified rather than assumed: the entire executable
body was scanned and **no OUT parameter** (`outcome`, `workspace_id`,
`member_id`, `member_role`, `invitation_audit_id`, `member_audit_id`) is ever
read as a variable expression. The only bare occurrences are INSERT column
lists — which resolve to columns regardless — plus the buggy `ON CONFLICT`.
The function's own header already asserts this invariant: "Every value the body
reads or writes lives in a `v_` local." So the directive changes resolution at
exactly one site: the bug.

## Tasks

1. Author `supabase/migrations/199_redeem_invitation_variable_conflict.sql`:
   `CREATE OR REPLACE FUNCTION public.workspace_redeem_invitation` reproducing
   198 lines 1804–2278 verbatim, with `#variable_conflict use_column` inserted
   between `AS $$` (1823) and `DECLARE` (1824). Re-issue 198's REVOKE/GRANT
   posture (lines 2280–2286) explicitly.
2. Add `__tests__/migration-199.test.ts` — text-lock in existing repo style.
3. Update the LIVE MIGRATION LEDGER in `.planning/ROADMAP.md`: add 199, move
   Phase 38.2 from `199–200` to `200, 203`. **Do not touch the 201–202 row.**

## Constraints

- Migrations are **HUMAN-GATED** — author only. No `supabase` command, no DB
  connection.
- No `npm run build` (dev server may be live) — use `npx tsc --noEmit`.
- **Do not touch** any Playbook file, `__tests__/migration-201-202-playbook.test.ts`,
  or migrations 201/202. Codex is actively working there.
- No `git add -A`. Stage only the files created here.

## Verification

- Migration 199 differs from 198's function block by exactly one added line.
- `npx tsc --noEmit` clean.
- New test passes; full suite still green.
- Owner applies 199, then re-runs Part B assertion B18 — expect
  `before_cohort=not_in_cohort after_cohort=ok seat=member`.
