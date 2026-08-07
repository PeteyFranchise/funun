---
phase: 25-funun-team-accounts-ae
plan: 03
subsystem: staff-schema-migrations
tags: [migration, staff, rbac, audit, ae-assignment, human-gated]
dependency-graph:
  requires:
    - "lib/admin/gate.ts's getStaffRole/requireStaff (25-01)"
    - "lib/staff/audit.ts's logStaffAction (25-02) — writes staff_audit_log once this migration is live"
  provides:
    - "supabase/migrations/089_funun_staff_and_audit.sql (funun_staff + staff_audit_log tables, DRAFTED NOT PUSHED)"
    - "supabase/migrations/090_buyer_orgs_ae_assignment.sql (buyer_orgs.ae_user_id column, DRAFTED NOT PUSHED)"
    - "__tests__/migration-089-090.test.ts (static pre-push text-verification gate)"
  affects:
    - supabase/migrations/089_funun_staff_and_audit.sql
    - supabase/migrations/090_buyer_orgs_ae_assignment.sql
    - __tests__/migration-089-090.test.ts
tech-stack:
  added: []
  patterns:
    - "Zero-RLS-policy + REVOKE-ALL service-role-only table (migration 058's verification_audit_log shape) reapplied verbatim to funun_staff and staff_audit_log"
    - "Private-by-default column-privilege regime (migration 080's REVOKE-then-GRANT allowlist) — a new ADD COLUMN is staff-only unless explicitly GRANTed; ae_user_id deliberately left out"
    - "gen_random_uuid() default (not uuid_generate_v4()) matching the 080+ migration convention"
key-files:
  created:
    - supabase/migrations/089_funun_staff_and_audit.sql
    - supabase/migrations/090_buyer_orgs_ae_assignment.sql
    - __tests__/migration-089-090.test.ts
  modified: []
decisions:
  - "Migrations authored as 089/090 (not 085/086 as the plan's original text said) — Phase 28 already landed 085-088 live on this branch; the plan's frontmatter/critical_constraints already reflect this renumbering"
  - "funun_staff.staff_role stays a DISPLAY COPY of the authoritative app_metadata.staff_role (Pitfall 1) — documented in the table COMMENT so a future role-change route knows to write both in the same handler"
  - "buyer_orgs.ae_user_id deliberately omitted from migration 080's authenticated GRANT SELECT allowlist (Pitfall 2, D-03) — private/staff-only by construction, not an oversight, documented in the column COMMENT"
  - "Both migrations carry the same HUMAN-GATED header convention as migrations 080/085/086/088 — not pushed by this executor"
metrics:
  duration: ~15min
  completed: 2026-08-07
status: complete
---

# Phase 25 Plan 03: Staff Schema Migrations (089 + 090) Summary

