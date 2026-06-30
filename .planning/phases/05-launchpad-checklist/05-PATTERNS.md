# Phase 5: Launchpad Checklist — Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 16 new/modified files
**Analogs found:** 14 / 16

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/(artist)/launchpad/[projectId]/page.tsx` | page (server component) | request-response | `app/(artist)/vault/[projectId]/rights/page.tsx` | exact |
| `app/(artist)/launchpad/page.tsx` | page (server component) | request-response | self (minimal modification) | self |
| `app/(admin)/layout.tsx` | layout | request-response | `app/(artist)/layout.tsx` | role-match |
| `app/(admin)/checklist/page.tsx` | page (server component) | request-response | `app/(artist)/vault/[projectId]/rights/page.tsx` | role-match |
| `app/(admin)/tips/page.tsx` | page (server component) | request-response | `app/(artist)/vault/[projectId]/rights/page.tsx` | role-match |
| `components/launchpad/LaunchpadRoom.tsx` | component (client) | CRUD | `components/vault/ToolSidePanel.tsx` (parent pattern) | role-match |
| `components/launchpad/ChecklistSection.tsx` | component (client) | event-driven | `app/(artist)/launchpad/page.tsx` section render | partial |
| `components/launchpad/ChecklistItem.tsx` | component (client) | CRUD | `components/vault/ToolSidePanel.tsx` row pattern | partial |
| `components/launchpad/TipPanel.tsx` | component (client) | request-response | `components/vault/ToolSidePanel.tsx` | **exact** |
| `components/admin/ChecklistAdmin.tsx` | component (client) | CRUD | no exact analog — dnd-kit is new | no analog |
| `components/admin/TipsAdmin.tsx` | component (client) | CRUD | no exact analog | no analog |
| `app/api/launchpad/[projectId]/checklist/route.ts` | API route | request-response | `app/api/vault/[projectId]/route.ts` | exact |
| `app/api/launchpad/[projectId]/progress/route.ts` | API route | CRUD | `app/api/vault/[projectId]/route.ts` | exact |
| `app/api/admin/checklist/route.ts` | API route | CRUD | `app/api/vault/[projectId]/route.ts` | role-match |
| `app/api/admin/checklist/[itemKey]/route.ts` | API route | CRUD | `app/api/vault/[projectId]/route.ts` | role-match |
| `app/api/admin/tips/route.ts` | API route | CRUD | `app/api/vault/[projectId]/route.ts` | role-match |
| `app/api/admin/tips/[itemKey]/route.ts` | API route | CRUD | `app/api/vault/[projectId]/route.ts` | role-match |
| `supabase/migrations/028_launchpad_checklist.sql` | migration | — | `supabase/migrations/026_collaborator_identity_reconciliation.sql` | exact |
| `types/index.ts` (additions) | types | — | `types/index.ts` existing entries | exact |
| `middleware.ts` (modification) | middleware | request-response | self | self |

---

## Pattern Assignments

### `app/(artist)/launchpad/[projectId]/page.tsx` (server component page)

**Analog:** `app/(artist)/vault/[projectId]/rights/page.tsx`

**Imports pattern** (lines 1–8):
```typescript
import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { LaunchpadRoom } from '@/components/launchpad/LaunchpadRoom'
```

**Auth + ownership pattern** (rights/page.tsx lines 43–65):
```typescript
export default async function LaunchpadProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const { data: project } = await supabase
    .from('vault_projects')
    .select('id, title, release_date')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()
```

**Multi-query pattern** (rights/page.tsx lines 66–75):
```typescript
// Two parallel queries, merge in TypeScript (not a Supabase join)
const [{ data: items }, { data: progress }] = await Promise.all([
  supabase.from('launchpad_checklist_items').select('*').order('sort_order'),
  supabase.from('launchpad_progress')
    .select('item_key, completed, completed_at')
    .eq('project_id', projectId)
    .eq('user_id', user.id),
])
```

**Pass to client component** (rights/page.tsx line 179):
```typescript
return (
  <div className="mx-auto max-w-4xl px-6 py-10">
    <LaunchpadRoom project={project} items={merged} />
  </div>
)
```

**What differs from analog:**
- Fetches from `launchpad_checklist_items` + `launchpad_progress` instead of rights tables
- Must include `release_date` in the `vault_projects` select for before-release collapse logic
- Passes merged checklist+progress array (not separate props) to client component

---

### `components/launchpad/TipPanel.tsx` (client component)

**Analog:** `components/vault/ToolSidePanel.tsx` — **copy the shell verbatim, replace the body**

**Full shell structure** (ToolSidePanel.tsx lines 119–255):

Container:
```typescript
'use client'

