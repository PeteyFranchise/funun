# First-Sign-In Experience

## Objective

Give newly admitted artist accounts a contextual first session that explains why they are in Funūn and offers one clear next action, without showing onboarding to existing accounts or non-artist account types.

## Scope

- Persist first-sign-in completion on `user_profiles`, backfilling every existing profile as complete so the experience only applies to accounts created after activation.
- Derive a small, server-owned welcome model for collaborator invitees versus other newly admitted artists.
- Show the welcome panel at the top of Sound Vault while preserving the normal navigation and access model.
- For collaborator invitees, lead with profile review and offer a contextual shared-song link when one exists.
- For invitations sent inside a Writer's Room, create and claim the member profile in the signup transaction, mark the collaborator invite accepted, and land the new member directly in that room.
- Treat the new member's authenticated work membership as the complete creative-access requirement: missing PRO, IPI, publisher, split, registration, or other rights/profile details must never gate Writer's Room entry or songwriting actions.
- Keep account creation minimal for this lane (email, password, and handle), and tell the invitee that rights/profile details can be completed later.
- Frame deferred setup positively, reassure the member that Funūn will help them stay on top of it, and end by returning attention to the creative task: “For now, let’s write.”
- Defer the broader-site welcome until the member later leaves the Writer's Room and visits Sound Vault.
- For other new artists, lead with starting their first song while offering rights setup in Settings as a clear secondary path for artists who want to “get down to business first.”
- Complete onboarding when the person follows the creative action, rights-setup action, or chooses to enter the vault, and never trap them in a tour.
- Add focused migration, pure-model, API, and render coverage.
- Produce an in-conversation mockup of the primary states before implementation is finalized.

## Files Expected to Change

- `supabase/migrations/157_first_sign_in_experience.sql`
- `__tests__/migration-157.test.ts`
- `lib/onboarding/first-sign-in.ts`
- `lib/onboarding/first-sign-in.test.ts`
- `app/api/onboarding/complete/route.ts`
- `app/api/onboarding/complete/route.test.ts`
- `components/onboarding/FirstSignInWelcome.tsx`
- `components/onboarding/FirstSignInWelcome.test.tsx`
- `app/(artist)/vault/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/api/works/[workId]/members/route.ts`
- `lib/collaborators/invite.ts`
- `lib/collaborators/invite.test.ts`
- `__tests__/writer-room-invite-destination.test.ts`
- `.planning/todos/pending/2026-09-01-first-sign-in-experience.md`
- `.planning/quick/260902-first-sign-in-experience/SUMMARY.md`

## Validation Plan

- Static migration tests prove existing profiles are backfilled and new profiles remain incomplete until the server-owned completion route updates them.
- Pure-model tests cover collaborator, shared-work, generic artist, and already-completed states.
- Creative-access tests prove a claimed contribute-tier member is admitted without any profile-completion or rights-readiness input.
- Invitation-flow tests preserve the minimal signup copy and the promise that profile and rights details can wait.
- API tests prove authentication is required and updates are scoped to the verified user ID.
- Render tests prove one primary action, the optional shared-song link, and a non-blocking dismissal path.
- Run focused Jest, TypeScript, ESLint on changed source, full Jest, and `git diff --check`.

## Risks / Coordination Notes

- `user_profiles` uses explicit column privileges. The onboarding field stays private and is read/written through server-side, user-scoped service-role calls.
- Collaborator identity comes only from accepted invite records and claimed memberships, never from client input.
- Writer's Room authorization must remain independent from release-readiness and rights-completeness systems; those may guide later workflows but cannot become room prerequisites.
- The migration is forward-only and production application remains human-gated.
- Existing accounts must not receive a surprise first-session screen.
- Buyer and staff routing remains untouched; this surface exists only inside the artist route group.
