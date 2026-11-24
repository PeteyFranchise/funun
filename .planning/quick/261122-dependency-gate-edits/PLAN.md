# Dependency Gate Edits

## Objective

Apply the repository owner's approved dependency-audit policy change and replace the expired
`braces` deferral with a one-month, explicitly bounded `zod` migration deferral.

## Scope

- Remove the separate production-dependency moderate audit command from CI and document the policy
  history and new single-authority model.
- Delete the expired, stale `braces` deferral.
- Add the owner-approved `zod` deferral through 2026-12-21 with an accurate risk statement.

## Files expected to change

- `.github/workflows/quality.yml`
- `scripts/audit-gate.ts`
- `scripts/audit-gate.test.ts`
- `.claude/CLAUDE.md`
- `.planning/todos/pending/2026-11-21-zod-4-migration-deferral-expires.md`
- `.planning/quick/261122-dependency-gate-edits/PLAN.md`
- `.planning/quick/261122-dependency-gate-edits/SUMMARY.md`

## Validation plan

Run `npm ci`, `npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`,
`npm run marketing:verify`, `npm test -- --runInBand`, and `npm run audit:gate`. Confirm the branch
diff and worktree status afterward.

## Risks and coordination

- This is an owner-approved loosening from moderate-or-higher failures for production dependencies
  to one high-or-higher gate with dated deferrals.
- The existing documentation and drift tests intentionally lock the old policy; update them to lock
  the approved single-authority policy instead.
- Do not modify migrations, the unrelated `phase46-finding-handoff` worktree, or dependency versions
  beyond commit `d1d5ff03`.
- The referenced Zod migration todo is not present on this branch's base. Carry the already-written
  tracker from commit `5e416157` so the expiring exception and its scheduled follow-up land together.
