## Objective

Document `ESIGN_FROM_EMAIL` in `.env.example` as the monitored sender and reply-to mailbox for Funūn split-sheet signature invites.

## Scope

- Update `.env.example` only
- Keep the new variable grouped with related email / e-sign configuration
- Do not touch `.env.local` or any runtime code

## Files Expected To Change

- `.env.example`
- `.planning/quick/260720-document-esign-from-email/PLAN.md`
- `.planning/quick/260720-document-esign-from-email/SUMMARY.md`

## Validation Plan

- `grep -n "ESIGN_FROM_EMAIL" .env.example`
- `npm test`
- `git status --short --branch`

## Risks / Coordination Notes

- Stop if `.env.example` is not readable or writable
- Keep the edit doc-only and avoid changing any existing variable values
