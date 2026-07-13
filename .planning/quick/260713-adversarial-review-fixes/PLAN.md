# Quick Plan: Adversarial Review Fixes

Date: 2026-07-13

## Scope

Fix the two highest-priority adversarial review findings:

- Document signing state must be earned by uploaded signed PDF evidence, or later by an e-sign webhook/provider evidence path.
- Public bearer-token routes must enforce one-time use atomically at the database mutation step.

## Tasks

1. Restrict document status patching so clients cannot set `signed` or `verified` through the generic document route without evidence.
2. Make split approval/counter, pitch accept/decline, and curator claim mutations update only rows still in their expected unused state.
3. Add focused Jest coverage for the document-state guard and atomic query predicates.
4. Run the relevant tests and the full suite if feasible.

## Verification

- `npm test -- --runInBand`
- Targeted tests for new route behavior.

