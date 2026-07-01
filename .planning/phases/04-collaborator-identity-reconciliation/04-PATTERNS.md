# Phase 04: Collaborator Identity Reconciliation - Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 11 new/modified files
**Analogs found:** 11 / 11

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/026_collaborator_identity_reconciliation.sql` | migration | batch | `supabase/migrations/001_initial_schema.sql` + `018_collaborators_split_sheets.sql` | exact |
| `app/api/claim-collaborators/route.ts` | route | request-response | `app/api/collaborators/route.ts` | role-match |
| `app/api/user-profiles/route.ts` | route | request-response | `app/api/profile/route.ts` | exact |
| `lib/collaborators/index.ts` (extend) | utility | transform | self (extend) | exact |
| `components/collaborators/CollaboratorCard.tsx` (extend) | component | request-response | self (extend) | exact |
| `components/collaborators/CollaboratorRoster.tsx` (extend) | component | request-response | self (extend) | exact |
| `components/collaborators/CollaboratorPicker.tsx` (extend) | component | request-response | self (extend) | exact |
| `app/(artist)/collaborators/page.tsx` (extend) | page | request-response | self (extend) | exact |
| `app/(artist)/dashboard/page.tsx` (extend) | page | request-response | self (extend) | exact |
| `app/(artist)/settings/page.tsx` (extend) | page | request-response | self (extend) | exact |
| `middleware.ts` (extend) | middleware | request-response | self (extend) | exact |

---

## Pattern Assignments

### `supabase/migrations/026_collaborator_identity_reconciliation.sql` (migration, batch)

**Analogs:** `supabase/migrations/001_initial_schema.sql` (trigger + SECURITY DEFINER pattern), `supabase/migrations/018_collaborators_split_sheets.sql` (collaborators RLS pattern), `supabase/migrations/019_collaborator_name_fields.sql` (ADD COLUMN IF NOT EXISTS pattern)

**DB trigger pattern** (`001_initial_schema.sql` lines 354-366):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Column addition pattern** (`019_collaborator_name_fields.sql` — ADD COLUMN IF NOT EXISTS):
```sql
ALTER TABLE collaborators
  ADD COLUMN IF NOT EXISTS claimed_by    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archived_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_favorite   BOOLEAN NOT NULL DEFAULT false;
```

**RLS policy pattern** (`018_collaborators_split_sheets.sql`):
```sql
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists manage own collaborators" ON collaborators
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- New Phase 4 policy (same table, additional SELECT):
CREATE POLICY "Claimed users see own credits" ON collaborators
  FOR SELECT
  USING (auth.uid() = claimed_by);
```

**Complete migration structure to produce:**
1. `user_profiles` table with RLS (keyed by `auth.users.id`, fields: pro, ipi, publisher, phone, mailing_address, display_name, bio)
2. `ALTER TABLE collaborators` — add `claimed_by`, `archived_at`, `is_favorite`
3. `ALTER TABLE artist_profiles` — add `claimed_at TIMESTAMPTZ`
4. Functional index: `CREATE INDEX idx_collaborators_lower_email ON collaborators (LOWER(email))`
5. Index: `CREATE INDEX idx_collaborators_claimed_by ON collaborators (claimed_by)`
6. New RLS policy: `"Claimed users see own credits"` on `collaborators` FOR SELECT USING `auth.uid() = claimed_by`
7. `CREATE OR REPLACE FUNCTION public.claim_collaborators(p_user_id UUID, p_email TEXT)` — SECURITY DEFINER, UPDATE collaborators WHERE LOWER(email) = LOWER(p_email) AND claimed_by IS NULL, then back-fill from user_profiles using COALESCE
8. `CREATE OR REPLACE FUNCTION public.backfill_claimed_collaborators(p_user_id UUID)` — SECURITY DEFINER, UPDATE collaborators SET pro=COALESCE(pro, v_pro), ... WHERE claimed_by = p_user_id
9. `CREATE OR REPLACE FUNCTION public.handle_new_user()` — extend to call `PERFORM public.claim_collaborators(NEW.id, NEW.email)` after existing inserts (no new trigger needed — `on_auth_user_created` already exists)

---

### `app/api/claim-collaborators/route.ts` (route, request-response)

**Analog:** `app/api/collaborators/route.ts`

**Imports pattern** (`app/api/collaborators/route.ts` lines 1-3):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sanitizeCollaborator } from '@/lib/collaborators'
```

