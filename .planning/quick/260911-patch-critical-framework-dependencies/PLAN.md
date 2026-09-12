# Patch Critical Framework Dependencies — Plan

## Objective

Resolve audit finding C2 by moving Funūn's Next.js and Sharp production dependency graph onto patched, compatible releases without introducing a major-version migration.

## Scope

- Confirm the supported patched releases for the current Next.js 15.5 maintenance line and Sharp 0.35 line.
- Pin Next.js and the Sharp override to patched versions and regenerate `package-lock.json`.
- Keep React 18 and the existing Next.js 15 application architecture unchanged.
- Re-run production and full dependency audits and the complete application verification suite.
- Update the saved Beta security audit with the observed remediation status.
- Do not commit, push, deploy, or change production in this task.

## Expected files

- `package.json`
- `package-lock.json`
- `.planning/security/2026-09-10-beta-adversarial-security-audit.md`
- This task's `SUMMARY.md`

## Validation

- Confirm installed versions with `npm ls`.
- `npm audit --omit=dev`
- `npm audit`
- `npm run typecheck`
- `npm run lint`
- Full Jest suite
- `npm run build`
- `git diff --check`

## Risks and coordination

- Preserve all uncommitted C1 invitation-claim remediation and audit files already in the worktree.
- Avoid a Next.js 16 or React 19 migration in this security patch.
- The package override is security-sensitive and must be exact rather than a floating range.
