# Global Quick Capture — Summary

## Built

- Added a persistent **Capture** trigger to the User Account header, a mobile floating record trigger, and the non-conflicting `Command/Ctrl + Shift + U` shortcut.
- Opening the trigger starts the microphone immediately. The dock stays over the current page and keeps the fast path to `Record → Stop → Done`.
- Reused the Ideas recorder's pause/resume, moment markers, import fallback, direct signed upload, local copy, and IndexedDB recovery.
- After a safe save, the dock offers only `Done`, `Record another`, and `Open idea`.
- When the current route is a Writer's Room, the dock additionally offers `Add to this Writer's Room`. The atomic bridge reuses the immutable Idea audio, creates a room take and diary event, and records provenance.
- Writer's Rooms now surface origin Ideas whether the Idea arrived through full promotion or Global Quick Capture.
- The capture dock is dynamically loaded only when opened.

## User Account boundary

- The trigger and dock mount only when the authenticated identity owns a `public.user_profiles` row—the structural Funūn User Account signal.
- They do not mount in Team Member/admin, buyer, client-partner, public, approval, or unauthenticated layouts.
- Idea creation, invitation acceptance, the Ideas page, and Writer's Room attachment all check the User Account profile boundary.
- Migration 170 adds database foreign keys so non-User-Account identities cannot own or join Ideas through direct calls.

## Safety

- Microphone tracks are stopped on completion, denial, cancellation/unmount, and a navigation that occurs while the permission prompt is pending.
- The dock cannot be dismissed while permission, recording, or saving is active.
- Adding a capture to a room requires ownership of the Idea and current contribute-or-administer room access.
- The room bridge is transactional, idempotent, service-only, and creates no rights, splits, publishing, registrations, approvals, master, or release state.
- The visual Idea Canvas remains deferred pending an owner-approved UI mockup.

## Verification

- Focused Global Capture, API-boundary, and migration tests: 9 passed.
- Full Jest suite: 409 suites and 3,999 tests passed.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Next.js production build: passed, including the new attachment route.
- `git diff --check`: passed.

## Deployment

Migration `170_global_user_account_capture.sql` must be applied before deploying this build:

```bash
cd /Users/peterzora/Desktop/funun
npm run db:push
```

The manual GSD quick fallback was used because Claude's native `/gsd-quick` slash command is not callable from this Codex environment.
