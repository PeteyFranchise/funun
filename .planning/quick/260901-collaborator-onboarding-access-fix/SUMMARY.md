# Collaborator onboarding and artist-room access fix — summary

## Root causes confirmed

1. The collaborator email presented two competing paths: a read-only join
   page and a separate account-creation link.
2. Signup always claimed that a confirmation email had been sent, even when
   Supabase returned an active session. Email confirmation is currently
   disabled, so that second email is intentionally not generated.
3. The default artist signup path did not create the approved `artist`
   capability row used by the navigation. Production inspection confirmed
   `@justifiednoise` is an artist with one claimed collaborator record and no
   capability rows.

## Changes completed

- Replaced the invite's competing actions with one “Claim my Funūn profile”
  button leading to the token-preserving signup path.
- Shortened the invite copy while retaining a plain explanation of why legal
  name, PRO, and IPI/CAE details matter.
- Made signup inspect the Supabase result:
  - active session → enter `/vault` immediately;
  - no session → show the email-confirmation instructions.
- Added migration 147:
  - grants approved artist capability after successful self-serve artist
    signup;
  - excludes buyer, staff, industry, and admin-provisioned lanes;
  - backfills artist profiles missing an active artist grant, including the
    confirmed production condition affecting `@justifiednoise`.
- Added regression tests for the single-CTA email, signup-completion decision,
  and migration security/eligibility invariants.

## Verification

- Collaborator invite and migration tests: 17 passing.
- Signup-completion tests: 2 passing.
- ESLint on all changed TypeScript/TSX files: passing.
- `npm run typecheck`: passing.
- `git diff --check`: passing.

## Deployment checkpoint

The application changes need the normal commit/deploy flow. Migration 147 is
human-gated and must be applied with `npm run db:push`; once applied, its
backfill restores the missing artist-room capability without requiring Stephan
to create another account.