**Auth pattern** (`app/api/collaborators/route.ts` lines 8-13):
```typescript
const supabase = createApiClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

**Core pattern for `POST /api/claim-collaborators`:**
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  // Step 1: validate session via createApiClient (never trust client-supplied IDs)
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Step 2: use service client for the cross-user RPC write
  const service = createServiceClient()
  const { error } = await service.rpc('claim_collaborators', {
    p_user_id: user.id,
    p_email: user.email ?? '',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Step 3: mark claimed_at so middleware stops checking
  await service
    .from('artist_profiles')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
```

**`createServiceClient` pattern** (`lib/supabase/server.ts` lines 14-19):
```typescript
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
```

---

### `app/api/user-profiles/route.ts` (route, request-response)

**Analog:** `app/api/profile/route.ts` (exact match — same EDITABLE_FIELDS + sanitize + PATCH pattern)

**EDITABLE_FIELDS pattern** (`app/api/profile/route.ts` lines 8-34):
```typescript
const EDITABLE_FIELDS = [
  'artist_name',
  'genre',
  // ...
] as const

function sanitize(body: Record<string, unknown>): Partial<ArtistProfile> {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update as Partial<ArtistProfile>
}
```

**PATCH handler pattern** (`app/api/profile/route.ts` lines 98-120):
```typescript
export async function PATCH(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitize(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('artist_profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

**Adaptation for `user-profiles`:**
- Replace `EDITABLE_FIELDS` with `USER_PROFILES_EDITABLE_FIELDS = ['pro', 'ipi', 'publisher', 'phone', 'mailing_address', 'display_name', 'bio'] as const`
- Replace `.from('artist_profiles')` with `.from('user_profiles')`
- After the successful update, call `createServiceClient().rpc('backfill_claimed_collaborators', { p_user_id: user.id })` (fire-and-forget — do not block the response on back-fill errors)
- Add a GET handler following the same `createApiClient()` → `getUser()` → `.from('user_profiles').select('*').eq('id', user.id).maybeSingle()` pattern from `app/api/collaborators/route.ts` lines 8-23

---

### `lib/collaborators/index.ts` (extend, utility, transform)

**Analog:** Self — extend the existing file.

**Existing type pattern** (`lib/collaborators/index.ts` lines 22-40):
```typescript
export type CollaboratorProfile = {
  id: string
  user_id: string
  name: string
  // ...
  created_at: string
  updated_at: string
}
```

**Extension — add new fields to `CollaboratorProfile`:**
```typescript
export type CollaboratorProfile = {
  // ... existing fields ...
  claimed_by?: string | null      // auth.users.id of the Funūn member who claimed this row
  archived_at?: string | null     // soft-delete timestamp; null = active
  is_favorite?: boolean           // pinned in picker Favorites group
}
```

**Extend `COLLABORATOR_EDITABLE_FIELDS`** (`lib/collaborators/index.ts` lines 6-20):
```typescript
export const COLLABORATOR_EDITABLE_FIELDS = [
  'name',
  // ... existing fields ...
  'is_favorite',   // new: star toggle
  'archived_at',   // new: archive/unarchive (set to ISO string or null)
] as const
```

**New helper — `isClaimedCollaborator`:**
```typescript
// Predicate functions prefixed with 'is' per naming convention
export function isClaimedCollaborator(c: CollaboratorProfile): boolean {
  return Boolean(c.claimed_by)
}
```

**Existing sanitizer pattern to follow** (`lib/collaborators/index.ts` lines 53-77) — add handling for `is_favorite` (boolean) and `archived_at` (string | null) in `sanitizeCollaborator`.

---

### `components/collaborators/CollaboratorCard.tsx` (extend, component, request-response)

**Analog:** Self — extend the existing file.

**Existing card pattern** (`components/collaborators/CollaboratorCard.tsx` lines 1-56) — copy the entire file structure, then:

**Extend Props** (after line 10):
```typescript
type Props = {
  collaborator: CollaboratorProfile
  onEdit: () => void
  onArchive?: () => void    // new: replaces onDelete for claimed rows
  onDelete?: () => void     // new: for unclaimed rows
  onFavoriteToggle?: () => void  // new: star button
}
```

**Claimed-state conditional rendering** (replace Edit button block at lines 47-53):
```typescript
const isClaimed = Boolean(collaborator.claimed_by)

{/* Funūn member badge — replaces IPI badge for claimed rows */}
{isClaimed && (
  <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
    Funūn member
  </span>
)}

{/* Favorite star — top-right */}
<button
  type="button"
  onClick={onFavoriteToggle}
  aria-label={collaborator.is_favorite ? 'Unstar' : 'Star'}
  className="absolute right-4 top-3 text-white/30 hover:text-amber-300"
