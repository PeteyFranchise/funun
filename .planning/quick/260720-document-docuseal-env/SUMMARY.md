## What Changed

- Added empty `DOCUSEAL_API_KEY=` and `DOCUSEAL_WEBHOOK_SECRET=` placeholders to `.env.example`
- Kept them grouped with `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `ESIGN_FROM_EMAIL`
- Added the server-only guidance comments and source-location notes for both values

## Validation Run

- `grep -n "DOCUSEAL_API_KEY\\|DOCUSEAL_WEBHOOK_SECRET\\|ESIGN_FROM_EMAIL" .env.example`
- `npm test` → 71 suites passed, 831 tests passed
- `git status --short --branch`

## Remaining Risks Or Follow-Ups

- None for this doc-only task
