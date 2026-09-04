# Full Repository Security And Architecture Audit — Plan

## Outcome

Produce a strict, evidence-based audit of the current Funūn working tree and every available local/remote-tracking branch, prioritized by Critical, Medium, and Low severity, and save the report as a copy/paste handoff for the next Codex or Claude session.

## Scope

- Inventory the current branch, dirty working tree, local branches, remote-tracking refs, worktrees, runtime, routes, migrations, integrations, and tests.
- Fully audit the current `main` working tree across authentication, authorization, RLS/RPCs, secrets, uploads, webhooks, AI/provider boundaries, jobs, concurrency, performance, React state, and edge cases.
- Inspect each available branch delta non-destructively without switching branches or disturbing user-owned changes.
- Trace every confirmed finding through callers, shared access helpers, database policy/migration history, and tests before reporting it.
- Run the safe verification commands required by the repository audit skill.
- Write one repository handoff report; do not edit application code, tests, migrations, dependencies, or configuration.

## Assumptions And Limits

- “All branches” means all refs currently available in this checkout. Remote refs will not be fetched because the request did not ask to refresh remote state.
- Production database state, deployed environment variables, provider dashboards, and branches absent from local/remote-tracking refs are outside the inspectable scope.
- Existing uncommitted application changes belong to the user and will be preserved exactly.
- The repository exposes no runnable `gsd` command, so this file is the required manual GSD quick-task fallback.

## Verification

- `npm run typecheck`
- `npm run typecheck:strict`
- `npm run lint`
- `npx jest --runInBand`
- Git diff/status checks confirming only audit planning/report artifacts were added by this audit.
