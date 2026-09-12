# Member Sign-In Outage — Debug Plan

## Objective

Identify and fix the reason production members cannot sign into their Member Accounts, without weakening account/workspace isolation or the invitation security remediation currently in the worktree.

## Diagnostic order

1. Inspect deployed commit, production runtime logs, and project linkage.
2. Trace sign-in, middleware, post-sign-in routing, and account-context enforcement locally.
3. Reproduce using non-sensitive HTTP/browser observations where possible.
4. Establish a specific root cause before editing.

## Expected files

Unknown until the root cause is established. This plan and `SUMMARY.md` will record the evidence and final fix.

## Validation

- Focused regression tests for the failing boundary.
- Existing account/session-identity tests.
- Typecheck, lint, full tests, and production build.
- Production smoke test only after an explicitly approved deployment.

## Risks and coordination

- Do not log, expose, or request member passwords, session tokens, or service credentials.
- Do not apply migration 214, change production Auth settings, deploy, or alter production data without an explicit owner step.
- Preserve all uncommitted C1/C2 work.
