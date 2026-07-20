## Objective

Safely re-push migration 062 to the linked Funūn Supabase database after confirming the latest branch state, fixing the committed rollback SQL artifact so it is directly executable, and verifying all post-push invariants.

## Scope

- Confirm branch is current and commit `482a1b8` is present
- Confirm `supabase/migrations/063_split_sheet_legal_grade.sql` is restored and present
- Fix `.planning/phases/17-split-sheet-esign/rollback/062-readiness-fn-before.sql` by adding the missing trailing semicolon
- Commit that rollback artifact fix
- Run 062 preflight checks against the linked database
- Push migration 062 only
- Run all requested verification queries and the migration test
- Restore `063` to the migrations folder if temporarily held out

## Files Expected To Change

- `.planning/phases/17-split-sheet-esign/rollback/062-readiness-fn-before.sql`
- `.planning/quick/260720-062-repush/PLAN.md`
- `.planning/quick/260720-062-repush/SUMMARY.md`

## Validation Plan

- `git pull origin codex/phase-11-presence-messaging`
- `git rev-parse --verify 482a1b8`
- DB preflight queries for table absence and pre-062 status constraint
- `supabase db push`
- DB verification queries for RLS, grants, policies, constraint, and readiness scores
- `npx jest __tests__/migration-062.test.ts`

## Risks / Coordination Notes

- `063` must not be pushed; if necessary, hold it out temporarily and restore it immediately after 062
- Rollback SQL must be directly executable because it restores a scoring function used across every vault project
- Roll back 062 only if the user’s specified post-push failure conditions are hit
