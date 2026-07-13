# Phase 10: Connections & Notifications - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 13
**Analogs found:** 12 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/migrations/050_connections_note.sql` | migration | CRUD (DDL + trigger) | `supabase/migrations/035_connections_blocks.sql` | exact |
| `lib/notifications/index.ts` (extend) | service/utility | request-response | itself (extend in place) | exact |
| `types/index.ts` — `Notification` type (extend) | model | transform | itself (extend in place) | exact |
| `lib/social/connections.ts` (new) | service | CRUD | `lib/social/wall.ts` (`loadWall()`) | exact |
| `lib/social/notifications.ts` (new — type catalog) | service/config | transform | `lib/social/wall.ts` (data-shape module, no direct catalog precedent) | role-match |
| `app/api/connections/route.ts` (new) | route/controller | request-response | `app/api/follows/route.ts` | exact |
| `app/api/notifications/route.ts` (new) | route/controller | request-response + batch (mark-all-read) | `app/api/wall/route.ts` / `app/api/endorsements/route.ts` | exact |
| `app/api/follows/route.ts` (modify — add notify) | route/controller | request-response + event-driven | `app/api/antenna/opportunities/[id]/apply/route.ts` (notify side-effect pattern) | role-match |
| `app/api/wall/route.ts` (modify — add notify) | route/controller | request-response + event-driven | `app/api/antenna/opportunities/[id]/apply/route.ts` | role-match |
| `app/api/endorsements/route.ts` (modify — add notify) | route/controller | request-response + event-driven | `app/api/antenna/opportunities/[id]/apply/route.ts` | role-match |
| `app/api/release-comments/route.ts` (modify — add notify) | route/controller | request-response + event-driven | `app/api/antenna/opportunities/[id]/apply/route.ts` | role-match |
| `components/nav/NotificationBell.tsx` (new) | component | streaming (realtime) + poll | `components/profile/DmWidget.tsx` | exact (adapt: global vs. gated) |
| `components/nav/NotificationPanel.tsx` (new) | component | request-response + streaming | `components/profile/DmWidget.tsx` (panel chrome) | role-match |
| `components/profile/ConnectButton.tsx` (new) | component | request-response | `components/profile/DmWidget.tsx` (button + state toggle), `app/api/follows/route.ts` (button target semantics) | role-match |
| `app/(artist)/layout.tsx` (modify — host bell) | provider/layout | request-response | itself (extend in place) | exact |
| `__tests__/connections.test.ts` (new) | test | unit | `__tests__/capability-grant.test.ts` | exact |
| `__tests__/notification-triggers.test.ts` (new) | test | unit | `__tests__/capability-grant.test.ts` | exact |
| `__tests__/notifications-api.test.ts` (new) | test | unit | `__tests__/capability-grant.test.ts` | exact |

## Pattern Assignments

### `supabase/migrations/050_connections_note.sql` (migration)

**Analog:** `supabase/migrations/035_connections_blocks.sql`

**Existing state-machine + RLS pattern to extend** (lines 14-71 of 035, verified):
```sql
CREATE TABLE connections (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  ...
);

CREATE POLICY "connections_insert_own" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "connections_update_addressee" ON connections FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid() AND status = 'pending')
  WITH CHECK (addressee_id = auth.uid() AND status IN ('accepted', 'declined'));

CREATE POLICY "connections_update_requester_withdraw" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (requester_id = auth.uid() AND status = 'withdrawn');

REVOKE UPDATE ON connections FROM authenticated;
GRANT UPDATE (status) ON connections TO authenticated;
```

**New additive pieces this migration must add** (per RESEARCH Code Examples, follow this exact shape):
```sql
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS note TEXT
    CHECK (note IS NULL OR char_length(note) <= 200);

-- Close no_block() gap (migration 038 precedent) — re-create INSERT policy with block check.
DROP POLICY IF EXISTS "connections_insert_own" ON connections;
CREATE POLICY "connections_insert_own" ON connections FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND no_block(auth.uid(), addressee_id));

