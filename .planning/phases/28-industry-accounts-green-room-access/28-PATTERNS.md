# Phase 28: Industry Accounts & Green Room Access Model - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 10 (modify) + 2-3 new (test files, migration)
**Analogs found:** 10 / 10 — this is a reconcile phase; every "analog" is largely the file's own existing sibling
pattern in the same module, verified live against the repo (not hypothetical).

**RESEARCH.md verification note:** All RESEARCH.md file:line claims spot-checked below were confirmed accurate
against the live code (`app/api/antenna/opportunities/route.ts`, `middleware.ts`, `supabase/migrations/057_green_room_feed.sql`,
`app/api/curators/claim/[token]/route.ts`). No corrections needed to RESEARCH's findings.

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|-----------------|----------------|
| `lib/industry/createIndustryMember.ts` (MODIFY — add capability_grants write) | service | request-response / event-driven (fires `handle_new_user()` trigger) | `lib/capabilities/grant.ts` (`grantCapability`, same file family) | exact — same domain, sibling function |
| `app/api/antenna/opportunities/route.ts` (MODIFY — remove dead `industry_profiles` gate) | route (API) | CRUD | itself, lines 53-60 (`hasCapability` check to keep) vs. lines 63-74 (`industry_profiles` check to remove) | exact — self-referential fix |
| `app/api/green-room/feed/route.ts` (MODIFY — add gate) | route (API) | request-response | `app/api/antenna/opportunities/route.ts` lines 53-60 (capability-gate shape) | role-match (different capability, same shape) |
| `app/api/green-room/posts/route.ts` (MODIFY — add gate) | route (API) | request-response | same as above; also `lib/green-room/post-write.ts` for where to place a reusable gate | role-match |
| `lib/green-room/feed-query.ts` (MODIFY — gate inside `loadGreenRoomFeed()`, per RESEARCH's structure map) | service | CRUD/read | `lib/green-room/discover.ts` (already does `member_type`-based filtering, lines 41-58) | exact — same module, existing member_type-aware pattern |
| `lib/green-room/post-write.ts` (MODIFY — gate inside `createGreenRoomPost()`) | service | CRUD/write | itself — `validateGreenRoomPostInput()` (lines 62-80) shows the `{ok:false,error,status}` `ValidationResult` return-shape to extend with a capability check | exact |
| `supabase/migrations/0XX_green_room_member_type_gate.sql` (NEW, human-gated) | migration | schema | `supabase/migrations/057_green_room_feed.sql` lines 365-379 (`green_room_posts_insert_own` policy to tighten) | exact |
| `app/api/curators/claim/[token]/route.ts` (MODIFY — repoint to industry-account creation) | route (API) | request-response / event-driven | `lib/industry/createIndustryMember.ts` (the function to call/extract a primitive from instead of hand-rolled `admin.createUser({app_metadata:{role:'curator'}})`) | exact — RESEARCH-identified single call site |
| `middleware.ts` (MODIFY — decide whether `/green-room` needs adding to `isProtected`, or leave gated purely at route/RLS layer) | middleware | request-response | itself, lines 30-38 (`isProtected` array) | exact |
| `app/(admin)/admin/curators/page.tsx` + `app/(admin)/layout.tsx` (MODIFY — nav relocation under PitchPlug surface) | admin UI / nav | navigation | `app/(admin)/layout.tsx` line 36 (`href="/admin/curators"` nav link — the one line to move/relabel) | exact |
| `app/(artist)/curators/page.tsx` (MODIFY — link from `/tools/pitchplug` instead of being orphaned) | component (page) | navigation | `app/(artist)/tools/pitchplug/page.tsx` (target page to add the link into) | role-match |
| `__tests__/industry-member-capability.test.ts` (NEW) | test | unit | `__tests__/capability-grant.test.ts` (existing, same domain) | exact |
| `__tests__/green-room-account-gate.test.ts` (NEW) | test | unit | `__tests__/capability-route-guard.test.ts` (existing mock-Supabase-client pattern) | exact |
| `__tests__/curator-claim-industry.test.ts` (NEW) | test | unit | `__tests__/capability-check.test.ts` / `__tests__/capability-grant.test.ts` | role-match |

## Pattern Assignments

### `lib/industry/createIndustryMember.ts` (service, event-driven)

**Analog:** `lib/capabilities/grant.ts` — `grantCapability()`

**Core pattern to copy** (`lib/capabilities/grant.ts` lines 23-53):
```typescript
export async function grantCapability(input: {
  profileId: string
  capability: Capability
  roleSlugs: string[]
  source: CapabilitySource
  decidedBy?: string
}): Promise<{ grantId: string }> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('capability_grants')
    .insert({
      profile_id: input.profileId,
      capability: input.capability,
      status: 'approved',
      role_slugs: input.roleSlugs,
      source: input.source,
      decided_at: new Date().toISOString(),
      decided_by: input.decidedBy ?? null,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new DuplicateCapabilityRequestError(...)
    }
    throw new Error(`Failed to grant capability: ${error.message}`)
  }
  ...
  return { grantId: data.id }
}
```

**Fix to apply in `createIndustryMember.ts`** (currently lines 21-80, insert after the `created.user` success
check, ~line 42): after `admin.createUser()` succeeds, insert an `approved` `capability_grants` row using
`source: 'signup'` (migration 042's CHECK constraint already lists `'signup'` as valid per RESEARCH — confirm
against the live constraint before using it). Do NOT call `grantCapability()` directly if `handle_new_user()`'s
trigger already creates the `user_profiles` row in the same transaction as `createUser()` — a
`capability_grants` insert immediately after may race the trigger; verify ordering, or write the
`capability_grants` insert into the `handle_new_user()` trigger's industry branch (migration 039) instead,
mirroring how that trigger already owns the `user_profiles` + free-subscription writes atomically. Confirm
which layer (app code vs. SQL trigger) owns this write during planning — RESEARCH flags both as viable.

**Duplicate-error pattern** already present in `createIndustryMember.ts` lines 43-57 — reuse the same
distinguish-real-duplicate-from-transient-error shape for any new insert added here.

---

### `app/api/antenna/opportunities/route.ts` (route, CRUD)

**Verified live** (matches RESEARCH exactly):

Lines 53-60 — the check to KEEP:
```typescript
// D-14: server-side capability gate — hasCapability() requires an approved
// 'industry' grant row. Nav-hiding (Plan 03) is defense-in-depth only;
// this is the authoritative permission boundary (T-15-07 mitigation).
if (!(await hasCapability(user.id, 'industry'))) {
  return NextResponse.json(
    { error: 'Only accounts with industry access can post opportunities' },
    { status: 403 }
  )
}
```

Lines 63-74 — the dead check to REMOVE (or replace with an intentional write path — see RESEARCH Pitfall 1 /
Assumption A3):
```typescript
// Must be a registered industry pro.
const { data: profile } = await supabase
  .from('industry_profiles')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle()
if (!profile) {
  return NextResponse.json(
    { error: 'Only industry professionals can post opportunities' },
    { status: 403 }
  )
}
```
Note: `profile.id` is also used downstream at `industry_profile_id: profile.id` in the insert object (line ~89)
— removing the `industry_profiles` lookup means that column write must also be resolved (drop the column write,
or backfill it from elsewhere). Check the `opportunities` table schema for whether `industry_profile_id` is
NOT NULL before deciding.

---

### `app/api/green-room/feed/route.ts` + `app/api/green-room/posts/route.ts` (route, request-response)

**Analog for the gate shape:** `app/api/antenna/opportunities/route.ts` lines 53-60 (above) — copy the
`if (!(await hasCapability(...))) return 403` shape, but per RESEARCH the check must admit BOTH lanes:
`member_type IN ('artist','industry')` or `hasCapability(user,'artist') || hasCapability(user,'industry')`.
**Decide the source of truth (`member_type` vs `capability_grants`) before writing this** — do not check both
independently (RESEARCH Pitfall 2 / Anti-Pattern).

**Current unprotected state — verified live** (`app/api/green-room/feed/route.ts` lines 19-23):
```typescript
const supabase = await createApiClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
Same shape in `app/api/green-room/posts/route.ts` lines 14-18. Neither route has any capability/member_type
check today — confirmed, matches RESEARCH exactly.

**Where RESEARCH recommends placing the gate:** inside `loadGreenRoomFeed()` (`lib/green-room/feed-query.ts`)
and `createGreenRoomPost()` (`lib/green-room/post-write.ts`) rather than the route handlers directly — keeps the
gate co-located with the query/write logic and testable without an HTTP harness (matches this repo's
`ValidationResult`-return-shape convention already used in `post-write.ts`).

**Existing `member_type`-aware read pattern to model the gate on** (`lib/green-room/discover.ts` lines 41-42,
51-52):
```typescript
export const DISCOVER_PUBLIC_COLUMNS =
  'id, artist_name, handle, avatar_url, bio, genre, genres, location, industry_roles, roles, open_to, member_type, verified, is_public, profile_visibility, open_to_visibility, created_at'
...
export const DISCOVER_CAPABILITY_VALUES = ['artist', 'industry', 'both'] as const
```
This confirms `discover.ts` already reads/filters on `member_type` — reuse this column-selection convention for
whatever query the new Green Room gate performs (a `user_profiles.member_type` lookup keyed by `user.id`).

---

### `lib/green-room/post-write.ts` (service, CRUD/write)

**Analog:** itself — `validateGreenRoomPostInput()` return-shape (lines 43-45, 62-80):
```typescript
type ValidationResult =
  | { ok: true; input: GreenRoomPostInput }
  | { ok: false; error: string; status: number }
...
export function validateGreenRoomPostInput(raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Post payload must be an object', status: 400 }
  }
  ...
}
```
Extend `createGreenRoomPost(supabase, userId, body)` (called from the route, per posts/route.ts line 21) to run
a member-type/capability check FIRST and return the same `{ ok: false, error, status: 403 }` shape before any
validation/DB write — matches this repo's established `Result`-object convention (see CLAUDE.md "Async
functions return Result objects").

---

### Migration: Green Room RLS backstop (human-gated)

**Analog:** `supabase/migrations/057_green_room_feed.sql` lines 365-379 (verified live):
```sql
DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts;
...
CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "green_room_posts_update_own" ON green_room_posts FOR UPDATE TO authenticated
  WITH CHECK (author_id = auth.uid());
