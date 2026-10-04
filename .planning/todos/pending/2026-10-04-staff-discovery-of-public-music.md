# Staff discovery of publicly shared music

**Captured:** 2026-10-04 · **Status:** roadmapped; the invite door ships first, usable today
**Owner:** *"we have to figure out how to do this eventually, and build this new thing eventually,
but let's continue building what we are doing now in preparation for that."*

## The gap

Deliberation §13 describes a Funūn Team Member finding music an artist shared publicly and
inviting them to submit it. **There is no way to browse public music.** Verified 2026-10-04: no
staff discovery surface exists. The Selects catalogue (`app/api/admin/selects/catalog/route.ts`)
shows only tracks already **admitted** to the Crate, not merely public ones. Every other admin
surface touching `vault_projects` joins to a specific project already named by a deal or brief.

So today "comes across music shared publicly" means **landing on that artist's profile page** —
`app/u/[handle]` — by some route outside the product.

## What ships now instead

**The invite door works from an artist's public profile page**, which is where a Funūn Team Member
can actually find music today. Owner, 2026-10-04: *"they should be able to use this invite door
currently if they find an artist's profile page and that artist has posted songs on their page."*

Discovery is the missing half; the invite is the half that works without it.

## The boundary this must never cross

Verified 2026-10-04 and worth restating, because a discovery surface is exactly where it would be
broken: **`vault_projects.is_public` is enforced by an RLS policy created with no `TO` clause**, so
it applies to every role **including staff**, and it has survived every later policy rewrite
untouched. `app/u/[handle]` uses a **session-scoped** client, not service-role, and applies the
same rule to a staff viewer as to anyone else.

**A browse surface built on `createServiceClient()` would bypass that by default.** The only thing
standing between it and every private vault in the product would be the query being written
correctly — which is precisely how PR #139's idea-row exposure happened and went unnoticed for
five weeks.

Whatever is built here, the public gate must be structural, not a `WHERE` clause someone remembered.

## One modelling detail

**Publicness is project-level, not per-song.** There is no per-track public flag; every track under
a public project is visible together. An artist cannot share a single song. A discovery surface
therefore browses projects, and an invite points at one track inside a project the artist opened up.

## Related

- `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` §13
- PR #139 — the precedent for how a service-role read quietly exceeds consent
