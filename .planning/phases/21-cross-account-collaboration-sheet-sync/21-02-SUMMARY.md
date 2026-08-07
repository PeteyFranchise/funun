---
phase: 21-cross-account-collaboration-sheet-sync
plan: 02
subsystem: database
tags: [supabase, postgres, security-definer, trigger, vault, split-sheets, migrations]

# Dependency graph
requires:
  - phase: 21-cross-account-collaboration-sheet-sync
    provides: "21-01: project_members table + is_project_owner/project_member_role SECURITY DEFINER helpers, pushed live"
provides:
  - "public.sync_project_membership_for_sheet() SECURITY DEFINER trigger — auto-grants a viewer project_members row when a claimed collaborator is a writer on a project-linked, non-draft split sheet"
  - "Triggers attached at all three fire sites (split_sheet_parties insert/update, split_sheets status/link change, collaborators.claimed_by change) covering every event ordering from one function"
affects: [21-03, 21-05, cross-account-collaboration, sheet-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER trigger keyed strictly off collaborators.claimed_by (the only live verified-identity signal) — never the dead split_sheet_parties.user_id column, never a typed email"
    - "Draft-gate mirrors P18-11: a still-draft linked sheet grants zero project visibility; membership only appears once the sheet leaves draft"
    - "ON CONFLICT (project_id, user_id) DO NOTHING makes the trigger idempotent across any of the three event orderings"

key-files:
  created:
    - supabase/migrations/079_project_membership_auto.sql
    - __tests__/migration-079.test.ts
  modified: []

key-decisions:
  - "Grant boundary = 'sheet has left draft' (RESEARCH Assumption A1) — a writer gains project visibility only once the initiator has actually shared the sheet, matching the existing P18-11 drafts-invisible-to-non-initiators rule"
  - "Single SECURITY DEFINER trigger (not app-layer coordination) handles all three event orderings in one place, mirroring migration 066's precedent"
  - "identity-dedupe-claim enforced concretely here: membership keys off the verified claimed_by CLAIM signal only; roster dedupe (per-owner, typed email, Phase 18/19) is never a membership input"

requirements-completed: ["②-membership", "identity-dedupe-claim"]

coverage:
  - id: D1
    description: "sync_project_membership_for_sheet() authored: SECURITY DEFINER, SET search_path = '', fully-qualified public. refs; resolves party -> collaborators.claimed_by; inserts project_members(role='viewer') with ON CONFLICT DO NOTHING; gated on vault_project_id IS NOT NULL AND status != 'draft'; attached to split_sheet_parties/split_sheets/collaborators"
    requirement: "②-membership"
    verification:
      - kind: unit
        ref: "__tests__/migration-079.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 079 pushed live to the remote database (LOCAL=REMOTE through 079) after 077/078 confirmed live; PostgREST schema cache recognizes project_members (200 OK read)"
    verification: []
    human_judgment: true
    rationale: "Live-DB push can only be proven against a real Postgres/PostgREST instance. Human operator pushed 077/078/079 together in order and confirmed migration-list parity + schema-cache recognition. Response: approved."
  - id: D3
    description: "Behavioral RLS/auto-membership access-matrix smoke (three event orderings + draft-gate + idempotency, against real second accounts) per the plan's how-to-verify steps 3-4"
    verification: []
    human_judgment: true
    rationale: "OUTSTANDING — not yet executed. The push was verified at the migration + PostgREST schema-cache level only. The full behavioral smoke (claim-then-party, party-then-claim, draft-gate, idempotent re-fire) still needs to run against real second accounts before this is claimed fully proven in production."

# Metrics
duration: checkpoint-spanning
completed: 2026-08-02
status: complete
---

# Phase 21 Plan 02: Auto-Membership Trigger (Migration 079) Summary

**SECURITY DEFINER trigger that auto-grants a viewer `project_members` row the moment a split-sheet writer is both a claimed Funūn account holder and named on a project-linked, non-draft sheet — pushed live and schema-verified; full behavioral smoke against real second accounts still outstanding**

## Performance

- **Duration:** checkpoint-spanning (Tasks 1-2 authored 2026-08-02; Task 3 human-gated push approved 2026-08-02)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 2

## Accomplishments

- `__tests__/migration-079.test.ts` — 19 string-assertion structural tests (RED, then GREEN against the authored migration) mirroring the `migration-064.test.ts`/`migration-078.test.ts` pattern: asserts `LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''` with fully-qualified `public.` references, a `collaborators.claimed_by` resolution path, a `project_members` insert with the literal role `'viewer'` and an `ON CONFLICT ... DO NOTHING` guard, the linked+non-draft gate, triggers attached to all three tables, and a closing `NOTIFY pgrst`.
- `supabase/migrations/079_project_membership_auto.sql` authored: `public.sync_project_membership_for_sheet()` resolves each affected sheet's parties through `collaborator_id -> collaborators.claimed_by`, and — only when `vault_project_id IS NOT NULL AND status != 'draft'` — inserts `project_members(project_id, user_id, role='viewer', added_by=NULL)` with `ON CONFLICT (project_id, user_id) DO NOTHING`. Never reads the dead `split_sheet_parties.user_id` column. Branches on `TG_TABLE_NAME` to cover all three fire sites from one function (mirrors migration 066's multi-ordering precedent): `AFTER INSERT OR UPDATE ON split_sheet_parties`, `AFTER UPDATE OF status, vault_project_id ON split_sheets`, `AFTER UPDATE OF claimed_by ON collaborators` (fans out to every linked, non-draft sheet the newly-claimed collaborator is a party on). Never grants any role but `'viewer'`. Closes with `NOTIFY pgrst, 'reload schema'`.
- **Task 3 (human-gated checkpoint) — COMPLETE at the push/schema level:** the human operator pushed migrations 077, 078, and 079 together in order via Codex. `supabase migration list` confirms LOCAL=REMOTE through 079. PostgREST recognizes the new `project_members` table (a fresh authenticated read returns 200 OK, not a schema-cache 404). Operator response: **"approved" (push confirmed live)**.

