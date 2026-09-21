# Roster Identity Dedupe Review Plan

## Objective

Produce an evidence-based design for preventing one person from becoming multiple `collaborators` rows during Phase 41 member discovery, without exposing member email or allowing clients to choose `claimed_by`.

## Scope

- Verify current collaborator creation, email reconciliation, claim, archive, RLS, and duplicate-repair behavior.
- Inventory relational and non-relational references to `collaborators.id` that affect merge safety.
- Define the identity key, uniqueness constraints, merge/reuse semantics, concurrency boundary, archive behavior, and response-side leakage controls.
- Propose human-gated SQL only; do not create or apply a migration.
- Write the complete answer to `.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md`.

## Files Expected To Change

- `.planning/quick/260921-roster-identity-dedupe-review/PLAN.md`
- `.planning/quick/260921-roster-identity-dedupe-review/SUMMARY.md`
- `.planning/reviews/CODEX-RESPONSE-260921-roster-identity-dedupe.md`

## Validation Plan

- Run the relevant collaborator route, reconciliation migration, duplicate-repair migration, and claim-function tests.
- Re-open the report and confirm every requested heading is present in order.
- Run `git diff --check` on the new Markdown files.
- Confirm no application code or migration was modified and record final Git status.

## Risks And Coordination Notes

- Production is reported at migration 227. Migration 228 is already discussed elsewhere for deferred storage attribution, so this review will not reserve a migration number; planning must choose the next free number.
- Existing production duplicates are assumed. A unique index cannot be created safely until a human-reviewed preflight and reconciliation has completed.
- `main` is protected. No branch switch, commit, push, deployment, production query, or migration application is in scope.
- The existing untracked roster-dedupe prompt is user-owned and will be preserved.
