---
phase: 38-member-organization-team-workspaces
plan: 12
subsystem: api
tags: [supabase, rls, workspaces, catalogue, permissions, jest]

requires:
  - phase: 38-member-organization-team-workspaces
    provides: "38-09's resolveEffectivePermissions/assertMayExercise use-time authority, 38-07's roster relationship state machine, 38-10/38-11's live workspace_attachments schema and workspace_project_permission() RLS policy"
provides:
  - "loadWorkspaceCatalogue/summariseCatalogue — a permission-shaped query over live workspace_attachments, never a copy of vault_projects"
  - "POST/GET/DELETE /api/workspaces/[workspaceId]/attachments — attach against an accepted/live relationship covering the project's custodian, list via the catalogue, detach by custodian or workspace owner/admin"
  - "POST /api/workspaces/[workspaceId]/projects — a workspace-created project born held by the subject Member, attached immediately, diaried via workspace_audit_log"
affects: [38-13, workspace-catalogue-ui, appears-on-shelf]

tech-stack:
  added: []
  patterns:
    - "Field-level exposure (fields.* keys) resolved exclusively through resolveEffectivePermissions per project, never by reading workspace_grants directly"
    - "Row-level access resolved by letting the RLS-scoped client's nested embed silently drop a project the caller's grant does not cover (null nested key), rather than an app-layer WHERE"

key-files:
  created:
    - lib/workspaces/catalogue.ts
    - lib/workspaces/catalogue.test.ts
    - app/api/workspaces/[workspaceId]/attachments/route.ts
    - app/api/workspaces/[workspaceId]/projects/route.ts
  modified: []

key-decisions:
  - "Field data for `fields.metadata` covers Metadata Studio-shaped fields (genre, label, publisher, C/P lines, copyright year, primary language, contact info); `fields.privateRightsIdentifiers` covers the project-level UPC. Both are new, plan-authored groupings — no existing 'metadata bundle' type existed to reuse."
  - "vault_projects has no dedicated diary table of its own (unlike works.work_diary_events). workspace_audit_log via logWorkspaceAction is the diary of record for D-24's 'diary recording who created it' — confirmed via read_first and grep that no vault_projects-scoped diary mechanism exists anywhere in the codebase."
  - "summariseCatalogue's readiness bands (low <40, medium 40-79, high >=80) are a display-only convenience local to this summary — not wired to lib/vault/readiness.ts's authoritative item-level scoring."

requirements-completed: [WS-09, WS-10]

coverage:
  - id: D1
    description: "loadWorkspaceCatalogue returns one entry per live attachment, resolves field exposure exclusively through resolveEffectivePermissions, and never returns a URL/storage path at any permission level"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "lib/workspaces/catalogue.test.ts (15 tests, including the D-26 identical-shape test and the no-URL-shaped-value test)"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST/DELETE /api/workspaces/[workspaceId]/attachments enforces the three attach preconditions and D-25's sever-only detach, permitting either the custodian or a workspace owner/admin to detach"
    requirement: "WS-09"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npx next lint --file app/api/workspaces/[workspaceId]/attachments/route.ts"
        status: pass
    human_judgment: true
    rationale: "The three-precondition attach gate and the dual-authorization detach path are structural/security-critical branches best confirmed by a human reviewer against the live schema before this route is exercised against real roster relationships — no integration test harness against a live Supabase instance exists in this repo's Jest suite."
  - id: D3
    description: "POST /api/workspaces/[workspaceId]/projects creates a vault_projects row held by the subject Member, attaches it in the same handler, and logs the creation with permissionReliedOn populated"
    requirement: "WS-10"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit && npx next lint --file app/api/workspaces/[workspaceId]/projects/route.ts"
        status: pass
    human_judgment: true
    rationale: "The service-client custody write (user_id set to someone other than the caller) is the single highest-risk line in this plan and warrants human confirmation against the live schema before use, matching the plan's own threat register (T-38-12-06/08)."

duration: ~50min
completed: 2026-09-06
status: complete
---