Authored the two additive migrations Phase 25's remaining plans depend on — `funun_staff` +
`staff_audit_log` (zero-RLS-policy, service-role-only, mirroring migration 058's
`verification_audit_log` exactly) and `buyer_orgs.ae_user_id` (a private, nullable AE-assignment
column, mirroring migration 081's `owner_id` precedent) — plus a static migration-text test giving
an automated pre-push verification gate. **Both migrations are drafted, text-verified, and
committed, but NOT pushed** — the live `supabase db push` is a human-gated checkpoint owned by
25-07, per this project's standing migration convention (matches migrations 080/085/086/088).

## What Was Built

### Task 1: `supabase/migrations/089_funun_staff_and_audit.sql`

- `funun_staff` — `id, user_id (FK auth.users ON DELETE CASCADE), staff_role (TEXT NOT NULL CHECK
  IN ('leadership','ae','bd')), display_name, title, phone, avatar_url, created_at`. Indexed on
  `user_id`. `title`/`phone`/`avatar_url` are nullable — the Team Member Directory contact-card
  fields (25-10).
- `staff_audit_log` — `id, actor_id (FK auth.users ON DELETE SET NULL), action, target_type,
  target_id, changes JSONB, created_at`. Indexed on `(actor_id, created_at DESC)` and
  `(target_type, target_id, created_at DESC)` — matches `lib/staff/audit.ts`'s `logStaffAction()`
  write shape from 25-02 exactly.
- Both tables: `ENABLE ROW LEVEL SECURITY`, zero `CREATE POLICY` statements, `REVOKE SELECT,
  INSERT, UPDATE, DELETE ... FROM authenticated, anon` — reachable only via the service role.
- Table comments document `funun_staff.staff_role` as a display copy of the authoritative
  `app_metadata.staff_role` (Pitfall 1) and `staff_audit_log`'s service-role-only posture.

### Task 2: `supabase/migrations/090_buyer_orgs_ae_assignment.sql`

- `ALTER TABLE public.buyer_orgs ADD COLUMN ae_user_id UUID REFERENCES auth.users ON DELETE SET
  NULL` — nullable, additive, no backfill (every existing Client Partner org starts unassigned).
- `CREATE INDEX idx_buyer_orgs_ae_user_id ON public.buyer_orgs (ae_user_id)`.
- Deliberately does **not** extend migration 080's `GRANT SELECT (id, name, is_personal, verified,
  created_at)` allowlist — `ae_user_id` stays private/staff-only, matching how `verified_at`/
  `created_by` are already kept private in that same table. The column `COMMENT` states this
  explicitly so a future migration author doesn't "fix" it as an oversight.

### Task 3: `__tests__/migration-089-090.test.ts`

- Reads both migration files from disk (Jest cannot execute PL/pgSQL) and asserts against literal
  text, grouped in `describe('089', ...)` / `describe('090', ...)` blocks so `-t "089"` / `-t "090"`
  filter correctly for each authoring task's own verify step.
- 089 assertions: both `CREATE TABLE` statements present, `staff_role` CHECK restricted to the
  three roles, contact-card columns present and nullable, both tables `ENABLE ROW LEVEL SECURITY`
  with zero `CREATE POLICY` and a full `REVOKE`, the display-copy comment, the human-gated header,
  and the trailing `NOTIFY pgrst, 'reload schema'`.
- 090 assertions: the `ADD COLUMN ae_user_id ... ON DELETE SET NULL` statement, the index, the
  private-column comment, the human-gated header, and the trailing `NOTIFY`. The GRANT-line check
  is region-scoped — it extracts every line starting with `GRANT SELECT` first, then asserts none
  of those lines mention `ae_user_id` (this migration has zero `GRANT SELECT` lines at all, so the
  extracted set is empty and the assertion holds trivially and robustly against future edits).
- 14/14 tests green; `-t "089"` runs 8, `-t "090"` runs 6, matching the plan's per-task verify
  commands exactly.

## Deviations from Plan

**1. [Rule 3 / documented constraint] Files authored as 089/090, not 085/086.**
- **Found during:** Plan start (files_to_read).
- **Issue:** The plan body's original prose (25-PATTERNS.md, 25-RESEARCH.md) was written when 089/090
  were the next-available migration numbers, but Phase 28 subsequently landed migrations 085-088 live
  on this branch.
- **Fix:** None needed — the plan's own frontmatter (`files_modified`) and `<critical_constraints>`
  already correctly specify 089/090 and explicitly forbid creating 085/086 files. No deviation from
  the plan as actually written; noting this only because the underlying pattern-reference documents
  still say 085/086 in prose.
- **Files affected:** None (informational only).

No other deviations — plan executed exactly as written.

## Verification Results

- `npx jest __tests__/migration-089-090.test.ts` — 1 suite, 14 tests, all green.
- `npx jest __tests__/migration-089-090.test.ts -t "089"` — 8 tests run, all green (6 skipped).
- `npx jest __tests__/migration-089-090.test.ts -t "090"` — 6 tests run, all green (8 skipped).
- `npx tsc --noEmit` — clean.
- `npx eslint __tests__/migration-089-090.test.ts --max-warnings=0` — clean.
- Full repo suite (`npm test`) — 124 suites / 1498 tests, all green (no regressions; up from
  123/1484 in 25-02, consistent with the one new suite / 14 new tests added here).
- `supabase db push` — **NOT run.** Migrations 089/090 are drafted and committed to the repo but
  remain unpushed to the remote database, per this project's human-gated migration convention. The
  live push, `supabase migration list` LOCAL=REMOTE confirmation, and the adversarial checkpoint
  (zero-RLS access-denial smoke, column-grant lockdown smoke) belong to 25-07.

## Known Stubs

None — both migration files are complete DDL, not placeholders. No UI or route code was written in
this plan (schema-only, per the plan's explicit "files only" scope).

## Threat Flags

None new beyond what the plan's own `<threat_model>` already registered (T-25-03, T-25-04, T-25-16 —
all closed by construction via the zero-RLS/REVOKE-ALL and private-column patterns applied above,
same as documented in the plan). No new network endpoints, auth paths, or trust-boundary surface was
introduced — this plan is pure schema, gated behind the existing service-role-only write path.

## Self-Check: PASSED

- FOUND: supabase/migrations/089_funun_staff_and_audit.sql
- FOUND: supabase/migrations/090_buyer_orgs_ae_assignment.sql
- FOUND: __tests__/migration-089-090.test.ts
- FOUND commit 8a597e6 (feat(25-03): migration 089 — funun_staff + staff_audit_log)
- FOUND commit 4b89013 (feat(25-03): migration 090 — buyer_orgs.ae_user_id)
- FOUND commit ba603a8 (test(25-03): static migration-text assertions for 089/090)