>
  {collaborator.is_favorite ? '★' : '☆'}
</button>

{/* Archive vs Delete button — bottom-right, same position as Edit */}
{isClaimed ? (
  <button type="button" onClick={onArchive}
    className="absolute bottom-3 right-4 text-xs text-white/50 hover:text-amber-300">
    Archive
  </button>
) : (
  <button type="button" onClick={onDelete}
    className="absolute bottom-3 right-4 text-xs text-white/50 hover:text-red-400">
    Delete
  </button>
)}
```

**Badge pattern** (existing badge at lines 36-44 — reuse `border-brandindigo/30 bg-brandindigo/10 text-brandindigo` for "IPI on file" and "Funūn member"):
```typescript
<span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-3 py-1 text-xs font-bold text-brandindigo">
  IPI on file
</span>
```

---

### `components/collaborators/CollaboratorRoster.tsx` (extend, component, request-response)

**Analog:** Self — extend the existing file.

**Existing state pattern** (`components/collaborators/CollaboratorRoster.tsx` lines 17-19):
```typescript
const [creating, setCreating] = useState(false)
const [editingId, setEditingId] = useState<string | null>(null)
const [list, setList] = useState<CollaboratorProfile[]>(collaborators)
```

**Extended Props for two-section layout:**
```typescript
type Props = {
  collaborators: CollaboratorProfile[]   // My Roster (user_id = auth.uid())
  credits: CollaboratorProfile[]         // My Credits (claimed_by = auth.uid())
}
```

**Extend state for Archived toggle and active tab:**
```typescript
const [showArchived, setShowArchived] = useState(false)
const [activeSection, setActiveSection] = useState<'roster' | 'credits'>('roster')
```

**Filtered roster derivation** (insert before return):
```typescript
const activeRoster = list.filter(c =>
  showArchived ? Boolean(c.archived_at) : !c.archived_at
)
const favorites = activeRoster.filter(c => c.is_favorite)
const nonFavorites = activeRoster.filter(c => !c.is_favorite)
```

**Archive handler pattern** (following existing `handleSaved` at lines 21-33):
```typescript
async function handleArchive(id: string) {
  await fetch(`/api/collaborators/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  })
  setList(prev => prev.map(c => c.id === id ? { ...c, archived_at: new Date().toISOString() } : c))
}

async function handleFavoriteToggle(collab: CollaboratorProfile) {
  await fetch(`/api/collaborators/${collab.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_favorite: !collab.is_favorite }),
  })
  setList(prev => prev.map(c => c.id === collab.id ? { ...c, is_favorite: !c.is_favorite } : c))
}
```

**Two-section layout structure** (following existing single-section layout from lines 35-126):
- Section tabs or headings: "My Credits" | "My Roster" — planner decides tabs vs. scroll sections (Claude's Discretion)
- My Roster: existing grid + Archived toggle above grid + Archive/Unarchive callback to cards
- My Credits: read-only list showing project name, artist name, role, split — no Edit button

---

### `components/collaborators/CollaboratorPicker.tsx` (extend, component, request-response)

**Analog:** Self — extend the existing file.

**Existing filtered list pattern** (`components/collaborators/CollaboratorPicker.tsx` lines 51-53):
```typescript
const filtered = roster.filter(c =>
  assembleDisplayName(c).toLowerCase().includes(search.toLowerCase())
)
```

**Extend with Favorites + Most Recent grouping** (replace `filtered` derivation):
```typescript
// Filter out archived collaborators from the picker
const active = roster.filter(c => !c.archived_at)

const favorites = active.filter(c => c.is_favorite && assembleDisplayName(c).toLowerCase().includes(search.toLowerCase()))
const recentNonFav = active
  .filter(c => !c.is_favorite)
  .slice(0, 5)  // API returns ordered by created_at DESC; first 5 are Most Recent
  .filter(c => assembleDisplayName(c).toLowerCase().includes(search.toLowerCase()))
const rest = active
  .filter(c => !c.is_favorite)
  .slice(5)
  .filter(c => assembleDisplayName(c).toLowerCase().includes(search.toLowerCase()))
