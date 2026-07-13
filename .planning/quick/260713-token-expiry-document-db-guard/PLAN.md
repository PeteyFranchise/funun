# Quick Plan: Token Expiry + Document DB Guard

Date: 2026-07-13

## Scope

Run the next two adversarial hardening steps:

- Add expiry to pitch response tokens.
- Add a database-level safety net so `vault_documents.status IN ('signed', 'verified')` requires evidence.

## Decisions

- Pitch response links expire after 30 days.
- Expiry applies to accept, decline, and unsubscribe links because they all use the same public bearer token.
- Document evidence means either uploaded/verified file evidence (`file_url`) or future e-sign evidence in `document_data.esign`.

## Tasks

1. Add a migration for `pitch_history.response_token_expires_at` and a document evidence check constraint.
2. Write token expiry at pitch-send time.
3. Enforce expiry in public pitch accept/decline/unsubscribe routes.
4. Add focused tests for expiry writes and route predicates.
5. Run TypeScript and Jest verification.

