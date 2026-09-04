# Global messages inbox

## Objective

Remove Messages from the workspace sidebar and make the persistent header chat control the canonical global entry point, with a compact recent-conversation drawer and an unchanged full inbox route.

## Scope

- Remove the duplicate Messages navigation item and unused sidebar icon import.
- Convert the header Messages icon from a plain link into an accessible inbox popover.
- Load recent conversations and incoming requests only when the drawer opens.
- Preserve the authoritative unread-thread badge and Realtime refresh behavior.
- Link each drawer row to its thread and provide an Open full inbox action.
- Preserve `/messages`, direct `?with=` and `?thread=` links, and the existing docked conversation widget.

## Files expected to change

- `components/nav/ArtistNav.tsx`
- `components/nav/MessagesIcon.tsx`
- Tests covering navigation and the global inbox contract

## Validation plan

- Verify Messages is absent from the sidebar but remains in the global authenticated header.
- Verify the drawer fetches only when opened, renders recent threads and requests, closes on Escape/outside click, and links to the full inbox.
- Verify unread state continues to come from server responses rather than local increments.
- Run focused Jest, TypeScript, ESLint, full Jest, production build, and `git diff --check`.

## Risks and coordination notes

- Do not remove or rename `/messages`; it remains the focused full-screen inbox and a stable deep-link target.
- Do not duplicate DM authorization or unread calculations in the client.
- No database migration is expected.
