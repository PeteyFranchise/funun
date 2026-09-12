# Auth Health production readiness

## Scope

- Keep migration 218 human-gated and unapplied.
- Move 30-day retention from best-effort event writes into a service-only database function invoked by a protected scheduled route.
- Add read-only pre-apply, post-apply, and failed-apply probes for migration 218.
- Extend the automated migration verifier to cover migration 218 and its safety harness.
- Add Auth Health filters for time period, failure type, and workspace intent.
- Add a copy control for privacy-safe support correlation references.
- Record production UI and operational checks as later human-testing TODOs.
- Diagnose and resolve any production-bundle stall before the package is considered deployable.

## Assumptions

- Auth diagnostic events remain allowlisted and contain no user ID, email, IP address, user agent, URL, provider error, credential, or token.
- The application may deploy before migration 218; the cleanup route must therefore treat a missing RPC as inactive rather than as an operational failure.
- Only `service_role` may read or insert diagnostic rows or execute retention cleanup.
- No migration is applied, repaired, pushed, or otherwise written to production in this build.

## Verification

- Run focused unit tests for Auth Health filtering, storage, the cleanup route, and migration 218.
- Run the automated beta-security migration verifier.
- Run TypeScript checking and linting.
- Run the full Jest suite if focused verification passes.
- Require `npm run build` to complete; use an isolated debug build to distinguish application code from build-tool instrumentation or stale output state.
