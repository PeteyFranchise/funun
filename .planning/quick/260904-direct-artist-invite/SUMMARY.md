# Direct artist invite summary

## What changed

- Added an always-available “Invite one artist” panel to the Team Member Artist Invites room.
- Added an optional artist-name field and required email field, with responsive mobile/desktop layout.
- Connected the form to the existing staff-gated direct invitation endpoint; leadership is not required.
- Added clear sent, already-active, and email-delivery-failure feedback.
- Returned the active signup link to authorized Team Members and added a copy-link fallback for every successfully created or existing active invite.
- Personalized the artist invite email when a name is supplied and escaped that untrusted value in HTML.
- Left the leadership-only waitlist broadcast and all waitlist conversion behavior unchanged.

## Validation run

- Focused Jest: 3 suites, 31 tests passed.
- Full Jest: 440 suites, 4,144 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.

## Remaining risks or follow-ups

- Browser clipboard access depends on a secure context; copy failures produce an actionable message.
- The change is local until the accumulated worktree changes are committed and deployed.
- No database migration is required for this feature.
