# First-Sign-In Experience — Summary

## What Changed

- Added migration 157 with private `user_profiles.first_sign_in_completed_at` state. Every existing profile is backfilled as complete; future profiles start incomplete.
- Added a pure server-owned welcome model for collaborator and ordinary artist lanes.
- Added an authenticated, idempotent completion endpoint scoped to the verified user ID.
- Added a responsive Sound Vault welcome panel with one primary action, a quiet “Enter my vault” dismissal, and an optional Writer's Room link.
- The ordinary new-artist welcome remains song-first but now also offers “Set up my rights” as a secondary route to Settings for artists who want to “get down to business first.”
- Writer's Room invitations now carry a guarded return path through both active-session and email-confirmation signup flows, so the new member enters the exact invited song first.
- Writer's Room creative access is explicitly membership-only. Missing profile fields, PRO/IPI, publisher data, splits, registrations, and rights readiness do not participate in the access decision and cannot block songwriting.
- The invite signup asks only for email, password, and a handle, and reassures the member: “You can fill in your profile and rights details later—we’ll help you stay on top of it. For now, let’s write.”
- Signup's existing profile creation and collaborator claim now also mark matching collaborator invitations accepted; existing claimed invitations are reconciled by migration 157.
- The broader welcome remains incomplete while the new member is creating, then appears on their first later Sound Vault visit.
- Integrated the panel into `/vault` without changing staff, buyer, capability, or navigation behavior.
- Added migration, model, route, and component regression coverage.
- Added a regression case proving a brand-new contribute-tier member can write while every later-stage profile and rights fact is incomplete.
- Produced an interactive three-state mockup in the Codex conversation before finalizing the component.

## Validation Run

- New-artist creative/business choice: 2 suites, 9 tests passed; focused ESLint and TypeScript passed.
- Post-clarification creative-access and invitation contract: 2 suites, 22 tests passed.
- Focused onboarding and invitation Jest: 7 suites, 45 tests passed before the final invitation-lifecycle additions; the final focused invitation run passed 3 suites and 26 tests.
- `npm run typecheck`: passed.
- Focused ESLint on changed TypeScript/TSX: passed with zero warnings.
- `npm run lint`: passed with zero warnings.
- Final full Jest: 365 suites, 3,840 tests passed.
- `git diff --check`: passed.
- Production build: skipped because the repository records that running a build alongside the owner's development server can corrupt `.next`; TypeScript, lint, and full Jest provide the local gate for this task.

## Remaining Risks / Follow-Ups

- Migration 157 must be applied before deploying the application code because `/vault` reads the new private column.
- Production UAT needs newly created accounts; existing accounts are intentionally ineligible after the migration backfill.
- Verify email → signup → profile claim → exact Writer's Room landing → later Vault welcome with a real collaborator invite before calling the experience live.
