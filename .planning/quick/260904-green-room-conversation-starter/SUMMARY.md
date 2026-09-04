# Green Room conversation-starter card summary

## What changed

- Removed the member-visible “Monetization runway” roadmap copy from the Green Room sidebar.
- Added the approved “Put something in the room” card explaining that Members can share what they are making, need, or can offer.
- Added three compact example prompts for vocalist searches, offers to help, and feedback requests.
- Added an accessible “Start a post →” action that smoothly scrolls to the existing composer and places keyboard focus in its post body.
- Added stable composer and textarea identifiers plus scroll offset so the sticky application header does not cover the destination.

## Validation run

- Focused Green Room Jest: 2 suites, 8 tests passed.
- Full Jest: 439 suites, 4,139 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.
- React best-practices review: no new state, effects, network work, or dependency weight; the interaction stays in its event handler and retains explicit focus/accessibility wiring.

## Remaining risks or follow-ups

- The change is local until the accumulated worktree changes are committed and deployed.
- Role-personalized prompts remain a future enhancement; this version is intentionally universal and lightweight.