-- Auto-follow seed trigger (SECURITY DEFINER — session client cannot insert the
-- reverse-direction follows row, see RESEARCH Pitfall 1).
CREATE OR REPLACE FUNCTION public.connections_seed_follows()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.follows (follower_id, followee_id)
    VALUES (NEW.requester_id, NEW.addressee_id), (NEW.addressee_id, NEW.requester_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER connections_on_accept
  AFTER UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION public.connections_seed_follows();
```

**Column-privilege convention reference:** `supabase/migrations/031_curators_column_privileges.sql` and `034/040` establish `REVOKE ... GRANT (col)` as the standard shape used above — no new note needed, `note` should be added to the allowed UPDATE? No — `note` is set only at INSERT (request time), never updated, so no GRANT change needed for it; only `status` needs write access, already granted.

---

### `lib/notifications/index.ts` (extend in place)

**Full current file** (50 lines, read completely):
```typescript
export async function createNotification(
  service: SupabaseClient,
  args: {
    userId: string
    type: string
    title: string
    body?: string | null
    link?: string | null
    data?: Record<string, unknown>
    email?: string | null
    sendEmailCopy?: boolean
  }
): Promise<{ ok: boolean; error?: string }> {
  // ...email logic...
  const { error } = await service.from('notifications').insert({
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
    data: args.data ?? {},
    emailed,
  })
  return { ok: !error, error: error?.message }
}
```

**Required extension** (add actor-snapshot columns — Pitfall 3 in RESEARCH.md, gap already exists in migration 036 but never wired into this helper):
```typescript
    actorId?: string | null
    actorName?: string | null
    actorAvatarUrl?: string | null
  }
): Promise<{ ok: boolean; error?: string }> {
  ...
  const { error } = await service.from('notifications').insert({
    user_id: args.userId,
    type: args.type,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
    data: args.data ?? {},
    emailed,
    actor_id: args.actorId ?? null,
    actor_name: args.actorName ?? null,
    actor_avatar_url: args.actorAvatarUrl ?? null,
  })
```
Do not reimplement or wrap this function to swallow errors internally — every call site wraps in its own `try/catch` (see Pattern below). Function signature stays a plain args object, matches existing convention.

---

### `types/index.ts` — `Notification` type (extend in place, lines 671-683)

**Current type** (verified complete, 13 lines):
```typescript
export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown>
  emailed: boolean
  read: boolean
  created_at: string
}
```

**Add** (matches migration 036's actor-snapshot columns):
```typescript
  actor_id: string | null
  actor_name: string | null
  actor_avatar_url: string | null
```
This must be done in the same task as the first `createNotification()` call site that passes actor data — TS excess-property checks will fail the build otherwise (RESEARCH Pitfall 3, this is a feature not a nuisance — plan a dedicated task, don't discover it as a build break).

---

### `app/api/connections/route.ts` (new — request/accept/decline/withdraw)

**Analog:** `app/api/follows/route.ts` (full file, 38 lines, read completely)

**Structural pattern to copy** — same DEMO guard, same auth check, same shape, but Connect needs 4 actions instead of follows' 2 (follow/unfollow via POST/DELETE):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

async function mutate(request: Request, action: 'follow' | 'unfollow') {
  if (DEMO) return NextResponse.json({ data: { ok: true } })
  const { followeeId } = (await request.json().catch(() => ({}))) as { followeeId?: string }
  if (!followeeId) return NextResponse.json({ error: 'Missing followeeId' }, { status: 400 })

  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === followeeId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  if (action === 'follow') {
    const { error } = await supabase
      .from('follows')
      .upsert({ follower_id: user.id, followee_id: followeeId }, { onConflict: 'follower_id,followee_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('follows').delete()
      .eq('follower_id', user.id).eq('followee_id', followeeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: { ok: true, following: action === 'follow' } })
}

export const POST = (request: Request) => mutate(request, 'follow')
export const DELETE = (request: Request) => mutate(request, 'unfollow')
```

