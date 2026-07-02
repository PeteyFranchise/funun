---
status: testing
phase: 06-playlist-curator-pitching
source: [06-VERIFICATION.md]
started: 2026-07-02T00:00:00Z
updated: 2026-07-02T00:00:00Z
---

## Current Test

number: 1
name: Claim a curator profile end-to-end via the live /curators/claim/[token] flow and inspect the Supabase auth.users / artist_profiles tables
expected: |
  A new auth.users row is created with app_metadata.role='curator', and NO corresponding
  artist_profiles or subscriptions row is created for that user id (handle_new_user()'s
  curator branch fires correctly against the live trigger).
awaiting: user response

## Tests

### 1. Claim a curator profile end-to-end
expected: A new auth.users row is created with app_metadata.role='curator', and NO corresponding artist_profiles or subscriptions row is created for that user id (handle_new_user()'s curator branch fires correctly against the live trigger). Code-level guarantee already verified: app_metadata.role is set at admin.createUser() time, and migration 030's handle_new_user() has the early-return branch as the first statement in BEGIN, before the artist_profiles INSERT.
result: [pending]

### 2. Confirm migrations 031 and 032 took effect on the live database
expected: An authenticated (non-service) JWT calling GET /rest/v1/curators?select=claim_token,email or GET /rest/v1/pitch_history?select=response_token returns a column-does-not-exist/permission error, not the secret values; CREATE UNIQUE INDEX on claim_token did not fail on a pre-existing duplicate. SQL content already verified to match the 06-REVIEW.md CR-02/CR-03/WR-06 findings exactly.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
