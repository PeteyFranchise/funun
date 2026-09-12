# Privacy-Safe Authentication Diagnostics — Plan

## Objective

Make production authentication failures diagnosable without storing passwords,
tokens, raw provider errors, full email addresses, or other sensitive request
data. Provide authorized Funūn Team Members with a compact Auth Health view.

## Scope

- Define a small allowlisted auth event vocabulary and correlation-ID format.
- Emit sanitized lifecycle failures from browser auth surfaces through one
  authenticated-or-anonymous ingestion boundary.
- Store only event code, lifecycle stage, workspace intent, correlation ID,
  timestamp, and coarse runtime context.
- Apply fail-closed validation and abuse admission to public ingestion.
- Add a staff-authorized aggregate/read surface and admin Auth Health page.
- Add retention and database access controls in a human-gated migration
  candidate; do not apply it during this build.
- Verify, commit, push, and deploy application changes after local checks pass.

## Expected files

- `lib/auth/diagnostics.ts` and tests
- auth lifecycle pages/components/callback integration
- `app/api/auth/diagnostics/route.ts` and tests
- `app/api/admin/auth-health/route.ts` and tests
- `app/(admin)/admin/playbook/it/auth-health/page.tsx`
- admin navigation configuration
- one new human-gated migration candidate using the next verified ledger number
- planning summary and any rollout TODO

## Validation

- Focused diagnostics, authorization, validation, and lifecycle tests.
- Migration number collision check and structural security test.
- Strict TypeScript, lint, full Jest, production build, dependency audits.
- Explicit-path diff review and clean worktree after commits.

## Risks and boundaries

- No raw SDK error, email, credential, URL query, IP address, user-agent, or
  request body may be persisted.
- Anonymous ingestion must not become a general logging or database-write API.
- Staff reads require existing centralized staff authorization.
- Migration application and production smoke testing remain human-gated.
- Native Claude `/gsd-quick` is unavailable in Codex; this is the required
  manual GSD fallback.
