# Global messages inbox — summary

## Completed

- Removed the duplicate Messages destination from the member workspace sidebar.
- Kept the persistent header chat control as the global Messages entry point.
- Added an accessible recent-inbox drawer with incoming requests first, recent conversations, unread indicators, empty/loading/error states, thread deep links, and an **Open full inbox** action.
- Preserved the existing `/messages` page, `?thread=` and `?with=` entry paths, docked conversation widget, server-authoritative unread count, polling, and Realtime refresh behavior.
- Deferred the full thread-list request until the member opens the drawer.

## Verification

- Focused Jest: 3 suites, 17 tests passed.
- Full Jest: 445 suites, 4,174 tests passed.
- TypeScript: passed (`npm run typecheck`).
- ESLint: passed (`npm run lint`).
- Production build: passed (`npm run build`).
- Patch hygiene: passed (`git diff --check`).

## Delivery notes

- No database migration or environment-variable change is required.
- The implementation is local and ready to be committed and deployed when requested.
- Manual GSD planning fallback was used because the installed GSD CLI does not expose a quick-task execution command.
