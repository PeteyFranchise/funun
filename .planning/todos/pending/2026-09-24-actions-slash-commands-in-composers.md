---
created: 2026-09-24T00:00:00Z
title: Build /actions slash-command shortcuts into the Writer's Room composers
area: writers-room
severity: low
status: pending
---

## What

Add `/actions` — slash-command shortcuts typed inline in a composer — so a writer can
trigger a workflow step without leaving the text box they are already in.

## Where it came from

The 21st.dev compose-box harvest during the bench-01 design session (2026-09-24). That
component shipped with two inline triggers: `@` for mentions and `/` for commands. The
`@` half maps cleanly onto Funūn's existing room roster and is already prototyped. The
`/` half had no Funūn equivalent, so the prototype ships **placeholder** commands only.

## What already exists

A working prototype in `private/bench/index.html` (gitignored, not shipped):

- caret-anchored picker that flips above the caret near the viewport bottom
- keyboard navigation (↑/↓, Enter/Tab to insert, Esc to dismiss)
- token highlighting in a mirrored backdrop layer behind the textarea
- filtering on typed text after the trigger character

It needs **no new dependencies** — the source used framer-motion for a sliding highlight
between options, which was replaced with a CSS transition on a translated element.

## What is undecided — needs product input

The command set itself. The five in the prototype are invented placeholders, not a
proposal:

| Placeholder | Intent |
|-------------|--------|
| `/take` | link a take at the current playhead |
| `/lyric` | point at a lyric block |
| `/todo` | turn the message into a room task |
| `/split` | open the split sheet |
| `/resolve` | mark the thread settled |

## The constraint that matters

Funūn has **five** places a conversation can happen:

1. DMs — `components/messages/Composer.tsx`
2. Studio Notes threads with reactions — `lib/catalogue/studio-notes.ts`
3. Timed take comments — `lib/catalogue/version-comments.ts`
4. Per-block lyric comments — `lib/catalogue/comments.ts`
5. Room chat (proposed, not built)

`/actions` should be a **shared composer behaviour**, not a chat feature. A command that
works in chat but not on a lyric comment teaches the writer that the shortcut is
unreliable, which is worse than not having it. Whatever is built should be one module
every composer mounts, with the available command set filtered by surface — `/lyric`
makes no sense inside a lyric block's own comment box.

Related open question already logged in the bench notes: whether room chat should exist
at all given the other four surfaces, or whether Studio Notes covers it.

## Files

- `private/bench/index.html` — prototype (gitignored)
- `components/messages/Composer.tsx` — the existing composer most likely to host it first
- `lib/catalogue/studio-notes.ts` — threaded notes model