**Adapt for Connect:**
- POST → create request (`insert connections`, session client — RLS `connections_insert_own` covers ownership + `no_block()`)
- PATCH → accept/decline/withdraw (session client — RLS's two-policy split, `connections_update_addressee` / `connections_update_requester_withdraw`, already restricts to `status` column only per GRANT)
- **Do not use service-role client for the status transition itself** — RESEARCH Security Domain V4 explicitly warns against "helpfully" re-implementing ownership checks with a service-role client that bypasses RLS. Use `createApiClient()` (session-bound) exactly like `follows`.
- Auto-follow + `connection_accepted` notification happen server-side (trigger handles follows; the PATCH handler calls `createNotification()` after a successful accept, using a **separate service-role client** only for the notification insert, matching the antenna apply-route split of "session client for the owned mutation, service client for cross-user side effects").

---

### `app/api/notifications/route.ts` (new — GET list/unread-count, PATCH mark-all-read)

**Analog:** `app/api/wall/route.ts` and `app/api/endorsements/route.ts` (both full files read, near-identical shape)

**Pattern to copy** (DEMO guard, auth check, error shape):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], unreadCount: 0 })
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const before = searchParams.get('before')
  const limit = 20

  let query = supabase.from('notifications').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('read', false)

  return NextResponse.json({ data, unreadCount: count ?? 0 })
}

