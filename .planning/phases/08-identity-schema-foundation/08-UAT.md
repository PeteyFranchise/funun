---
status: testing
phase: 08-identity-schema-foundation
source: [08-VERIFICATION.md]
started: 2026-07-05T20:10:00Z
updated: 2026-07-05T20:10:00Z
---

## Current Test

number: 3
name: Log in as a seeded artist account with private fields populated, visit /settings and /profile, verify legal name / contact / PRO fields render and save without 500 or 42501
expected: |
  Pages load; private fields display and save correctly via service-client path
awaiting: user response

## Tests

### 1. Push migrations 034-040 to the linked Supabase project and confirm all seven apply cleanly
expected: All migrations apply without error; supabase db push exits 0
result: passed — required 3 follow-up migration fixes discovered during the live push (see Gaps section)

### 2. As the authenticated role via direct PostgREST, run SELECT legal_first_name FROM artist_profiles LIMIT 1
expected: 42501 permission denied for column legal_first_name
result: passed — HTTP 401, {"code":"42501","message":"permission denied for table artist_profiles"} (Postgres reports table-level phrasing for column-grant denials; SQLSTATE and behavior match exactly)

### 3. Log in as a seeded artist account with private fields populated, visit /settings and /profile, verify legal name / contact / PRO fields render and save without 500 or 42501
expected: Pages load; private fields display and save correctly via service-client path
result: [pending]

### 4. Visit a public /u/[handle] page as a logged-out visitor; confirm no legal_*, contact_phone, mailing_address, pro, ipi, publisher, mlc_id, or soundexchange_id values appear in the response payload
expected: Response contains only the PUBLIC-grant columns; private PII is absent
result: [pending]

### 5. Invite a new industry member via /admin/members (display name, role chips, submit); confirm member_type='industry' artist_profiles row, free subscriptions row, and Resend invite email with working magic link
expected: DB row created by handle_new_user() industry branch; subscriptions row with tier='free'; Resend email delivered; magic link signs in the invited member
result: [pending]

### 6. Re-invite the same email address; confirm POST /api/admin/members returns 409 with "This email has already been invited."
expected: 409 response; DuplicateIndustryMemberError correctly identified via email_exists code
result: [pending]

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

- Migration 034's `search_vector` used `GENERATED ALWAYS AS (to_tsvector(...)) STORED`, which Postgres rejected as non-immutable (SQLSTATE 42P17) — even after two wrapper-function attempts (LANGUAGE sql, then LANGUAGE plpgsql). Fixed by switching to a plain column maintained by a `BEFORE INSERT/UPDATE` trigger instead (commit 9910cbb). No live impact — caught before any partial apply.
- Discovered migration 026 (Wave 2, already recorded as applied in the CLI's remote history) never actually added `artist_profiles.claimed_at` on this live database — a real gap in migration history predating Phase 8, not just a bookkeeping gap. Fixed defensively inside migration 040 (commit 8e8b42f). **Follow-up needed**: audit whether migration 026's other pieces (`user_profiles` table, `collaborators.claimed_by`/`archived_at`/`is_favorite`, `claim_collaborators()`/`backfill_claimed_collaborators()` functions, the claim-on-signup branch of `handle_new_user()`) are also missing live — if so, the collaborator-claim feature may be non-functional in production.
- All 40 migrations now show LOCAL = REMOTE in `supabase migration list` — fully in sync as of this push.
