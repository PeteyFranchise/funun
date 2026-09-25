---
type: quick
slug: retire-operating-system-tagline
created: 2026-09-25
status: in-progress
---

# Retire the "operating system for your music career" tagline

Owner instruction, 2026-09-25: *"I don't want to see 'The operating System for your music career'
anywhere anymore."* Reason given: it is a generic AI-suggested line now shared with a large number
of other music apps, so it cannot differentiate Funūn.

**It is live on the public homepage.** `funun.studio` resolves to the Vercel Next app and redirects
logged-out visitors to `/signin`, where the auth layout renders the line under the wordmark. It is
the first sentence an unauthenticated visitor reads.

## Locations (verified by grep, 2026-09-25)

| File | Line | Treatment |
|---|---|---|
| `app/(auth)/layout.tsx` | 18 | Exact string, wordmark subtitle. **Remove the `<p>` entirely.** |
| `app/unsubscribe/page.tsx` | 176 | Exact string, same treatment. **Remove entirely.** |
| `app/layout.tsx` | 14 | **Variant**: "…for an independent music career — built around Sound Vault." This is `metadata.description`; it cannot be blank. **Replace.** |

Replacement for the meta description:

> Where songs get written and the rights get recorded — Writer's Room, Sound Vault, split sheets
> and registrations in one place.

124 characters, inside the ~155 Google renders. Names four real product surfaces.

## Out of scope

- `README.md:3` carries the same variant. Internal document, not shipped UI. Left alone.
- `.claude/worktrees/zen-yalow-0b7a42/` contains copies. A worktree, not the live app.
- The two page surfaces lose their subtitle rather than gaining a new one. A wordmark can stand
  alone; someone on signin already knows what they came for, and someone unsubscribing should not
  be pitched.

## Verification gate

`npm run typecheck:strict` and `npm run lint` (`--max-warnings=0`), per CLAUDE.md. Then a repo-wide
grep confirming zero matches outside README and worktrees.