export async function PATCH(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('notifications')
    .update({ read: true }).eq('user_id', user.id).eq('read', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
```
**Cursor pagination** (`before` = ISO `created_at`) per RESEARCH Open Question #2 recommendation — race-safe under concurrent inserts, offset-based is explicitly discouraged.
**Unread count** must be a fresh `COUNT` on every call — never cached/incremented client-side (RESEARCH Anti-Patterns, STATE.md convention).

---

### `app/api/follows/route.ts`, `app/api/wall/route.ts`, `app/api/endorsements/route.ts`, `app/api/release-comments/route.ts` (modify — add notify side effect)

**Analog:** `app/api/antenna/opportunities/[opportunityId]/apply/route.ts` lines 80-98 (verified, this is the canonical wrap-at-call-site pattern)

```typescript
// 3. Cross-user writes via service client: increment slots, notify owner.
try {
  const service = createServiceClient()
  await createNotification(service, {
    userId: opportunity.created_by,
    type: 'application_received',
    title: 'New application on your opportunity',
    body: `"${project.title}" applied to ${opportunity.title}.`,
    link: `/opportunities/${opportunityId}`,
    data: { opportunityId, projectId: b.projectId },
  })
} catch {
  // Non-fatal: the application already succeeded.
}
```

**Apply this exact wrap to each of the 4 existing routes**, after their existing successful mutation, using `createServiceClient()` imported from `@/lib/supabase/server` (already used elsewhere in the codebase for service-role writes). Populate `actorId`/`actorName`/`actorAvatarUrl` per Pattern 2 in RESEARCH.md — fetch the actor's `artist_name`/`avatar_url` from `artist_profiles` before calling `createNotification()`:
```typescript
const { data: actor } = await supabase
  .from('artist_profiles')
  .select('artist_name, avatar_url')
  .eq('id', user.id)
  .single()

await createNotification(service, {
  userId: followeeId,
  type: 'new_follower',
  title: `${actor?.artist_name || 'Someone'} started following you`,
  link: `/u/${actorHandle}`,
  actorId: user.id,
  actorName: actor?.artist_name ?? null,
  actorAvatarUrl: actor?.avatar_url ?? null,
})
```
`follows` route needs the actor's handle for the `link` — fetch alongside `artist_name`/`avatar_url` in the same `.select()`.

**Note on `connection_accepted` suppression:** per RESEARCH Open Question #1, do NOT fire `new_follower` notifications for the two DB-trigger-seeded follow rows on connect-accept — only fire the single `connection_accepted` notification (to the original requester). This means the `follows` route's own notify-wrap logic never runs for trigger-seeded rows (the trigger inserts directly, bypassing the API route entirely) — no special-casing needed in `app/api/follows/route.ts` itself.

---

### `components/nav/NotificationBell.tsx` (new)

**Analog:** `components/profile/DmWidget.tsx` (full file, 180 lines, read completely) — copy the realtime-subscribe + poll-fallback lifecycle, **not** the `open`-gating.

**Realtime pattern to copy** (lines 33-54 of DmWidget), **adapted to be always-on** (D-13 — remove the `if (!open ...) return` gate):
```typescript
useEffect(() => {
  const supabase = createClient()
  const channel = supabase
    .channel(`notifications-${userId}`)  // stable, per-user — avoids TooManyChannels (RESEARCH Pitfall 5)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      payload => {
        // increment unread count / prepend to list
      }
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}, [userId])
```

**Poll-fallback pattern to copy** (lines 57-73 of DmWidget), globalized (no `open` gate):
```typescript
useEffect(() => {
  let alive = true
  const tick = async () => {
    const res = await fetch('/api/notifications?unread=true')
    if (!alive || !res.ok) return
    const json = await res.json().catch(() => ({}))
    if (typeof json.unreadCount === 'number') setUnreadCount(json.unreadCount)
  }
  tick()
  const id = setInterval(tick, 25000) // 20-30s per D-12
  return () => { alive = false; clearInterval(id) }
}, [])
```

**Key deviations from DmWidget (per RESEARCH Pitfall 5):**
- Channel name MUST be stable/per-user (`notifications-${userId}`), not random — Supabase reuses matching topic names across tabs.
- Create the Supabase client once via `useMemo`/module scope, not fresh on every effect run (DmWidget calls `createClient()` inside the effect, which is acceptable there because effects only fire on `open`/`threadId` change — a global always-mounted component should memoize instead).
- Mount once at `app/(artist)/layout.tsx` level (see below), not per-page.

---

### `components/nav/NotificationPanel.tsx` (new)

**Analog:** `components/profile/DmWidget.tsx` panel chrome (lines 116-179) — fixed-position floating panel, header, scrollable list, close button. Adapt anchor from `fixed bottom-0 right-8` (DmWidget, bottom-right) to top-right near the bell (D-08), and swap the message-composer footer for a "mark all read" action + inline Accept/Decline buttons per connection-request rows (D-10).

**List/empty-state pattern to copy** (lines 142-156 of DmWidget):
```typescript
<div className="flex max-h-[320px] min-h-[180px] flex-col gap-2 overflow-y-auto bg-ink px-4 py-4">
  {items.length === 0 ? (
    <p className="m-auto text-center text-[13px] text-lavdim">No notifications yet.</p>
  ) : (
    items.map(n => ( /* notification row */ ))
  )}
</div>
```
Inline Accept/Decline buttons on `connection_request` rows call `PATCH /api/connections/route.ts` directly (per D-10) and update panel state in place — mirrors DmWidget's optimistic `send()` update-then-reconcile pattern (lines 79-100) but for accept/decline instead of message send.

---

### `components/profile/ConnectButton.tsx` (new)

**Analog:** `components/profile/DmWidget.tsx`'s button-toggle shape (lines 117-122) for the base button styling/class convention, and `app/api/follows/route.ts` for the underlying request/response contract.

```typescript
<button
  onClick={...}
  className="inline-flex items-center gap-[9px] rounded-[11px] border border-hairstrong bg-card px-[22px] py-[13px] text-[15px] font-bold text-white"
>
  {state === 'none' ? 'Connect' : state === 'pending' ? 'Pending' : 'Connected'}
</button>
```
States per D-02/D-03: `Connect → Pending (clickable to withdraw) → Connected`; if viewer is addressee of a pending inbound request, render inline Accept/Decline instead (same row, no profile navigation required).

---

### `app/(artist)/layout.tsx` (modify — host the bell)

**Full current file** (33 lines, read completely):
```typescript
export default async function ArtistLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  let capabilities: string[] = []
  if (user) {
    const service = createServiceClient()
    const { data: grants } = await service
      .from('capability_grants')
      .select('capability')
      .eq('profile_id', user.id)
      .eq('status', 'approved')
    capabilities = (grants ?? []).map(g => g.capability)
  }
  return (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav capabilities={capabilities} />
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
```
**Add a slim header row** inside the content column, above `{children}`, hosting `<NotificationBell userId={user.id} />` — this is genuinely new layout surface (RESEARCH Pitfall 4 confirms no topbar exists today; do not search for one). `(industry)/layout.tsx` no longer exists post-Phase-15 — only this one file needs the change.

---

### `__tests__/connections.test.ts`, `__tests__/notification-triggers.test.ts`, `__tests__/notifications-api.test.ts` (new)

**Analog:** `__tests__/capability-grant.test.ts` (full file, 167 lines, read completely) — mock `@/lib/supabase/server`'s `createServiceClient`, chain-mock `.from().insert().select().single()`, assert on call args with `expect.objectContaining(...)`.

```typescript
const mockSingle = jest.fn()
const mockSelect = jest.fn(() => ({ single: mockSingle }))
const mockInsert = jest.fn(() => ({ select: mockSelect }))
const mockFrom = jest.fn((table: string) => {
  if (table === 'connections') return { insert: mockInsert }
  throw new Error(`Unexpected table in mock: ${table}`)
})
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: mockFrom }),
}))
beforeEach(() => { jest.clearAllMocks() })
```
No live DB in Jest — RLS/trigger-dependent behavior (auto-follow seed, `no_block()` wiring, unread COUNT correctness) is verified manually against the live/staging DB, matching this repo's established convention (see RESEARCH Validation Architecture).

---

## Shared Patterns

### Best-effort notification side effect (wrap-at-call-site, never modify the helper)
**Source:** `app/api/antenna/opportunities/[opportunityId]/apply/route.ts` lines 80-98
**Apply to:** All 5 mutation routes that gain a `createNotification()` call (`follows`, `wall`, `endorsements`, `release-comments`, `connections`)
```typescript
try {
  const service = createServiceClient()
  await createNotification(service, { userId, type, title, body, link, data, actorId, actorName, actorAvatarUrl })
} catch {
  // Non-fatal: the primary mutation already succeeded.
}
```

### Actor-snapshot fetch before notify
**Source:** RESEARCH Pattern 2, `lib/social/wall.ts`'s `artist_profiles` column names (`artist_name`, `avatar_url` — NOT `display_name`, a real footgun)
**Apply to:** Every new `createNotification()` call site
```typescript
const { data: actor } = await supabase
  .from('artist_profiles')
  .select('artist_name, avatar_url')
  .eq('id', user.id)
  .single()