# Phase 38 Plan 12: Project Attachment, Catalogue Query, Workspace-Created Projects Summary

**Workspace catalogue as a permission-shaped query over live `workspace_attachments` rows, plus attach/detach and workspace-created-project routes that never copy, fork, or orphan a project.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-06
- **Tasks:** 3
- **Files modified:** 4 (all new)

## Accomplishments

- `lib/workspaces/catalogue.ts` — `loadWorkspaceCatalogue` reads live `workspace_attachments` joined to `vault_projects` through the RLS-scoped client, so migration 186's `workspace_project_permission()` policy is the row filter (a project the caller's grant does not cover comes back as a `null` nested embed, never an app-layer `WHERE`). Field-level exposure (`fields.metadata`, `fields.privateRightsIdentifiers`) is resolved exclusively via `resolveEffectivePermissions` — the module never reads `workspace_grants` directly, and no entry at any permission level carries a URL, storage path, or signable identifier. `summariseCatalogue` counts by type and readiness band per call, documented as never merging across workspaces.
- `app/api/workspaces/[workspaceId]/attachments/route.ts` — `POST` attaches a project only after three independently-refused preconditions (relationship belongs to this workspace; relationship is accepted and live per D-05; project's current custodian equals the relationship's Member); `GET` returns the catalogue through the RLS-scoped client; `DELETE` sets `detached_at`/`detached_by` on the live row only (never deletes it, never touches the project or its tracks/assets/documents/tool_outputs), permitting either the project's own custodian or a workspace owner/admin.
- `app/api/workspaces/[workspaceId]/projects/route.ts` — a workspace-created project is inserted through the service client with `user_id` set to the relationship's Member (never the caller), gated by an accepted/live relationship and `assertMayExercise('edit_metadata')` (operational tier, D-21), attached in the same handler (no orphan window, D-24), and logged via `logWorkspaceAction` with `permissionReliedOn` populated — the append-only diary of record for a table that has no dedicated diary table of its own.

## Task Commits

1. **Task 1: Workspace catalogue reader — a query, never a copy** - `e14fb30e` (feat, tdd)
2. **Task 2: Attachment and detachment route** - `1294e9c1` (feat)
3. **Task 3: Workspace-created projects, born held by the subject Member** - `07796e98` (feat)

