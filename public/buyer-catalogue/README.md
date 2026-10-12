# Cover art for the /sync illustration

**Provenance, confirmed by the owner 2026-10-11: Funūn made this artwork.**

> "The artwork is just artwork I made for the purpose of showcasing the idea that we are working
> on. They don't belong to real artists, I made them myself on Midjourney so we can use them to
> illustrate examples."

So there is no third-party rights question here. **Please do not re-raise it** — it was asked three
times during the Phase 50 buyer-surface work, because these files arrived alongside a fabricated
song fixture (invented titles, invented artist names) that was deleted on 2026-10-11 for making
false claims about what Funūn represents. The art survived that deletion on purpose; the songs did
not.

## What these are, and what they are not

They are **illustration**. They show a supervisor what kind of music sits in The Crate, on the
`/sync` landing page, before they click through.

They are **not** catalogue entries. Nothing here carries a song title, an artist name, an id, a
link, or a play control, and nothing is wired to catalogue data. See `CATALOGUE_ILLUSTRATION` in
`app/sync/page.tsx` and the deletion note in `lib/deals/catalog-sample.ts`.

**Do not attach a song title or an artist name to any of these images.** That is precisely what was
removed, and an AI-generated cover presented as a real release is the same false claim wearing a
different hat.

## Current usage

| file | used by |
|---|---|
| `paper.jpg` | `/sync` illustration strip |
| `moonlight.jpg` | `/sync` illustration strip |
| `golden-hour.jpg` | `/sync` illustration strip |
| `lantern.jpg` | `/sync` illustration strip |
| `midnight-ride.jpg` | **unreferenced** since the fixture was deleted |
| `static-heart.jpg` | **unreferenced** since the fixture was deleted |
| `morning-light.jpg` | **unreferenced**. 140 KB against ~16 KB for the rest, so a different export, and the name matches the internal Morning Light brand film |

The three unreferenced files are harmless to keep and safe to delete. Left in place pending an owner
call rather than removed in a cleanup that was not asked for.
