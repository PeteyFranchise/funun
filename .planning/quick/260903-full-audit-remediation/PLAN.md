# Full Audit Remediation — Plan

## Objective

Remediate every confirmed finding in `.planning/security/2026-09-03-full-repository-audit.md` without disturbing the user's existing Writer's Room, Ideas, Global Capture, Lyric Lift, or navigation work.

## Scope

1. Correct DocuSeal and Resend webhook parsing, idempotency, persistence, and retry behavior.
2. Add fix-forward database hardening for Writer's Room authorization, split-sheet transactions, Ideas provenance/atomic workflows, and Selects aggregation/retention controls.
3. Move upload authentication ahead of body parsing where technically possible, make track replacement recoverable, and close avatar/cover object-lifecycle gaps.
4. Add durable AI usage admission controls, timeouts, and truthful persistence responses across the audited provider routes.
5. Remove the unsafe toast HTML path, bind access helpers to the current user where safe, clear strict TypeScript dead-code errors, and remediate vulnerable dependencies without an untested forced major upgrade.
6. Add focused regression tests for every changed security or consistency boundary, then run the complete validation suite.

## Files Expected To Change

- DocuSeal/Resend webhook parsers, routes, provider helpers, and tests.
- Writer's Room, split-sheet, Ideas, Selects, upload, AI, and storage routes/helpers cited by the audit.
- New fix-forward Supabase migration(s); applied migration files 169-171 will not be rewritten.
- Selects player rendering and strict-TypeScript cleanup files.
- `package.json` / `package-lock.json` only for verified compatible dependency remediation.
- Focused route, migration, webhook, storage, AI-budget, and UI tests.
- This quick-task `SUMMARY.md` after validation.

## Validation Plan

- Focused Jest suites after each remediation group.
- Migration contract tests for every fix-forward SQL change.
- `npm run typecheck`
- `npm run typecheck:strict`
- `npm run lint`
- `npx jest --runInBand`
- `npm audit --omit=dev --json`
- `git diff --check`
- Final `git status --short --branch` review proving unrelated user changes were preserved.

## Risks And Coordination Notes

- The worktree is already dirty with user-owned application work. Edits will be scoped and overlap inspected before each patch.
- Production migration state is unknown. All database remediation will use new fix-forward migration numbers.
- Webhook and rights workflows require atomicity and replay safety; a 2xx response will only follow durable acceptance or an idempotent completed state.
- AI quotas must remain usable for legitimate artists while failing closed for paid generation if durable admission cannot be recorded.
- Dependency updates will favor compatible patched transitive versions. A framework major upgrade will not be forced unless the existing application and tests demonstrate compatibility.

## GSD Workflow

Codex has access to the GSD orientation CLI but no native `/gsd-quick` execution surface. This plan is the repository-required manual quick-task fallback.