```

**Group header pattern** (follow existing list item style at lines 125-138):
```typescript
{favorites.length > 0 && (
  <>
    <li className="px-4 py-1 text-[10px] uppercase tracking-wide text-white/30">Favorites</li>
    {favorites.map(collab => <CollaboratorPickerItem key={collab.id} collab={collab} onSelect={handleSelect} />)}
  </>
)}
{recentNonFav.length > 0 && (
  <>
    <li className="px-4 py-1 text-[10px] uppercase tracking-wide text-white/30">Most Recent</li>
    {recentNonFav.map(collab => <CollaboratorPickerItem key={collab.id} collab={collab} onSelect={handleSelect} />)}
  </>
)}
{rest.map(collab => <CollaboratorPickerItem key={collab.id} collab={collab} onSelect={handleSelect} />)}
```

**Picker API fetch** — add `order=created_at.desc` query param to `/api/collaborators` GET call (or rely on server-side ordering added to that route for Most Recent grouping).

---

### `app/(artist)/collaborators/page.tsx` (extend, page, request-response)

**Analog:** Self — extend. Copy existing structure (`collaborators/page.tsx` lines 1-33).

**Existing fetch pattern** (`collaborators/page.tsx` lines 9-18):
```typescript
const supabase = createServerClient()
const {
  data: { user },
} = await supabase.auth.getUser()

const { data } = await supabase
  .from('collaborators')
  .select('*')
  .eq('user_id', user?.id ?? '')
  .order('name', { ascending: true })
```

**Add second query for Credits section** (add after existing query):
```typescript
// My Credits: rows where this user is the claimed collaborator (cross-user read)
// RLS policy "Claimed users see own credits" makes this safe without service role
const { data: creditsData } = await supabase
  .from('collaborators')
  .select(`
    id, name, pro, ipi, claimed_by, user_id,
    split_sheet_parties (
      split_percentage, role,
      split_sheets (
        song_name, vault_project_id
      )
    )
  `)
  .eq('claimed_by', user?.id ?? '')
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  .limit(20)

const credits = (creditsData ?? []) as CollaboratorProfile[]
```

**Pass both props to client component** (extend `CollaboratorRoster` call):
```typescript
<CollaboratorRoster collaborators={collaborators} credits={credits} />
```

---

### `app/(artist)/dashboard/page.tsx` (extend, page, request-response)

**Analog:** Self — extend. Copy existing server component query pattern (lines 32-50).

**Existing query pattern** (`dashboard/page.tsx` lines 37-50):
```typescript
const supabase = createServerClient()
const {
  data: { user },
} = await supabase.auth.getUser()

const { data } = await supabase
  .from('vault_projects')
  .select(`...`)
  .eq('user_id', user?.id ?? '')
  .order('created_at', { ascending: false })
```

**Add Credits preview query** (add after existing query, inside the `else` block):
```typescript
// Credits preview: compact count + sample rows for dashboard card
const { data: creditsPreview } = await supabase
  .from('collaborators')
  .select('id, name, split_sheet_parties(role, split_sheets(song_name))')
  .eq('claimed_by', user?.id ?? '')
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  .limit(3)

const creditsCount = creditsPreview?.length ?? 0
```

**StatCard pattern** (`dashboard/page.tsx` lines 16-24) — reuse for Credits preview card:
```typescript
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
    </div>
  )
}
```

**Credits preview render** (add below existing stats cards, conditional on `creditsCount > 0`):
```typescript
{creditsCount > 0 && (
  <section className="mt-8">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wide">My Credits</h2>
      <Link href="/collaborators" className="text-xs text-brandindigo hover:underline">View all</Link>
    </div>
    {/* sample rows — creditsPreview slice */}
  </section>
)}
```

---

### `app/(artist)/settings/page.tsx` (extend, page, request-response)

**Analog:** Self — extend. Existing page reads from `artist_profiles` and passes to `ProfileForm`.

**Existing fetch pattern** (`settings/page.tsx` lines 52-60 partial — read-only, extend to add `user_profiles` fetch):
```typescript
const supabase = createServerClient()
const {
  data: { user },
} = await supabase.auth.getUser()
// Existing: fetch artist_profiles
// New: also fetch user_profiles
const { data: userProfileData } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('id', user?.id ?? '')
  .maybeSingle()