**Plan metadata:** committed with this SUMMARY (see final commit in orchestrator's phase-level history)

## Files Created/Modified

- `lib/workspaces/catalogue.ts` - `loadWorkspaceCatalogue`, `summariseCatalogue`, `WorkspaceCatalogueEntry` type
- `lib/workspaces/catalogue.test.ts` - 15 tests covering every behavior bullet, including a named D-26 test
- `app/api/workspaces/[workspaceId]/attachments/route.ts` - `POST`/`GET`/`DELETE` attach, list, detach
- `app/api/workspaces/[workspaceId]/projects/route.ts` - `POST` workspace-created project

## Decisions Made

- `fields.metadata` groups Metadata Studio-shaped project fields (genre, label, publisher, C/P lines, copyright year, primary language, contact info); `fields.privateRightsIdentifiers` currently exposes only the project-level UPC (no per-project ISRC exists — ISRCs are per-track and out of this plan's scope). Both groupings are new and plan-authored; no existing type matched exactly.
- Confirmed via `read_first` and a repo-wide grep that `vault_projects` has no dedicated diary/activity table (unlike `works.work_diary_events`). `workspace_audit_log`, written through `logWorkspaceAction`, is treated as the diary of record for D-24's "diary recording who created it" for this table — documented inline in the route with a comment explaining the substitution.
- `summariseCatalogue`'s readiness bands (`low` &lt;40, `medium` 40-79, `high` &gt;=80) are a local, display-only convenience with no gating meaning; they are independent of `lib/vault/readiness.ts`'s authoritative item-level scoring, which this plan does not touch.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues surfaced during execution beyond the flagged acceptance-criteria mismatches below (which are not code defects).

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None — plan executed as written, subject to the two flagged acceptance-criteria formulations below (per the acceptance-criteria sanity rule).

## Flagged Acceptance Criteria (sanity rule — not contorted, not fixed by renaming)

Two grep-based acceptance criteria in this plan are FILE-WIDE text searches that do not distinguish which *handler* or which *insert object* a match falls in, while their prose is scoped to one handler or one object specifically. In both cases the literal grep command returns a nonzero count against fully idiomatic, plan-required code, and no contortion (aliasing, renaming, quote-style tricks) was applied to force a zero count — per the acceptance-criteria sanity rule.

**1. Task 2 acceptance bullet:**
> "The DELETE handler writes only to `workspace_attachments`; `grep -cE "from\('(vault_projects|tracks|vault_assets|vault_documents|tool_outputs)'\)" "app/api/workspaces/[workspaceId]/attachments/route.ts"` returns 0 for any write call."

Actual count: **1** (not 0). The single match is `POST`'s `.from('vault_projects').select('id, user_id')` — a **read**, required by this same task's own `<action>` text ("confirm... the project's current `user_id` equals the relationship's `member_user_id`", precondition 3). It is not a write, and it is not inside the `DELETE` handler. Verified directly: the `DELETE` handler's only mutating call is `.update(...)` on `workspace_attachments`; it contains zero calls naming `vault_projects`, `tracks`, `vault_assets`, `vault_documents`, or `tool_outputs` at all. The prose intent ("the DELETE handler writes only to workspace_attachments") is satisfied; the grep formulation, being file-wide rather than DELETE-scoped, cannot distinguish that from POST's unrelated, required read.

**2. Task 3 acceptance bullet:**
> "The file writes no workspace identifier onto the project row: `grep -ci "owner_workspace_id\|workspace_id:" "app/api/workspaces/[workspaceId]/projects/route.ts"` returns 0 for the project insert object."

Actual count: **2** (not 0), at lines 41 and 151. Line 41 is a TypeScript type field declaration (`workspace_id: string` on the `RosterRelationshipRow` type — not an insert at all). Line 151 is `workspace_id: workspaceId,` inside the **`workspace_attachments`** insert object — required by this same task's own `<action>` text ("Immediately create the attachment row linking the workspace to the new project"). Verified directly: the `vault_projects` insert object itself (`{ user_id, title, type, release_date, genre, status, vault_readiness_score }`) contains no `workspace_id` or `owner_workspace_id` key of any kind. The prose intent (no workspace identifier on the *project row*) is satisfied; the grep formulation, being file-wide rather than scoped to the project-insert object literal, cannot distinguish that from the attachment insert's required, unrelated `workspace_id`.

Both mismatches are pre-existing ambiguities in the plan's own acceptance-criteria phrasing (grep commands written before the surrounding prose's precise scope was pinned down), not defects introduced by this execution. No code change is warranted; flagging per the acceptance-criteria sanity rule.

## Issues Encountered

None beyond the flagged acceptance criteria above.

## User Setup Required

None — no external service configuration required. No new migration in this plan (migrations 182-186 are already live).

## Next Phase Readiness

- `lib/workspaces/catalogue.ts` is ready for 38-13's "Appears on" shelf and any future workspace catalogue UI to consume directly.
- The attachment and workspace-created-project routes are ready for a UI layer; no blockers.
- 38-13 (custody transfer, Appears-on shelf, `app/(artist)/vault/page.tsx`) was explicitly out of scope for this plan and untouched.

---
*Phase: 38-member-organization-team-workspaces*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: `lib/workspaces/catalogue.ts`
- FOUND: `lib/workspaces/catalogue.test.ts`
- FOUND: `app/api/workspaces/[workspaceId]/attachments/route.ts`
- FOUND: `app/api/workspaces/[workspaceId]/projects/route.ts`
- FOUND commit `e14fb30e` (Task 1)
- FOUND commit `1294e9c1` (Task 2)
- FOUND commit `07796e98` (Task 3)
