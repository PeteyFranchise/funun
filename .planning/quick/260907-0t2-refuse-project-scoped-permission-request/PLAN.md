---
quick_id: 260907-0t2
slug: refuse-project-scoped-permission-request
date: 2026-09-07
type: quick
files_modified:
  - lib/workspaces/request-service.ts
  - lib/workspaces/request-service.test.ts
  - app/api/workspaces/[workspaceId]/permission-requests/route.ts
  - app/api/workspaces/[workspaceId]/permission-requests/route.test.ts
  - .planning/phases/38.0.1-workspace-authorization-remediation/38.0.1-ORCHESTRATOR-NOTES.md
---

# Refuse project-scoped permission requests

## The decision (owner, 2026-09-07)

`createPermissionRequest` accepts a `projectId` and stores a project-scoped ask.
`app/api/settings/permissions/route.ts` (plan 12) deliberately OMITS project-scoped
rows from the Member view, because its group carries no project and flattening one
in would make the client issue a **relationship-wide** consent — broader than what
was actually asked for. That omission is correct and stays.

The combination is a dead end: such an ask is accepted, stored, invisible to the
Member, never approvable, and migration 195's partial unique index on
`(relationship_id, permission, COALESCE(project_id, ...)) WHERE state = 'pending'`
then blocks re-asking for that pair.

**Owner decision: refuse project-scoped asks for now.** Do not accept an ask that
cannot be rendered. This matches WSR-27 being explicitly "minimal".

## Scope — what this is NOT

- **No migration.** Migration 195 is already APPLIED in production. The
  `project_id` column stays exactly as it is: it is the forward-compatible shape
  for when the surface does support per-project asks, and dropping it would need a
  new migration for no benefit. We refuse at the application layer only.
- **Not a security fix.** A project-scoped ask grants nothing — it is a proposal
  object that no authorization path reads. This is a "do not accept input you
  cannot honour" correctness fix, so an application-layer refusal is proportionate.
  Do not add a database CHECK.
- Do not touch `app/api/settings/permissions/route.ts`. Its omission is correct.

## The change

**1. `lib/workspaces/request-service.ts` — `createPermissionRequest`.**

Refuse a non-null `projectId` with status 400 and a message that says why, in the
established voice of this file's other refusals. Put the check with the other
early refusals, near the structural-exclusion check. Keep the parameter in the
signature — this is a temporary product limitation, not a shape change.

Comment it so a future reader knows it is deliberate and what would lift it:
the Member-facing surface must be able to render a per-project row first
(plan 12's endpoint and plan 13's UI).

**2. The route — `app/api/workspaces/[workspaceId]/permission-requests/route.ts`.**

Keep `projectId` in the Zod schema so a caller sending it gets the explicit,
explanatory refusal from the service rather than a generic `.strict()` "unknown
key" Zod error. The service refusal is the single source of the rule; the route
just must not swallow or reword it.

Verify by test that a POST carrying a non-null `projectId` returns 400 with the
explanatory message, and that a POST with `projectId: null` or omitted still
succeeds exactly as before.

**3. Tests.** Cover in `request-service.test.ts`: a non-null `projectId` is
refused 400 and writes nothing; `null` and omitted both still create. In
`route.test.ts`: the 400 surfaces through the route with the service's message.

**4. `38.0.1-ORCHESTRATOR-NOTES.md`** — mark item 4 RESOLVED, record that the
owner chose option 1 on 2026-09-07 and that the column remains for future use.

## Constraints

- **Never** run `supabase db push`, `db reset`, `migration up`, or `db query`.
  Migrations 186-195 are ALL APPLIED in production; this task adds none.
- Do NOT run `npm run build` unless no dev server is running — but DO note that
  `tsc --noEmit` does not cover the `next build` lint step, which broke this
  phase's deploy once already.
- Never `git add -A`. Stage the five files by explicit path.

## Verification

- `npx jest lib/workspaces/request-service.test.ts` — report actual numbers.
- `npx jest "app/api/workspaces/\[workspaceId\]/permission-requests"` — note the
  escaped brackets; jest reads the argument as a regex and a bare `[workspaceId]`
  matches nothing.
- `npx tsc --noEmit` clean.

## Done when

A workspace asking for a project-scoped permission gets a clear 400 explaining
that per-project asks are not yet supported, instead of silently creating a row
nobody can ever approve.
