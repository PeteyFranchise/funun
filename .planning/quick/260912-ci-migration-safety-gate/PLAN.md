# CI Migration Safety Gate — Plan

## Objective

Make the migrations 214–217 static verifier an enforced part of Funūn's
existing Quality and security workflow so migration or runbook drift fails a
push or pull request before merge.

## Scope

- Add the existing `security:migrations:verify` command to the validation job.
- Run the fast structural security gate before the longer TypeScript, lint,
  test, and dependency-audit steps.
- Add regression coverage proving the command remains wired into both
  `package.json` and the workflow.
- Do not apply migrations, connect to production, change GitHub settings,
  deploy, commit, or push.

## Files expected to change

- `.github/workflows/quality.yml`
- `__tests__/beta-security-migration-harness.test.ts`
- `.planning/quick/260912-ci-migration-safety-gate/PLAN.md`
- `.planning/quick/260912-ci-migration-safety-gate/SUMMARY.md`

## Validation plan

- Run the migration security verifier.
- Run the migration-harness regression suite.
- Run strict TypeScript and ESLint.
- Run the full Jest suite and `git diff --check`.

## Risks and coordination notes

- The verifier intentionally fails if reviewed migration bytes change without
  refreshing and reviewing the pinned checksums.
- This repository edit does not make GitHub status checks mandatory; branch
  ruleset enforcement remains an owner-controlled GitHub setting.
