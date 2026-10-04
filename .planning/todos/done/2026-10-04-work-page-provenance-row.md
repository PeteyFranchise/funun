# Work-page provenance row ("FROM AN IDEA")

**Closed:** 2026-10-04 by quick task `261004-pvr` — this todo's central premise was
FALSE. The reverse lookup, the service-role fetch, and a rendered provenance block
already shipped on `main` on 2026-09-03 (`c69916b4`), five weeks before this todo was
captured and re-described them as missing. See `app/(artist)/vault/works/[workId]/page.tsx`
(then ~lines 397-409 for the fetch, ~868-880 for the render) — verified against the live
source before this todo was captured, which it was not.

What 261004-pvr actually found missing and built: a relative timestamp (the data was
fetched, never rendered), the bench's visual treatment (bench tokens, not the ad hoc
classes already in place), and — the real, previously undecided gap — an explicit
access rule for who may see the originating idea's title. The owner decided
2026-10-04 to gate the row to idea access (`resolveIdeaAccess()`, `lib/ideas/access.ts`):
only a viewer who is the idea's owner or an `idea_members` row sees the row at all. See
`.planning/quick/261004-pvr-work-page-provenance-row/261004-pvr-SUMMARY.md` for the
full record. The sections below are preserved as originally written, for the record —
they are now known to be wrong where marked.

---

**Captured:** 2026-10-04 · **Status:** parked, cut from the Writer's Room restyle (part 1)
**Owner framing:** cut because it is not cosmetic — the work has no reverse link to its
originating idea yet. **[WRONG — the reverse link already existed; see correction above.]**

## What the bench has

The bench (`private/bench/index.html:563-573`, `.origin` class) renders a row reading
"FROM AN IDEA" above a spark/title, a relative timestamp, and a "View original" link —
sitting just below the header on a promoted work's page.

## Why it was cut from part 1

This restyle is explicitly visual-only (no new data, no new props, no structural change).
The origin row is not a style port — it requires data that the current server page does
not fetch.

## What data exists today

`lib/ideas/schema.ts:44` — `promotedWorkId: string | null` on the idea record, set when an
idea is promoted to a work (`IdeaState` includes `'promoted'`, `lib/ideas/schema.ts:8`).
That pointer runs **idea → work**, one direction only.

## What is missing

**[WRONG — see correction at top. The lookup below already existed when this was written.]**

A reverse lookup, **work → idea**, in the server page that renders the Writer's Room
(`WorkPage.tsx` or its data-loading layer). Today there is no query that, given a work id,
finds the idea whose `promotedWorkId` equals it. Until that lookup exists, there is nothing
to render in an origin row — adding the UI first would either be empty forever or require
faking the link.

## Scope if picked up

1. Add a server-side lookup: `ideas` row where `promotedWorkId = workId` (likely an index on
   that column if not already present).
2. Pass the resolved idea (spark text, promoted-at timestamp, idea id for "View original")
   down to `WorkPage`/`WorkHeader` as a new, explicitly optional prop — this is new
   information, so it is an IA change, not a restyle.
3. Port `.origin`'s visual treatment using project tokens (same palette-trap discipline as
   the rest of this restyle: `rgba(199,203,247,...)` literals in the bench's `.origin` rule
   are retired lavender, not live style — translate by token name).