## Outstanding: Behavioral Smoke NOT Yet Run

The plan's Task 3 `how-to-verify` steps 3-4 (the three event orderings — claim-then-party, party-then-claim, draft-gate — plus the idempotency re-fire check, all against real second accounts) were **not executed** in this session. Only the push + PostgREST schema-cache recognition were verified live. This is recorded honestly, not silently marked as passed:

- (a) Claim-then-party: claimed collaborator added as a party to a linked, non-draft sheet -> viewer row appears — **NOT YET SMOKED**
- (b) Party-then-claim: unclaimed party on a linked, sent sheet, then that person claims -> viewer row appears — **NOT YET SMOKED**
- (c) Draft gate: claimed collaborator on a still-DRAFT linked sheet -> NO membership — **NOT YET SMOKED**
- (d) Idempotency: re-firing (edit + re-save) does not duplicate rows — **NOT YET SMOKED**

This gap should be closed with a real second-account smoke pass before the phase is treated as fully proven in production (see Next Phase Readiness).

## Task Commits

Each task was committed atomically (prior session):

1. **Task 1: String-assertion test `__tests__/migration-079.test.ts` (RED)** - `9b17d8c` (test)
2. **Task 2: Author migration 079 auto-membership SECURITY DEFINER trigger (GREEN)** - `2ce4612` (feat)
3. **Task 3: Human-gated push of migration 079 + auto-membership smoke** - checkpoint, no code commit (human-executed live-DB push, approved 2026-08-02; behavioral smoke portion outstanding)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `__tests__/migration-079.test.ts` - 19 structural string-assertion tests over the migration SQL (RED then GREEN)
- `supabase/migrations/079_project_membership_auto.sql` - Auto-membership SECURITY DEFINER trigger function + three trigger attachments

## Decisions Made

- **Trigger, not app-layer (RESEARCH primary recommendation):** a single SECURITY DEFINER trigger handles all three event orderings in one place, avoiding fragile app-layer coordination across `claim_collaborators()`, the sheet PATCH route, and the send-for-approval route.
- **Grant boundary = "sheet has left draft" (RESEARCH Assumption A1, adopted explicitly):** a writer gains project visibility only once the initiator has actually shared the sheet — never while it is a private draft — matching the existing P18-11 rule.
- **identity-dedupe-claim coverage:** this plan is where the distinction is enforced concretely — membership (cross-account access) keys off the CLAIM signal (verified `claimed_by`), while roster dedupe (per-owner, typed email; already shipped Phase 18/19) is untouched and never a membership input.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 were authored and committed in a prior session; this continuation session's sole job was finalizing Task 3 (recording the human operator's live push + schema-cache verification) and closing out the plan. No code was rewritten; no live-DB command was run by this executor.

## Issues Encountered

None at the push/schema level. The human-gated checkpoint resolved cleanly at that layer: migrations 077/078/079 were pushed together in order, `supabase migration list` confirmed LOCAL=REMOTE through 079, and PostgREST recognizes `project_members`. The one open item is the behavioral smoke (three orderings + draft-gate + idempotency) described above under "Outstanding."

## User Setup Required

- **Outstanding human action:** run the behavioral auto-membership smoke (three event orderings + draft-gate + idempotency, per Task 3's `how-to-verify` steps 3-4) against real second accounts. This was not performed in this session — only the push and PostgREST schema-cache recognition were confirmed.

## Next Phase Readiness

- Migration 079's trigger is live in production and schema-recognized, unblocking downstream Phase 21 plans (21-03's shared lane and 21-05's dashboard action feed) that assume auto-membership can populate `project_members` for claimed collaborators.
- **Carried-forward gap, not closed by this plan:** the full behavioral RLS/auto-membership access-matrix smoke (three orderings + draft-gate + idempotency against real second accounts) remains outstanding. A future session or the phase verifier should execute it before this plan's D3 coverage item is upgraded from "outstanding" to "pass."

---
*Phase: 21-cross-account-collaboration-sheet-sync*
*Completed: 2026-08-02*

## Self-Check: PASSED

Both created files found on disk (`__tests__/migration-079.test.ts`, `supabase/migrations/079_project_membership_auto.sql`). Both prior task commits (`9b17d8c`, `2ce4612`) confirmed present in git log. `npx jest __tests__/migration-079.test.ts` re-run green (19/19 tests).
