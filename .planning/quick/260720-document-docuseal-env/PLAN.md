## Objective

Document the two server-only DocuSeal environment variables in `.env.example`.

## Scope

- Update `.env.example` only
- Keep the new variables grouped with the existing Resend / e-sign configuration
- Leave placeholders empty

## Files Expected To Change

- `.env.example`
- `.planning/quick/260720-document-docuseal-env/PLAN.md`
- `.planning/quick/260720-document-docuseal-env/SUMMARY.md`

## Validation Plan

- `grep -n "DOCUSEAL_API_KEY\\|DOCUSEAL_WEBHOOK_SECRET\\|ESIGN_FROM_EMAIL" .env.example`
- `npm test`
- `git status --short --branch`

## Risks / Coordination Notes

- Stop if `.env.example` becomes unreadable or unwritable
- Do not touch `.env.local`
- Do not add any real secret values