```

**Pass `userProfile` to `ProfileForm`** — the form must be told which endpoint to write identity fields to (`/api/user-profiles` PATCH vs. `/api/profile` PATCH for artist-specific fields). The settings page currently sends everything to `/api/profile`.

---

### `middleware.ts` (extend, middleware, request-response)

**Analog:** Self — extend. Existing middleware is 41 lines.

**Existing session + route guard pattern** (`middleware.ts` lines 5-37):
```typescript
export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  if (process.env.NEXT_PUBLIC_VAULT_DEMO === 'true') return res

  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl
  const isAuthRoute = pathname.startsWith('/signin') || pathname.startsWith('/signup')
  const isProtected = pathname.startsWith('/vault') || /* ... */

  if (isProtected && !session) {
    const url = new URL('/signin', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/vault', req.url))
  }
  return res
}
```

**Claim check extension** (insert after the `if (isAuthRoute && session)` block, before `return res`):
```typescript
// Phase 4: fire claim completion for users whose collaborator rows haven't been
// linked yet. Short-circuits once collaborators_claimed is in user metadata.
if (session && !isAuthRoute && !session.user.user_metadata?.collaborators_claimed) {
  // Fire-and-forget — non-blocking, retries on next request if it fails
  fetch(`${req.nextUrl.origin}/api/claim-collaborators`, {
    method: 'POST',
    headers: { cookie: req.headers.get('cookie') ?? '' },
  }).catch(() => {
    // Non-blocking — will retry on next navigation
  })
}
```

**Note:** The claim API validates the session server-side via `createApiClient().auth.getUser()` — the cookie header is forwarded so the session is available. Do NOT pass user ID in custom headers (security anti-pattern documented in RESEARCH.md).

---

## Shared Patterns

### Auth Guard (all API routes)
**Source:** `app/api/collaborators/route.ts` lines 8-13
```typescript
const supabase = createApiClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
**Apply to:** `app/api/claim-collaborators/route.ts`, `app/api/user-profiles/route.ts`

### Service Role Client (cross-user writes)
**Source:** `lib/supabase/server.ts` lines 14-19
```typescript
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
```
**Apply to:** `app/api/claim-collaborators/route.ts` — use after session validation via `createApiClient()`.

### EDITABLE_FIELDS Allowlist + Sanitizer (mass-assignment defense)
**Source:** `app/api/profile/route.ts` lines 8-96 and `lib/collaborators/index.ts` lines 6-77
```typescript
const EDITABLE_FIELDS = ['field1', 'field2'] as const

function sanitize(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update
}
```
**Apply to:** `app/api/user-profiles/route.ts` (define `USER_PROFILES_EDITABLE_FIELDS`)

### Server Component Fetch Pattern (pages)
**Source:** `app/(artist)/collaborators/page.tsx` lines 1-33 and `app/(artist)/dashboard/page.tsx` lines 26-50
```typescript
export const dynamic = 'force-dynamic'

export default async function PageName() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('table').select('*').eq('user_id', user?.id ?? '')
  // ...
}
```
**Apply to:** Extensions of `collaborators/page.tsx` and `dashboard/page.tsx`.

### Ownership + Claim Guard (DELETE endpoint)
**Source:** `app/api/collaborators/[id]/route.ts` lines 40-59 — extend the existing DELETE handler:
```typescript
// Add before the existing .delete() call:
const { data: existing } = await supabase
  .from('collaborators')
  .select('claimed_by')
  .eq('id', id)
  .eq('user_id', user.id)
  .maybeSingle()

if (existing?.claimed_by) {
  return NextResponse.json(
    { error: 'Cannot delete a claimed collaborator — use archive instead' },
    { status: 409 }
  )
}
```
**Apply to:** `app/api/collaborators/[id]/route.ts` DELETE handler (existing file — must be modified).

### Badge Styling (component)
**Source:** `components/collaborators/CollaboratorCard.tsx` lines 36-44
```typescript
// Indigo badge (positive/verified)
<span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-3 py-1 text-xs font-bold text-brandindigo">
  IPI on file
</span>
// Amber badge (warning/missing)
<span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">
  IPI missing
</span>
```
**Apply to:** "Funūn member" badge in `CollaboratorCard` (use indigo variant), Archived indicator (use amber variant).

### SECURITY DEFINER Function (DB)
**Source:** `supabase/migrations/001_initial_schema.sql` lines 354-362
```sql
CREATE OR REPLACE FUNCTION public.function_name()
RETURNS TRIGGER AS $$
BEGIN
  -- cross-user writes safe here
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
**Apply to:** `claim_collaborators()` and `backfill_claimed_collaborators()` in migration 026.

---

## No Analog Found

All files in Phase 4 have direct analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/api/collaborators/`, `app/api/profile/`, `lib/collaborators/`, `lib/supabase/`, `components/collaborators/`, `app/(artist)/collaborators/`, `app/(artist)/dashboard/`, `app/(artist)/settings/`, `middleware.ts`
**Files scanned:** 14
**Pattern extraction date:** 2026-06-29
