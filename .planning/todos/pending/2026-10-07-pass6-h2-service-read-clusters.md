# Pass 6 H-2 — four service-read clusters with no structural tenant boundary

**Captured:** 2026-10-07 · **Status:** the largest unresolved item from Pass 6
**Why it is still open:** architectural. It wants a deliberation and a refactor, not a migration.

## The shape

`createServiceClient()` bypasses RLS. `requireStaff()` establishes a staff *role* but enforces no
client-book, room, object or self scope. So every narrower-than-role service read is safe **only
because its predicate is currently correct** — one omitted `.eq()` turns a local query bug into a
cross-client or cross-department disclosure.

| cluster | where | what a dropped predicate exposes |
|---|---|---|
| **A** AE / client-book | `admin/selects/page.tsx:60-70` | another AE's book |
| **B** object-by-URL then a manual relationship check | `lib/selects/persistence.ts:47-79`, `admin/client-partners/[orgId]`, `admin/clients/[personId]` | **the row is read BEFORE the check runs** — another Client Partner's org record, contacts, notes, briefs, budgets, Selects contents, licence activity |
| **C** Playbook room scope | eight pages load all rooms, compute access in TypeScript, then `.in('room_id', …)` | incidents, exception rationales, doctrine drafts, review threads, other departments' SOPs |
| **D** self scope | profile, preferences, workflow runs, learning completions, inbox | other staff members' names, phone numbers, training state |

Cluster B is the sharpest: `notFound()` prevents an existence leak, but that is **entirely
application-enforced with no RLS backstop underneath**.

## Why no migration fixes this

Adding RLS policies does nothing while the caller is `service_role`. The fix is to stop making
unscoped service reads available to general page code:

- scope reads into narrow SQL functions or repository methods that take the actor and return only
  what that actor may see
- return only the columns a surface needs
- make the raw service client unavailable to pages (lint rule or module boundary)
- behaviourally test the negative cases: unrelated AE, unrelated room member, non-owner staff,
  guessed object id

## Before building anything

This is a design decision about how staff surfaces read data, and it touches ~15 pages. It wants
`/gsd-discuss-phase` or a deliberation document, not a quick task. The four clusters probably
want different answers — D is nearly mechanical, B is not.

## Related

- `.planning/deliberations/2026-10-05-pass-6-identity-access-review.md` — H-2 in full
- [[reference_structural_checks_pass_while_wrong]] — why the negative cases must be behavioural
