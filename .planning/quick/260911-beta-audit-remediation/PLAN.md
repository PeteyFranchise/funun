# Beta Audit Remediation — Plan

## Objective

Resolve every remaining High and Medium finding in the 2026-09-10 Beta adversarial audit, in severity and dependency order, while preserving the completed C1/C2 work.

## Work sequence

1. Restore member sign-in first.
2. H1: atomic, idempotent Stripe Checkout creation and webhook reconciliation.
3. H2: atomic e-sign claim/mint/finalize lifecycle and reconciliation.
4. H3: durable AI spending, timeout, and concurrency admission for Playbook Ask.
5. H4: pre-parse upload admission and direct-to-storage migration for large payloads.
6. H5: durable social abuse limits and notification coalescing.
7. H6: atomic Playbook activation/incident mutations with audit history.
8. M1-M3: auth-before-parse, stable error envelopes, and strict Vault validation.
9. M4-M9: media verification, preview/status isolation, demo fail-safe, browser headers, Sentry value scrubbing, and durable earnings imports.
10. M10: strict TypeScript and development supply-chain baseline.

## Files expected to change

- Relevant API routes and domain libraries identified in the saved audit.
- New human-gated SQL migrations numbered only after checking the migration ledger and all planning candidates.
- Focused tests for every security invariant.
- `.planning/security/2026-09-10-beta-adversarial-security-audit.md`
- This task's `SUMMARY.md`.

## Validation

- Focused tests per finding.
- `npm audit --omit=dev` and full `npm audit`.
- `npm run typecheck` and `npm run typecheck:strict`.
- `npm run lint`.
- Full Jest suite.
- `npm run build`.
- Read-only post-apply verifiers for every database migration candidate.

## Risks and coordination

- This is a multi-release remediation program, not one safe production push.
- Database migrations remain human-gated.
- Payment and e-sign changes require sandbox/provider verification before production enablement.
- No commits, pushes, deployments, production settings, or production data changes unless separately authorized.
- Preserve the dirty worktree and stage only explicit paths if a later commit is requested.