```

### DEMO-mode short-circuit
**Source:** every existing route in `app/api/*` (`follows`, `wall`, `endorsements`, `release-comments`)
**Apply to:** `app/api/connections/route.ts`, `app/api/notifications/route.ts`
```typescript
const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
if (DEMO) return NextResponse.json({ data: { ok: true } })
```

### Session-client for owned mutation, service-client for cross-user side effect
**Source:** `app/api/antenna/opportunities/[id]/apply/route.ts` (session client inserts submission, service client updates opportunity + notifies)
**Apply to:** `app/api/connections/route.ts`'s PATCH handler (session client transitions `status`; service client fires `connection_accepted` notification)

### Realtime channel lifecycle (stable name, always cleanup)
**Source:** `components/profile/DmWidget.tsx` lines 33-54
**Apply to:** `components/nav/NotificationBell.tsx` — use per-user stable channel name (`notifications-${userId}`), always return `removeChannel` cleanup, memoize the Supabase client instance (deviation from DmWidget noted above).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/social/notifications.ts` (type catalog) | config/service | transform | No discriminated-union/catalog pattern exists elsewhere in the codebase yet; RESEARCH Pattern 3 provides the only reference shape — treat RESEARCH.md's example as canonical, not a codebase analog |

## Metadata

**Analog search scope:** `lib/`, `app/api/`, `components/nav/`, `components/profile/`, `supabase/migrations/`, `__tests__/`, `types/index.ts`
**Files scanned (read in full):** `lib/notifications/index.ts`, `app/api/follows/route.ts`, `app/api/wall/route.ts`, `app/api/endorsements/route.ts`, `app/api/release-comments/route.ts`, `app/api/antenna/opportunities/[id]/apply/route.ts` (partial), `components/profile/DmWidget.tsx`, `lib/social/wall.ts`, `app/(artist)/layout.tsx`, `components/nav/icons.tsx`, `__tests__/capability-grant.test.ts`, `types/index.ts` (partial), `supabase/migrations/035_connections_blocks.sql` (partial)
**Pattern extraction date:** 2026-07-12
