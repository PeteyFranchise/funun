---
created: 2026-09-24T00:00:00Z
title: "#hashtag filing and recognition for tagging ideas and songs"
area: writers-room
severity: low
status: pending
---

## What

`#hashtag` recognition in composers, and a filing system behind it, so ideas and songs
can be tagged for **search** and for **trending** across room chats.

Pairs with `@handle` recognition (already built) and with
`2026-09-24-actions-slash-commands-in-composers.md` — the three are the same inline-token
mechanism with three different resolvers.

## What already exists

`@handle` is done and is the working precedent:

- `lib/handles/` — `validate`, `resolve`, `availability`, `change-form`, `gate`
- `components/handles/ChooseHandleGate.tsx`
- mandatory handle on User Accounts (Phase 36)

The composer-side `@` picker is prototyped in `private/bench/index.html` (gitignored) —
caret-anchored, keyboard navigable, token-highlighted behind the textarea. `#` would
mount the same picker with a different resolver.

## The question that has to be answered first

**Funūn already has two tag systems, and neither is free-form-public.**

1. **A controlled vocabulary.** `lib/tagging/ai-tag.ts` suggests mood / energy / vocal /
   instrument / genre, and its header is explicit that output is *"constrained to the
   SAME controlled vocab the buyer catalogue filters against (`lib/metadata/schema.ts`,
   `lib/genres.ts`) so an AI suggestion can never be off-vocabulary/filter-invisible
   (T-30-04 — Tampering / prompt injection defense: constrain, then drop the rest)."*

2. **`ideas.moods`** — `lib/ideas/schema.ts`, a free-text list capped at
   `IDEA_MOOD_MAX = 12`, 40 chars each, deduped case-insensitively. Used by
   `ideaSimilarity()` for matching. Not exposed to search.

A hashtag namespace is open by nature. Dropping one in alongside these creates a third
namespace and reintroduces exactly the failure the ai-tag comment guards against: a tag
the writer can see but the buyer catalogue's filters cannot. Decide which of these it is
**before** building:

| Option | Meaning | Cost |
|--------|---------|------|
| **A. UI over the controlled vocab** | `#` autocompletes from genres/moods/energy and refuses off-vocab | Safest; filters keep working; writers cannot coin a tag |
| **B. Second free namespace** | `#` writes anywhere, search-only, never feeds catalogue filters | Writers get freedom; two tag systems to explain and reconcile |
| **C. Promote-on-use** | `#` is free, and a tag crossing a usage threshold gets reviewed into the controlled vocab | Best of both; needs a review surface and a moderation owner |

Recommendation is not made here — this is a product call, and the trending feature in
particular depends on it (trending over a controlled vocab is a very different product
from trending over open text).

## Trending — the second open question

"Trending chats" implies ranking tags over a time window across rooms. That crosses a
privacy line the Writer's Room is careful about: `WriterRoomPresence.tsx` carries the
line *"Creative context only — no keystrokes or productivity tracking."* Trending must
not become a back door into what private rooms are discussing. Scope it explicitly:
public surfaces (Green Room) only, or opt-in per room.

## Files

- `lib/tagging/ai-tag.ts` — the controlled vocabulary and why it is controlled
- `lib/metadata/schema.ts`, `lib/genres.ts` — the vocab itself
- `lib/ideas/schema.ts` — `moods`, the existing free-text list
- `lib/handles/` — the `@` precedent to mirror
- `private/bench/index.html` — inline-token picker prototype (gitignored)
