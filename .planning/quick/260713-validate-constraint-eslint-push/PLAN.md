# Quick Plan: Validate Document Guard + ESLint CLI + Push

Date: 2026-07-13

## Scope

- Add a follow-up migration to validate `vault_documents_status_requires_evidence_chk` now that legacy offenders are cleaned up.
- Replace the interactive `next lint` script with a non-interactive ESLint CLI setup.
- Run database push, tests, typecheck, and lint.
- Commit only this follow-up work and push the branch.

## Assumptions

- The existing uncommitted `.planning/phases` files and `.agents/` folder are unrelated and should remain untouched.
- The project should keep using the existing Next.js ESLint rules from `eslint-config-next`.

## Verification

- `npm run db:push`
- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `git push`
