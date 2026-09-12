# Supabase Auth abuse-control review

Status: pending human production review

## Why this remains human-gated

Funūn calls Supabase Auth directly from the browser, which preserves Supabase's
per-client-IP abuse controls. Moving password operations behind a shared Vercel
function solely to add another limiter could collapse users onto shared server
IP limits and make legitimate beta traffic less reliable.

## Before broader beta access

- Review Authentication > Rate Limits in the production Supabase dashboard.
- Confirm email/password, token refresh, verification, and recovery limits match
  the planned beta cohort and support capacity.
- Enable CAPTCHA for sign-up, sign-in, and password recovery after testing the
  chosen provider in preview and production.
- Confirm custom SMTP delivery, sender identity, bounce handling, and recovery
  email deliverability.
- Exercise lockout, repeated recovery, expired-link, wrong-workspace, and
  account-switch paths with non-owner test accounts.
- Record the approved settings, owner, date, and rollback instructions in the
  beta launch runbook without copying secrets or tokens into the repository.

## Completion evidence

- Dashboard screenshots or an access-controlled change record.
- Human UAT results linked from the beta launch checklist.
- Support copy and escalation owner confirmed for rate-limited members.