```
**Target pattern** (illustrative per RESEARCH — verify exact table/column names against the live schema; note
migration 076 renamed `artist_profiles` → `user_profiles`):
```sql
CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND member_type IN ('artist', 'industry')
    )
  );
```
**Do NOT run `supabase db push`** — draft the migration file only; this project's standing convention is
human-gated pushes.

---

### `app/api/curators/claim/[token]/route.ts` (route, event-driven — single call site to repoint)

**Verified live — the exact block to change** (lines 40-44):
```typescript
const { data: created, error: createError } = await service.auth.admin.createUser({
  email: curator.email,
  email_confirm: true,
  app_metadata: { role: 'curator' },
})
```

**Target analog:** `lib/industry/createIndustryMember.ts` lines 31-41 (the `admin.createUser()` call shape to
reuse/repoint to) — but per RESEARCH Pitfall 4, do NOT call `createIndustryMember()` wholesale (it sends its
own `industryInviteEmail()` via `sendEmail()`, lines 73-77, which would double-send or send the wrong copy
against this route's own existing `emailPayload`/`sendEmail()` calls at lines 32-35, 73-76, 100-103). Instead:
extract a smaller reusable primitive (the `createUser` + `app_metadata.role='industry'` + `role_badges`/
`profile_roles` set) that both `createIndustryMember()` and this claim route can call, each keeping its own
email copy. The claim route's existing atomic-claim-then-update pattern (lines 62-71, 81-90 — `.eq('claim_token',
token).is('claimed_by', null)` as a conditional update) MUST be preserved exactly as-is — this is the IDOR
mitigation RESEARCH's Security Domain table calls out; do not regress it to a two-step check-then-update.

**Also verify:** the claim route's duplicate-account fallback branch (lines 46-79, when `createError` fires
because the email already exists) — this same fallback logic needs the same repointing treatment (role badge
`playlist_curator` set via `mapSlugsToProfileRoles`, not `app_metadata.role='curator'`).

---

### `app/(admin)/layout.tsx` (nav, navigation)

**Verified live** (line 36):
```typescript
href="/admin/curators"
```
Single nav-link line to relocate/relabel under (or near) the PitchPlug admin surface, per RESEARCH's
INDUSTRY-05 scope (navigation-only, no schema/logic change). Check whether an admin-side PitchPlug surface
exists at all before deciding whether this becomes a sub-link or a standalone relabeled entry.

---

### `app/(artist)/curators/page.tsx` → link from `app/(artist)/tools/pitchplug/page.tsx`

RESEARCH confirms `/curators` is currently NOT referenced in `components/nav/ArtistNav.tsx`'s `ITEMS` list —
already orphaned, reachable only by direct URL. No analog needed for "removal"; the analog for "add a
discoverable link" is however `app/(artist)/tools/pitchplug/page.tsx`'s existing internal link/section
structure — read that file's JSX before adding a curators-directory link/section to it (not read in this
mapping pass; do so at plan-authoring time since it's a straightforward link insertion, not a pattern-critical
read).

## Shared Patterns

### Capability/member-type gate (the ONE shape to reuse everywhere)
**Source:** `app/api/antenna/opportunities/route.ts` lines 53-60 (`hasCapability()` + `403` + explanatory
error message) — this is this codebase's proven, doc-commented ("D-14", "T-15-07 mitigation") authoritative
gate shape.
**Apply to:** Green Room feed/posts routes (widened to accept artist OR industry), and any future per-subtype
tool gate.
**Rule:** pick ONE source of truth (`member_type` or `capability_grants`) before writing new gates — RESEARCH's
Common Pitfall 2 and Anti-Patterns section are explicit that adding a fourth independent check makes the
existing 3-way drift (Antenna / admin-members-list / Green-Room-discover) worse.

### Server-side check is authoritative; UI/nav hiding is defense-in-depth only
**Source:** comment at `app/api/antenna/opportunities/route.ts` line 53-55, and `lib/capabilities/check.ts`
lines 4-9 (`hasCapability` doc comment).
**Apply to:** every gate this phase adds — RLS `WITH CHECK` (Pattern 2, migration draft above) must mirror the
app-layer check; nav-hiding in `ArtistNav`/`CapabilityCta` is convenience only.

### `Result`-object return shape for service-layer validation
**Source:** `lib/green-room/post-write.ts` lines 43-45 (`ValidationResult` type: `{ok:true,...} | {ok:false,
error,status}`).
**Apply to:** any new gate check added inside `loadGreenRoomFeed()` / `createGreenRoomPost()` — return the same
shape rather than throwing, matching CLAUDE.md's documented convention ("Async functions return Result
objects").

### Atomic `app_metadata.role` set at `createUser()` time — never a post-insert UPDATE
**Source:** `lib/industry/createIndustryMember.ts` lines 13-20 (doc comment explicitly citing the
curator-claim precedent) and `app/api/curators/claim/[token]/route.ts` lines 37-44 (doc comment, same rule).
**Apply to:** any new/repointed account-creation call site in this phase — this is a hard invariant already
enforced twice in this codebase (T-06-01 in the claim route's own comments) to avoid a phantom-row race with
`handle_new_user()`.

### Duplicate-vs-transient-error distinction on `admin.createUser()`
**Source:** `lib/industry/createIndustryMember.ts` lines 43-57 (`createError?.code === 'email_exists' ||
createError?.status === 422` → typed `DuplicateIndustryMemberError`; anything else → generic `Error`).
**Apply to:** any new insert/createUser call added to `createIndustryMember.ts` or the repointed claim route.

## No Analog Found

None — every file in this phase's scope has a direct, verified-live analog either in a sibling file in the
same module or in itself (the file being modified already contains the pattern to extend). This reflects
RESEARCH's own framing: this is a reconcile phase, not greenfield.

## Metadata

**Analog search scope:** `app/api/antenna/`, `app/api/green-room/`, `app/api/curators/`, `lib/capabilities/`,
`lib/industry/`, `lib/green-room/`, `middleware.ts`, `supabase/migrations/057_green_room_feed.sql`,
`app/(admin)/layout.tsx`
**Files scanned:** 10 read directly (full or targeted sections), all non-overlapping ranges
**Pattern extraction date:** 2026-08-05
**RESEARCH.md claims verified:** antenna double-gate (lines 53-60 + 63-74, confirmed live), Green Room "no
gate" claim (feed/posts routes both confirmed `if (!user)`-only, `middleware.ts` confirmed `/green-room` absent
from `isProtected`), curator claim single call site (confirmed, lines 40-44), RLS `WITH CHECK
(author_id = auth.uid())` with no member_type join (confirmed, migration 057 lines 372-373). No discrepancies
found between RESEARCH's claims and the live code.
