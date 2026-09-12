# CodeQL triage and beta branch gates

## Scope

- Triage the initial GitHub CodeQL default-setup findings against reachable Funūn code.
- Remediate confirmed clear-text credential logging and middleware request-origin trust.
- Repair the package lock so the existing Quality and security workflow can run.
- Re-run local quality checks and GitHub CodeQL.
- Classify only evidence-backed non-production or false-positive findings.
- Add a `main` ruleset only after required checks are demonstrably green.

## Safety constraints

- Do not apply database migrations or change production data.
- Do not weaken authentication, authorization, RLS, CSP, or secret handling.
- Do not dismiss a CodeQL alert without tracing its source and sink.
- Do not create a required-check rule while that check is failing.
- Keep automatic dependency merging disabled.

## Verification

- `npm ci`
- `npm run typecheck:strict`
- `npm run lint`
- `npm test -- --runInBand`
- `npm audit --omit=dev --audit-level=moderate`
- `npm audit --audit-level=high`
- GitHub Quality and security workflow passes on the resulting commit.
- GitHub CodeQL JavaScript/TypeScript analysis passes.
- Repository ruleset reports active enforcement on `main`.
