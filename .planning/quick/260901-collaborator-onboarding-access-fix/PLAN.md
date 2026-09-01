# Collaborator onboarding and artist-room access fix

## Product objectives

1. **Correct room access on first sign-in:** every successfully admitted
   self-serve artist or invited collaborator must receive the artist
   capability and immediately see the appropriate artist rooms. Data-driven
   rooms such as Sync Library remain governed by their separate admission
   rules.
2. **A better first-sign-in experience:** design a clear, human welcome path
   that recognizes why the person joined, gives them one obvious next action,
   and does not treat an invited collaborator's empty personal vault as the
   whole story. This is a follow-up product discussion, tracked separately
   from the access defect so the defect can ship without waiting on broader
   onboarding design.

## Problem

An invited collaborator received an email with two competing calls to action,
was told to expect an email-confirmation message even though confirmation is
disabled, and signed in without the `artist` capability grant required to see
Contract Locker, Collaborators, and other artist rooms.

## Evidence

- The collaborator invite template links separately to `/join/<token>` and
  `/signup?invite=<token>`.
- The signup UI always renders “Check your email” after a successful
  `signUp()`, regardless of whether Supabase returned an active session.
- Local Supabase configuration has email confirmation disabled.
- Production lookup for `@justifiednoise` found an artist profile and one
  claimed collaborator row, but no capability-grant rows.
- The artist navigation hides Contract Locker and Collaborators when the
  approved `artist` capability is absent.
- The current `handle_new_user()` trigger grants `industry` on industry
  signup but does not grant `artist` on self-serve artist signup.

## Scope

1. Make the collaborator invite email use one clear CTA that preserves the
   invite token and leads directly to account creation/profile claiming.
2. Make signup distinguish an immediately active session from a flow that
   genuinely requires email confirmation.
3. Add a forward-only migration that grants `artist` during valid self-serve
   artist signup and backfills missing grants for existing artist profiles.
4. Add focused regression coverage for the email, signup outcome decision,
   and migration invariants.

## Safety and assumptions

- Existing `/join/<token>` links remain valid for backward compatibility; the
  email simply stops presenting that route as a competing action.
- Artist capability is granted only in the default self-serve artist lane,
  never in buyer, staff, or industry provisioning lanes.
- Backfill applies only to profiles whose stored `member_type` is `artist` and
  that do not already have a pending or approved artist capability row.
- Existing unrelated working-tree changes are preserved and excluded from
  this task's commit.

## Verification

- Run focused Jest tests for collaborator invite and signup completion logic.
- Run a migration invariant test for the new capability migration.
- Run TypeScript typecheck and lint on changed application files.
- Inspect the final diff and verify only task-owned files are staged.
