## What Changed

- Added `ESIGN_FROM_EMAIL=esign@funun.studio` to `.env.example`
- Kept it grouped with the existing Resend / email configuration
- Added the monitored-mailbox guidance comment for the 17-10 signature-invite flow

## Validation Run

- `grep -n "ESIGN_FROM_EMAIL" .env.example`
- `npm test` → 66 suites passed, 736 tests passed
- `git status --short --branch`

## Remaining Risks Or Follow-Ups

- None for this doc-only task
