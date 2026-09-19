# Storage Proportionality Review

## Objective

Assess which remaining storage-attribution and upload-admission work is proportionate for Funūn's current pre-revenue beta, verify Supabase signed-upload size controls, and write the complete response to the requested review file.

## Scope

- Review current repository state and the already-shipped fail-closed change.
- Rank the declared-size gap, migration 228, storage ledger, and policy revocation.
- Compare a lightweight abandoned-upload sweeper with the proposed ledger.
- Define observable triggers for deferred work.
- Write only documentation; do not change application code, migrations, policies, production, or deployment state.

## Files Expected To Change

- `.planning/reviews/CODEX-RESPONSE-260919-what-is-worth-doing.md`
- `.planning/quick/260919-storage-proportionality-review/PLAN.md`
- `.planning/quick/260919-storage-proportionality-review/SUMMARY.md`

## Validation Plan

- Confirm every requested top-level section is present.
- Confirm citations use repository file/line evidence and official provider links.
- Confirm Markdown fences are balanced and `git diff --check` passes.
- Confirm no executable or migration files changed.

## Risks / Coordination Notes

- Existing untracked files are user-owned and must remain untouched.
- Provider behavior must be sourced from official Supabase documentation or inspected SDK code; uncertainty must remain explicit.
- Any SQL is proposal-only and human-gated.
