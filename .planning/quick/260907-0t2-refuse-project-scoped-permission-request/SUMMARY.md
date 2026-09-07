---
quick_id: 260907-0t2
slug: refuse-project-scoped-permission-request
date: 2026-09-07
type: quick
status: complete
files_modified:
  - lib/workspaces/request-service.ts
  - lib/workspaces/request-service.test.ts
  - app/api/workspaces/[workspaceId]/permission-requests/route.ts
  - app/api/workspaces/[workspaceId]/permission-requests/route.test.ts
  - .planning/phases/38.0.1-workspace-authorization-remediation/38.0.1-ORCHESTRATOR-NOTES.md
migrations_added: 0
---

# Refuse project-scoped permission requests

Closes item 4 of the Phase 38.0.1 orchestrator notes. The owner chose option 1
on 2026-09-07: refuse a project-scoped ask rather than accept one that can never
be rendered, approved, or re-asked.

## The dead end that is now closed

`createPermissionRequest` accepted a `projectId` and stored a project-scoped ask.
`app/api/settings/permissions/route.ts` deliberately omits such rows from the
Member view — correctly, because its group carries no project and flattening one
in would make the client issue a relationship-WIDE consent, broader than what was
actually asked. So the ask was accepted, stored, invisible to the Member, never
approvable, and migration 195's partial unique index on
`(relationship_id, permission, coalesce(project_id, ...)) WHERE state = 'pending'`
then blocked re-asking for that pair.

The API now refuses the input it cannot honour.

## Changes

**`lib/workspaces/request-service.ts`** — `createPermissionRequest` refuses a
non-null `projectId` with status 400 and the message:

> Per-project permission requests are not supported yet. Ask for this permission
> across the whole relationship instead.

The check sits with the other early refusals, after the structural-exclusion and
catalogue checks (preserving the D-42 "structural exclusion is checked FIRST and
refused BY NAME" ordering) and before the relationship is read, so a refused ask
performs no database work at all. A block comment records that the refusal is
deliberate and that what lifts it is the Member-facing surface being able to
render a per-project row on its own terms — plan 12's endpoint returning it and
plan 13's UI naming the project. The `projectId` parameter stays in the
signature: this is a temporary product limitation, not a shape change.

**`app/api/workspaces/[workspaceId]/permission-requests/route.ts`** — no logic
change. `projectId` is kept in the `.strict()` Zod schema on purpose, with a
comment saying why: dropping the key would give a caller a generic Zod
"unrecognized key" error instead of the service's explanation. The service is
the single source of the rule; the route neither restates nor rewords it.

**Tests.** `request-service.test.ts` gains four cases — a project-scoped ask is
refused 400 with the exact message and writes no request row, no grant row and
no audit row; the refusal happens before the relationship read (proved with a
relationship stub that throws if touched); `projectId: null` still creates; and
`projectId` omitted still creates. The pre-existing "names every inserted column
explicitly" case was passing `PROJECT_ID`, which is now a refused input, so it
was changed to a relationship-wide ask asserting `project_id: null`.
`route.test.ts` gains two cases — a POST carrying `projectId` returns 400 with
the service's message verbatim and inserts nothing, and a POST with
`projectId: null` still returns 201 with `project_id` null.

**`38.0.1-ORCHESTRATOR-NOTES.md`** — item 4 marked RESOLVED, recording the
owner's decision, the date, and that the column remains for future use. The
original finding is preserved beneath the resolution.

## Scope held

- **No migration added.** Migrations 186-195 are all applied in production. The
  `project_id` column and the partial unique index stay exactly as migration 195
  wrote them — they are the forward-compatible shape for when per-project asks
  are supported. No database CHECK was added.
- **Not treated as a security fix.** A permission request grants nothing and no
  authorization path reads that table, so an application-layer refusal is
  proportionate and sufficient. No defence-in-depth layers were added.
- **`app/api/settings/permissions/route.ts` untouched.** Its omission of
  project-scoped rows is correct and stays.
- No database connection of any kind was opened; no `supabase` CLI command was
  run. `npm run build` was not run.

## Verification

| Command | Result |
| --- | --- |
| `npx jest lib/workspaces/request-service.test.ts` | 1 suite passed, **40 tests passed**, 40 total |
| `npx jest "app/api/workspaces/\[workspaceId\]/permission-requests"` | 1 suite passed, **23 tests passed**, 23 total |
| `npx tsc --noEmit` | clean, exit 0 |

`createPermissionRequest` has exactly one caller in the codebase — the route —
confirmed by grep, so no other call site needed adjusting.

## Self-Check: PASSED

All five declared files exist and were modified; both test suites and the
typecheck pass as reported above.
