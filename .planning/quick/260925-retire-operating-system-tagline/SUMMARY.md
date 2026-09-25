---
type: quick
slug: retire-operating-system-tagline
created: 2026-09-25
completed: 2026-09-25
status: complete
---

# Summary

The tagline is gone from all shipped code. Zero matches remain in `app/`, `components/` or `lib/`.

## Changed

| File | Change |
|---|---|
| `app/(auth)/layout.tsx` | Subtitle `<p>` removed. The wordmark now stands alone on signin/signup. |
| `app/unsubscribe/page.tsx` | Same `<p>` removed. |
| `app/layout.tsx` | `metadata.description` replaced — it cannot be blank. |

New meta description:

> Where songs get written and the rights get recorded — Writer's Room, Sound Vault, split sheets
> and registrations in one place.

## Why the two pages lost the line rather than gaining a new one

A wordmark can stand on its own. Someone reaching signin already knows what they came for, and
someone on the unsubscribe page should not be pitched. Fewest words, nothing to defend later.

## Verified

- `npm run typecheck:strict` — exit 0
- `npm run lint` (`--max-warnings=0`) — exit 0
- `grep -rn "operating system for" app/ components/ lib/` — zero matches outside worktrees

## Deliberately untouched

- `README.md:3` carries the same variant. Internal document, not shipped UI.
- `.claude/worktrees/zen-yalow-0b7a42/` — a worktree, not the live app.

## Note on impact

This was live on the public homepage. `funun.studio` resolves to the Next app and redirects
logged-out visitors to `/signin`, so the removed line was the first sentence an unauthenticated
visitor read. The meta description is what search results and link previews show, so that change
propagates as engines recrawl.
