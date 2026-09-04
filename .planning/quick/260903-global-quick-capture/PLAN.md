# Global Quick Capture — Plan

## Objective

Let a signed-in Funūn User Account capture a voice-note-style Idea from anywhere in the User Account experience without navigating away, then optionally send that captured take into the Writer's Room currently open.

## Locked boundaries

- User Accounts only. Do not mount or authorize Global Capture for Team Members/admin, buyers, client partners, public visitors, approval/invite viewers, or merely authenticated identities without a `user_profiles` row.
- `Record → Stop → Done` remains the shortest path. No title, metadata, beat, collaborator, rights, split, registration, or organizational choice is required.
- Every capture saves to Ideas first and uses the existing local recovery and signed-upload pipeline.
- The visual Idea Canvas remains deferred pending a separate owner-approved mockup.

## Scope

- Add a global capture context and dock to the persistent User Account layout.
- Add a desktop-header trigger, mobile floating trigger, and non-conflicting desktop keyboard shortcut.
- Preserve the current page while recording and provide only `Done`, `Record another`, and `Open idea` after save.
- Inside `/vault/works/[workId]`, additionally offer `Add to this Writer's Room` after the Idea recording is durable.
- Add an authenticated, User-Account-gated route that copies one owned Idea recording into an accessible Writer's Room without mutating the Idea audio or inferring rights/splits.
- Add focused helper/security tests and verify the full application.

## Expected files

- `components/ideas/GlobalQuickCapture.tsx`
- `components/nav/ArtistLayoutClient.tsx`
- `app/(artist)/layout.tsx`
- `components/ideas/QuickIdeaCapture.tsx`
- `app/api/ideas/[ideaId]/recordings/[recordingId]/add-to-work/route.ts`
- `lib/ideas/global-capture.ts` and tests
- This task's `SUMMARY.md`

## Validation

- Prove the mount is downstream of the User Account profile gate and absent from non-User-Account layouts.
- Prove the new API rejects unauthenticated callers, authenticated identities without a profile, non-owners of the Idea, and non-members of the target room.
- Prove retries are idempotent and the original audio path remains unchanged.
- Run focused Jest, full Jest, zero-warning lint, TypeScript, production build, and `git diff --check`.

## Coordination

Manual GSD quick fallback is used because Codex cannot invoke Claude's native `/gsd-quick` slash command. This work extends the uncommitted Ideas Inbox build and must preserve its current changes.
