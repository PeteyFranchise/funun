---
phase: 21-cross-account-collaboration-sheet-sync
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security-definer, vault, migrations]

# Dependency graph
requires:
  - phase: 20-profile-table-rename-artist-profiles-to-user-profiles
    provides: migrations 076/077 (user_profiles compat-view rename) confirmed live before 078 could sequence
provides:
  - "project_members guest-list table (four roles: owner/co-owner/editor/viewer)"
  - "is_project_owner / project_member_role SECURITY DEFINER helper pair (recursion-safe, migration 064 shape)"
  - "vault_projects RLS split into four per-operation policies (SELECT/UPDATE widen to membership, INSERT/DELETE stay owner-only)"
  - "project-scoped RLS rewrite on tracks/vault_assets/vault_documents/tool_outputs (access resolves via project_id + helpers, not row's own user_id)"
  - "owner-membership backfill for every pre-existing vault_projects row"
  - "lib/vault/membership.ts pure role-capability module (TS source of truth mirrored by the SQL CHECK constraint)"
affects: [21-02, 21-03, 21-04, 21-05, cross-account-collaboration, sheet-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER helper pair breaks RLS self-reference cycles (mirrors migration 064) — is_project_owner/project_member_role read the 'other' table with RLS bypassed so vault_projects and project_members policies can reference each other without 42P17 recursion"
    - "Child-table access resolves through project_id via project-level helpers, never the row's own user_id — prevents the sharing hole where an editor's write is invisible to a viewer/other member"
    - "Guest-list write lockdown: REVOKE INSERT/UPDATE/DELETE FROM authenticated, anon on project_members — only SECURITY DEFINER paths (backfill here, Plan 21-02's auto-membership trigger) may write membership rows"

key-files:
  created:
    - supabase/migrations/078_project_members.sql
    - __tests__/migration-078.test.ts
    - lib/vault/membership.ts
    - lib/vault/membership.test.ts
    - .planning/phases/21-cross-account-collaboration-sheet-sync/21-RLS-SMOKE-CHECKLIST.md
  modified: []

key-decisions:
  - "Editor/co-owner write scope: RLS permits row-level writes for co-owner/editor across all five tables, but the app/api/vault/** ownership-check API-route audit (rewriting .eq('user_id', user.id) checks to project-membership) is DEFERRED to a later phase — v1 functional edit affordances ship owner-path only"
  - "Guest-list management API is DEFERRED — no app/api/vault/[projectId]/members/route.ts in this phase; the only membership write path in v1 is the SECURITY DEFINER auto-membership trigger (Plan 21-02) plus this migration's owner backfill"

patterns-established:
  - "Pattern: any future RLS widening on a child table keyed to a parent's ownership must resolve through the parent's project_id + a SECURITY DEFINER helper, never the child row's own user_id column"

requirements-completed: ["①-access-model", "②-membership"]

coverage:
  - id: D1
    description: "lib/vault/membership.ts pure role-capability module (PROJECT_ROLE_VALUES, canViewProject, canEditProject, canManageGuests, canDeleteProject) matches the SPEC ② four-role capability matrix"
    requirement: "②-membership"
    verification:
      - kind: unit
        ref: "lib/vault/membership.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 078 (project_members table, SECURITY DEFINER helper pair, per-operation vault_projects policies, project-scoped child-table RLS rewrite, write lockdown, owner backfill, NOTIFY pgrst) authored and structurally verified"
    requirement: "①-access-model"
    verification:
      - kind: unit
        ref: "__tests__/migration-078.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 078 pushed live to the remote database (LOCAL=REMOTE through 078) after Phase 20's 076/077 confirmed live, PostgREST schema cache reloaded, and the full RLS access-matrix smoke (owner/co-owner/editor/viewer/non-member × SELECT/UPDATE/DELETE across vault_projects + 4 child tables, plus owner-membership backfill) passed"
    verification: []
    human_judgment: true
    rationale: "Live-DB schema push and RLS enforcement can only be proven against a real Postgres instance with real accounts — no automated live-RLS harness exists in this repo (RESEARCH Validation Architecture). Human operator ran the push and the 21-RLS-SMOKE-CHECKLIST.md matrix directly and reported: approved."

# Metrics
duration: checkpoint-spanning
completed: 2026-08-02
status: complete
---

# Phase 21 Plan 01: Project Members + RLS Rewrite Summary

**project_members guest-list table + SECURITY DEFINER helper pair widen vault_projects and its four child tables from owner-only to owner-or-member RLS, live-pushed and smoke-verified against real accounts**

## Performance

- **Duration:** checkpoint-spanning (Tasks 1-2 authored 2026-08-01; Task 3 human-gated push + smoke approved 2026-08-02)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments

- `lib/vault/membership.ts` — pure, no-I/O role-capability module (`PROJECT_ROLE_VALUES`, `PROJECT_ROLE_LABELS`, `canViewProject`, `canEditProject`, `canManageGuests`, `canDeleteProject`) matching the SPEC ② four-role matrix exactly; unrecognized roles degrade to `false` everywhere, never throw. TypeScript source of truth mirrored byte-for-byte by migration 078's SQL CHECK constraint.
- Migration 078 authored: `project_members` table (four roles, UNIQUE(project_id, user_id), write-locked via REVOKE INSERT/UPDATE/DELETE FROM authenticated/anon); `is_project_owner`/`project_member_role` SECURITY DEFINER helper pair (migration 064 shape — `SET search_path = ''`, EXECUTE revoked from PUBLIC/anon then granted to authenticated only) breaking the vault_projects ↔ project_members RLS cycle before it can recurse into a 42P17; `vault_projects` split into four per-operation policies (SELECT/UPDATE widen to owner-or-member, INSERT/DELETE stay owner-only); `tracks`/`vault_assets`/`vault_documents`/`tool_outputs` rewritten to resolve access through `project_id` via the same helpers rather than the row's own `user_id` (closing the RESEARCH Pitfall 1 sharing hole), with `vault_documents`/`tool_outputs` retaining a nullable-`project_id` fallback for standalone rows; owner-membership backfill for every pre-existing project; closes with `NOTIFY pgrst, 'reload schema'`.
- `__tests__/migration-078.test.ts` — 38 string-assertion structural tests mirroring `migration-064.test.ts`'s pattern (no live-RLS harness exists in this repo), all green.
- `21-RLS-SMOKE-CHECKLIST.md` — numbered manual access-matrix checklist (owner/co-owner/editor/viewer/non-member × SELECT/UPDATE/DELETE × vault_projects + 4 child tables) authored for the human-gated push.
- **Task 3 (human-gated checkpoint) — COMPLETE:** the human operator pushed migration 078 via `supabase db push` after confirming Phase 20's 076/077 were live, `supabase migration list` now shows LOCAL=REMOTE through 078, the PostgREST schema cache reloaded (fresh authenticated `project_members` query returns rows, not a schema-cache 404), and the full RLS access-matrix smoke from `21-RLS-SMOKE-CHECKLIST.md` passed against real accounts. Operator response: **"approved."**

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure role-helper module lib/vault/membership.ts (RED→GREEN)** - `c6dddba` (test)
2. **Task 2: Author migration 078 + string-assertion test + RLS smoke checklist** - `246e843` (feat)
3. **Task 3: Human-gated push of migration 078 + live RLS access-matrix smoke** - checkpoint, no code commit (human-executed live-DB action, approved 2026-08-02)

**Plan metadata:** this commit (docs: complete plan)

_Note: Task 1 is TDD-style (RED test file + GREEN implementation landed together in one commit per the plan's file grouping)._

## Files Created/Modified

- `lib/vault/membership.ts` - Pure role-capability predicates (canView/canEdit/canManageGuests/canDeleteProject) over the four-role vocabulary
- `lib/vault/membership.test.ts` - RED→GREEN tests asserting the SPEC ② capability matrix
- `supabase/migrations/078_project_members.sql` - project_members table, SECURITY DEFINER helper pair, per-operation vault_projects policies, project-scoped child-table RLS rewrite, write lockdown, owner backfill
- `__tests__/migration-078.test.ts` - 38 structural string-assertion tests over the migration SQL
- `.planning/phases/21-cross-account-collaboration-sheet-sync/21-RLS-SMOKE-CHECKLIST.md` - Manual access-matrix checklist used for the live human smoke (all cells passed)

## Decisions Made

- **Editor/co-owner write scope (RESEARCH Pitfall 4 / Open Q1, Assumption A2):** migration 078's RLS *permits* co-owner/editor row-level writes across all five tables (correct, forward-compatible data model). The `app/api/vault/**` ownership-check audit (rewriting every `.eq('user_id', user.id)` gate to project-membership) is explicitly DEFERRED — not in this phase. In v1, functional project-edit affordances ship owner-path only; editor write stays RLS-permitted-but-route-unexercised until a later phase builds the editor edit surface. **A follow-up task/phase exists for this editor-route column audit** — do not assume any `app/api/vault/**` route already honors co-owner/editor membership; each route must be individually reviewed and updated before editor/co-owner writes are reachable end-to-end.
- **Guest-list management API DEFERRED:** no `app/api/vault/[projectId]/members/route.ts` in this phase (consistent with CONTEXT's "rich co-owner/editor promotion UX deferred"). The only membership write path in v1 is the SECURITY DEFINER auto-membership trigger (Plan 21-02) plus this migration's owner backfill; all authenticated/anon writes on `project_members` are REVOKEd — mitigates the guest-list EoP threat (T-21-06) by absence of a client write path.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were authored and committed in a prior session; this continuation session's sole job was finalizing Task 3 (verifying the human operator's live push + RLS smoke approval) and closing out the plan. No code was rewritten; no live-DB command was run by this executor.

## Issues Encountered

None. The human-gated checkpoint resolved cleanly: Phase 20's 076/077 were confirmed live first (per the plan's required sequencing, RESEARCH Pitfall 6), migration 078 pushed via Codex, `supabase migration list` confirmed LOCAL=REMOTE through 078, the PostgREST schema cache reloaded, and every cell of the RLS access-matrix smoke checklist passed.

## User Setup Required

None further — the only external action this plan required (the human-gated `supabase db push` of migration 078 plus the live RLS smoke matrix) has already been completed and approved by the operator.

## Next Phase Readiness

- The `project_members` guest-list table and its recursion-safe SECURITY DEFINER helper pair are live in production, unblocking Plan 21-02's auto-membership trigger (migration 079) and every downstream Phase 21 plan that depends on multi-account project visibility.
- `lib/vault/membership.ts` is the canonical TS role-capability surface for any UI (guest-list management, role badges) built in later Phase 21 plans.
- **Carried-forward gap, not closed by this plan:** the `app/api/vault/**` route-level ownership-check audit (swapping `.eq('user_id', user.id)` gates for project-membership checks) remains outstanding. Editor/co-owner writes are RLS-permitted at the database layer today but not yet reachable through any API route — a later phase/plan must perform that audit before editor/co-owner functional editing ships end-to-end.
- Guest-list management (inviting/removing members via an API route) remains unbuilt; Plan 21-02's auto-membership trigger is the only planned membership-write path so far.

---
*Phase: 21-cross-account-collaboration-sheet-sync*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created files found on disk (lib/vault/membership.ts, lib/vault/membership.test.ts, supabase/migrations/078_project_members.sql, __tests__/migration-078.test.ts, 21-RLS-SMOKE-CHECKLIST.md, 21-01-SUMMARY.md). Both prior task commits (c6dddba, 246e843) confirmed present in git log. Test suites `lib/vault/membership.test.ts` and `__tests__/migration-078.test.ts` re-run green (44/44 tests).