import { useEffect } from 'react'

export function TipPanel({
  item,
  onClose,
}: {
  item: ChecklistItem | null
  onClose: () => void
}) {
  // Reset on item change (ToolSidePanel.tsx lines 38–52 pattern)
  useEffect(() => {
    // reset internal state when item changes
  }, [item])

  // Escape key (ToolSidePanel.tsx lines 55–62)
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop — click closes (ToolSidePanel.tsx line 122–126) */}
      <button
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl">
        {/* Header (ToolSidePanel.tsx lines 130–153) */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <h2 className="mt-0.5 text-lg font-semibold text-white">{item.label}</h2>
          <button onClick={onClose} className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:border-white/30 hover:text-white" aria-label="Close">
            {/* X icon */}
          </button>
        </div>

        {/* Body (ToolSidePanel.tsx lines 156–185) */}
        <div className="flex-1 overflow-y-auto p-5">
          {item.tip_body && (
            <p className="mb-4 text-sm text-white/70">{item.tip_body}</p>
          )}
        </div>

        {/* Footer CTA (ToolSidePanel.tsx lines 189–252) */}
        <div className="border-t border-white/10 p-5">
          {item.action_href && (
            <a
              href={item.action_href}
              target={item.action_type === 'external_url' ? '_blank' : undefined}
              rel={item.action_type === 'external_url' ? 'noopener noreferrer' : undefined}
              className="block w-full rounded-lg bg-white px-4 py-2.5 text-center text-sm font-semibold text-black transition hover:bg-white/90"
            >
              {item.action_label}
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}
```

**What differs from analog:**
- No async `generate()` call — tip body is already in `item.tip_body` from server fetch
- Footer shows external link or internal `<Link>` (not a form submit button)
- Hide CTA entirely when `item.action_href` is null
- No split sheet form; body renders `tip_body` text only

---

### `components/launchpad/LaunchpadRoom.tsx` (client component)

**No single close analog** — synthesize from two sources:

1. **State + side panel wiring** — copy parent-of-ToolSidePanel pattern. In `components/vault/DocumentStage.tsx` or any page that imports `ToolSidePanel`, the pattern is:
```typescript
'use client'
import { useState } from 'react'
import { TipPanel } from './TipPanel'

export function LaunchpadRoom({ project, items }: { project: VaultProject; items: MergedChecklistItem[] }) {
  const [activeItem, setActiveItem] = useState<MergedChecklistItem | null>(null)

  return (
    <>
      {/* sections render here, pass setActiveItem down */}
      <TipPanel item={activeItem} onClose={() => setActiveItem(null)} />
    </>
  )
}
```

2. **Section grouping** — copy the `LAUNCH_PHASES.map()` pattern from `app/(artist)/launchpad/page.tsx` lines 35–78, adapted for DB-backed items:
```typescript
const SECTIONS = ['before_release', 'week_1', 'week_2', 'weeks_3_4'] as const
// group items by section, render ChecklistSection per section
```

---

### `components/launchpad/ChecklistItem.tsx` (client component)

**Pattern:** Row click → open panel; checkbox click → toggle without opening panel.

```typescript
'use client'

export function ChecklistItem({
  item,
  onToggle,
  onOpenPanel,
}: {
  item: MergedChecklistItem
  onToggle: (key: string, completed: boolean) => void
  onOpenPanel: (item: MergedChecklistItem) => void
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-[14px] border border-hair bg-card px-[18px] py-4 cursor-pointer"
      onClick={() => onOpenPanel(item)}          // row click → panel
    >
      <input
        type="checkbox"
        checked={item.completed}
        onClick={e => e.stopPropagation()}       // stop row click
        onChange={e => onToggle(item.key, e.target.checked)}
      />
      <span className="text-[15.5px] font-bold text-white">{item.label}</span>
    </div>
  )
}
```

**CSS classes to copy** from `app/(artist)/launchpad/page.tsx` lines 51–65:
- Card: `rounded-[14px] border border-hair bg-card px-[18px] py-4`
- Label: `text-[15.5px] font-bold text-white`

---

### `app/(admin)/layout.tsx` (admin layout)

**Analog:** `app/(artist)/layout.tsx` (lines 1–10) for the layout shell; `is_admin` gate is new.

**Artist layout pattern** (layout.tsx lines 1–10):
```typescript
import { ArtistNav } from '@/components/nav/ArtistNav'

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav />
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
```

**Admin layout adaptation** — add server-side `is_admin` check before returning shell:
```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  return (
    <div className="flex min-h-screen bg-ink text-white">
      {/* Admin sidebar nav with links to /admin/checklist and /admin/tips */}
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
```

**What differs from analog:**
- `async` function (server component with auth check)
- No `ArtistNav` — use a minimal admin sidebar with two links
- `createServerClient()` call and `is_admin` redirect before render

---

### `app/api/launchpad/[projectId]/checklist/route.ts` (API route, GET)

**Analog:** `app/api/vault/[projectId]/route.ts` lines 110–158

**Auth + params pattern** (route.ts lines 110–134):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Ownership verified via .eq('user_id', user.id) on vault_projects query
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: items }, { data: progress }] = await Promise.all([
    supabase.from('launchpad_checklist_items').select('*').order('sort_order'),
    supabase.from('launchpad_progress')
      .select('item_key, completed, completed_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id),
  ])

  const progressMap = new Map((progress ?? []).map(p => [p.item_key, p]))
  const merged = (items ?? []).map(item => ({
    ...item,
    tip_draft: undefined,   // NEVER expose tip_draft to artists
    tip_body: item.tip_approved ? item.tip_body : null,
    completed: progressMap.get(item.key)?.completed ?? false,
    completed_at: progressMap.get(item.key)?.completed_at ?? null,
  }))

  return NextResponse.json({ data: merged })
}
```

---

### `app/api/launchpad/[projectId]/progress/route.ts` (API route, PATCH)

**Analog:** `app/api/vault/[projectId]/route.ts` PATCH pattern (lines 130–158)

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>
  const itemKey = typeof body.item_key === 'string' ? body.item_key : null
  const completed = typeof body.completed === 'boolean' ? body.completed : null
  if (!itemKey || completed === null) {
    return NextResponse.json({ error: 'item_key and completed are required' }, { status: 400 })
  }

  const { error } = await supabase.from('launchpad_progress').upsert(
    {
      user_id: user.id,
      project_id: projectId,
      item_key: itemKey,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,project_id,item_key' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

---

### `app/api/admin/checklist/route.ts` and `[itemKey]/route.ts` (admin API routes)

**Analog:** `app/api/vault/[projectId]/route.ts` + `app/api/approve/[token]/route.ts` (for `createServiceClient()` pattern)

**Admin auth gate pattern** (derived from RESEARCH.md + `approve/[token]/route.ts` line 20):
```typescript
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

async function verifyAdmin() {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}

export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Use createServiceClient() for reads that see all users' data
  const service = createServiceClient()
  const { data, error } = await service.from('launchpad_checklist_items').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

**Allowlist pattern for PATCH** (from `app/api/vault/[projectId]/route.ts` lines 43–60 sanitize pattern):
```typescript
// Explicit allowlist — same convention as EDITABLE_FIELDS in app/api/profile/route.ts
const EDITABLE_FIELDS = ['label', 'section', 'action_type', 'action_href', 'action_label', 'sort_order'] as const
```

**`[itemKey]/route.ts` dynamic param** — same async params pattern as all existing routes:
```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemKey: string }> }
) {
  const { itemKey } = await params
  // ...
}
```

---

### `app/api/admin/tips/[itemKey]/route.ts` (approve/reject tip)

**Analog:** `app/api/approve/[token]/route.ts` for the approve/reject two-action PATCH pattern (lines 56–126)

```typescript
// On approve: copy tip_draft → tip_body, set tip_approved = true, clear tip_draft
// On reject: clear tip_draft only
const action = typeof body.action === 'string' ? body.action : ''
if (action !== 'approve' && action !== 'reject') {
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
```

---

### `supabase/migrations/028_launchpad_checklist.sql`

**Analog:** `supabase/migrations/026_collaborator_identity_reconciliation.sql` lines 1–36

**Required conventions:**
```sql
-- ============================================================
-- Funūn — Wave 3: Launchpad Checklist
-- Migration 028: Launchpad checklist items and progress
-- Run via: supabase db push
-- ============================================================

CREATE TABLE launchpad_checklist_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- NOT gen_random_uuid()
  -- ...
);

ALTER TABLE launchpad_checklist_items ENABLE ROW LEVEL SECURITY;  -- immediately after CREATE TABLE

-- Reuse existing trigger function (defined in migration 001)
CREATE TRIGGER set_launchpad_checklist_items_updated_at
  BEFORE UPDATE ON launchpad_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- FK for cascade delete (preferred over API-level cascade)
-- launchpad_progress.item_key REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE
```

**Critical:** Use `uuid_generate_v4()` not `gen_random_uuid()`. The CONTEXT.md schema has a bug — all 27 existing migrations use `uuid_generate_v4()`.

---

### `types/index.ts` (additions)

**Analog:** existing entries in `types/index.ts` — follow `VaultProject` named-export pattern.

```typescript
// Add alongside existing VaultProject, Track, etc.
export type ChecklistItem = {
  id: string
  key: string
  label: string
  section: 'before_release' | 'week_1' | 'week_2' | 'weeks_3_4'
  suggested_week: number | null
  sort_order: number
  action_type: 'internal_tool' | 'external_url'
  action_href: string | null
  action_label: string | null
  tip_body: string | null
  tip_approved: boolean
  // tip_draft is admin-only — never in artist-facing type
  created_at: string
  updated_at: string
}

export type LaunchpadProgress = {
  id: string
  user_id: string
  project_id: string
  item_key: string
  completed: boolean
  completed_at: string | null
  created_at: string
}

// Merged type used in artist-facing components
export type MergedChecklistItem = ChecklistItem & {
  completed: boolean
  completed_at: string | null
}
```

---

### `middleware.ts` (modification)

**Analog:** self — add two path prefixes to the existing `isProtected` block (lines 17–22).

```typescript
const isProtected =
  pathname.startsWith('/vault') ||
  pathname.startsWith('/dashboard') ||
  pathname.startsWith('/settings') ||
  pathname.startsWith('/collaborators') ||
  pathname.startsWith('/split-sheets') ||
  pathname.startsWith('/launchpad') ||   // ADD
  pathname.startsWith('/admin')          // ADD
```

---

## Shared Patterns

### Auth — Server Component
**Source:** `app/(artist)/vault/[projectId]/rights/page.tsx` lines 49–53
**Apply to:** All new server component pages (`/launchpad/[projectId]/page.tsx`, `/admin/layout.tsx`, admin pages)
```typescript
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')
```

### Auth — API Route
**Source:** `app/api/vault/[projectId]/route.ts` lines 130–134
**Apply to:** All new API routes under `/api/launchpad/` and `/api/admin/`
```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Admin `is_admin` Gate
**Source:** No existing analog — new pattern. See RESEARCH.md "is_admin Check Implementation".
**Apply to:** `app/(admin)/layout.tsx` (redirect) + every `/api/admin/*` route (401/403)
```typescript
const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

### Service Client for Cross-User Writes
**Source:** `app/api/approve/[token]/route.ts` line 20 — `createServiceClient()`
**Apply to:** All `/api/admin/*` write routes (after verifying `is_admin` via `createApiClient()` first)
```typescript
// Verify admin via createApiClient(), then switch to createServiceClient() for the write
const service = createServiceClient()
```

### Async Params (Next.js 15)
**Source:** `app/api/vault/[projectId]/route.ts` lines 110–115 (PATCH handler) and `app/api/approve/[token]/route.ts` lines 9–11
**Apply to:** All dynamic route handlers (`[projectId]`, `[itemKey]`)
```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
```

### Side Panel Shell
**Source:** `components/vault/ToolSidePanel.tsx` lines 119–255
**Apply to:** `components/launchpad/TipPanel.tsx`
Key classes: `fixed inset-0 z-50 flex justify-end` (container), `absolute inset-0 bg-black/60 backdrop-blur-sm` (backdrop), `relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl` (aside), `flex-1 overflow-y-auto p-5` (body), `border-t border-white/10 p-5` (footer)

### Error Response Format
**Source:** `app/api/vault/[projectId]/route.ts` lines 144–145
**Apply to:** All new API routes
```typescript
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

### Tailwind Mobile Breakpoint
**Source:** `components/vault/DocumentStage.tsx` line 127 — `md:` prefix for responsive layout
**Apply to:** `components/admin/ChecklistAdmin.tsx` — drag handle: `hidden md:flex`; up/down arrows: `flex md:hidden`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `components/admin/ChecklistAdmin.tsx` | component (client) | CRUD + event-driven | dnd-kit drag-and-drop is new to codebase; no existing list-with-reorder component |
| `components/admin/TipsAdmin.tsx` | component (client) | CRUD | No existing approve/reject list UI; closest is the `approve/[token]` API but no client-side counterpart |

For these files, use the RESEARCH.md dnd-kit pattern (Architecture Patterns section, Pattern 2) and the approve/reject two-action pattern from `app/api/approve/[token]/route.ts` lines 56–96.

---

## Metadata

**Analog search scope:** `app/`, `components/vault/`, `components/nav/`, `supabase/migrations/`, `middleware.ts`
**Files scanned:** 9 source files read
**Pattern extraction date:** 2026-06-30
