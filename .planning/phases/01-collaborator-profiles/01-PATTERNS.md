# Phase 1: Collaborator Profiles - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 19 new/modified files
**Analogs found:** 19 / 19

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/018_collaborators_split_sheets.sql` | migration | CRUD | `supabase/migrations/001_initial_schema.sql` | exact |
| `app/api/collaborators/route.ts` | route | CRUD | `app/api/vault/route.ts` | exact |
| `app/api/collaborators/[id]/route.ts` | route | CRUD | `app/api/profile/route.ts` | exact |
| `app/api/collaborators/[id]/invite/route.ts` | route | event-driven | `app/api/vault/route.ts` + `lib/email/index.ts` | role-match |
| `app/api/split-sheets/route.ts` | route | CRUD | `app/api/vault/route.ts` | exact |
| `app/api/split-sheets/[id]/route.ts` | route | CRUD | `app/api/profile/route.ts` | exact |
| `app/api/split-sheets/[id]/send-for-approval/route.ts` | route | event-driven | `app/api/vault/route.ts` + `lib/email/index.ts` | role-match |
| `app/api/approve/[token]/route.ts` | route | request-response | `app/api/vault/route.ts` | role-match |
| `app/(artist)/collaborators/page.tsx` | page (server) | request-response | `app/(artist)/vault/page.tsx` | exact |
| `app/(artist)/layout.tsx` | layout | — | `app/(artist)/layout.tsx` (modify) | exact |
| `app/(industry)/split-sheets/page.tsx` | page (server) | request-response | `app/(artist)/vault/page.tsx` | role-match |
| `app/(industry)/layout.tsx` | layout | — | `app/(industry)/layout.tsx` (modify) | exact |
| `app/approve/[token]/page.tsx` | page (server, public) | request-response | `app/(artist)/vault/page.tsx` | role-match |
| `app/join/[inviteToken]/page.tsx` | page (server, public) | request-response | `app/(artist)/vault/page.tsx` | role-match |
| `middleware.ts` | middleware | request-response | `middleware.ts` (modify) | exact |
| `components/collaborators/CollaboratorRoster.tsx` | component | CRUD | `components/vault/EditProjectForm.tsx` | role-match |
| `components/collaborators/CollaboratorCard.tsx` | component | request-response | `components/vault/EditProjectForm.tsx` | partial |
| `components/collaborators/CollaboratorForm.tsx` | component | CRUD | `components/vault/EditProjectForm.tsx` | exact |
| `components/collaborators/CollaboratorPicker.tsx` | component | CRUD | `components/vault/MetadataStudio.tsx` (ComposerEditor) | role-match |
| `components/split-sheets/SplitSheetBuilder.tsx` | component | CRUD | `components/vault/EditProjectForm.tsx` | role-match |
| `components/split-sheets/SplitApprovalView.tsx` | component | request-response | `components/vault/EditProjectForm.tsx` | role-match |
| `components/nav/icons.tsx` | utility | — | `components/nav/icons.tsx` (modify) | exact |
| `lib/collaborators/index.ts` | utility | transform | `app/api/profile/route.ts` (sanitize fn) | role-match |
| `lib/split-sheets/approval.ts` | utility | transform | `lib/metadata/schema.ts` | role-match |
| `lib/vault/readiness.ts` | utility | transform | `lib/vault/readiness.ts` (modify) | exact |

---

## Pattern Assignments

### `supabase/migrations/018_collaborators_split_sheets.sql` (migration, CRUD)

**Analog:** `supabase/migrations/001_initial_schema.sql`

**Table + RLS pattern** (lines 34–58 of 001):
```sql
CREATE TABLE industry_profiles (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  -- fields ...
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE industry_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Industry pros manage own profile" ON industry_profiles
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Verified industry profiles discoverable" ON industry_profiles
  FOR SELECT USING (verified = true);
```

**Key constraints to copy:**
- `uuid_generate_v4()` for all PKs (extension already enabled with `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
- `user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL` — never `artist_id`
- `ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE`
- Policy names follow pattern `"Noun verb own noun"` (e.g., `"Users manage own collaborators"`)
- Add `CREATE INDEX idx_<table>_<col> ON <table> (<col>)` for every FK used in joins/queries

---

### `app/api/collaborators/route.ts` (route, CRUD — GET list + POST create)

**Analog:** `app/api/vault/route.ts` (lines 1–86)

**Imports pattern** (lines 1–4):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
```

**Auth + GET pattern** (lines 10–36):
```typescript
export async function GET() {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

**POST create pattern** (lines 40–86):
```typescript
export async function POST(request: Request) {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitizeCollaborator(body)
  if (!update.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('collaborators')
    .insert({ ...update, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

---

### `app/api/collaborators/[id]/route.ts` (route, CRUD — PATCH + DELETE)

**Analog:** `app/api/profile/route.ts` (full file, 84 lines)

**EDITABLE_FIELDS + sanitize pattern** (lines 6–59):
```typescript
const EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'pro', 'ipi',
  'publisher', 'mlc_id', 'soundexchange_id', 'mailing_address',
] as const

function sanitize(body: Record<string, unknown>): Partial<CollaboratorProfile> {
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
  return update as Partial<CollaboratorProfile>
}
```

**PATCH + ownership check pattern** (lines 61–83):
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
    .eq('id', user.id)  // ← for collaborators use .eq('id', params.id).eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

**Note for DELETE:** chain `.eq('id', params.id).eq('user_id', user.id)` — RLS is the backstop but double-check ownership in the handler per the established pattern.

---

### `app/api/collaborators/[id]/invite/route.ts` (route, event-driven — POST send invite)

**Analogs:** `app/api/vault/route.ts` (auth pattern) + `lib/email/index.ts` (sendEmail)

**Token generation + email dispatch pattern:**
```typescript
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/email'
import { createApiClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = randomBytes(32).toString('hex')
  // Insert into collaborator_invites, then:
  const { ok, error } = await sendEmail({
    to: collaborator.email,
    subject: 'You\'ve been added as a collaborator on Funūn',
    html: `...`,
  })
  if (!ok) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

---

### `app/api/split-sheets/[id]/send-for-approval/route.ts` (route, event-driven)

**Analogs:** `app/api/vault/route.ts` (auth) + `lib/email/index.ts` (sendEmail) + `lib/supabase/server.ts` (createServiceClient for cross-user inserts)

**Service client usage** (from `lib/supabase/server.ts` lines 13–19):
```typescript
// Use createServiceClient() ONLY when inserting rows that belong to another user
// (e.g., creating split_sheet_parties rows visible to collaborator accounts).
// Always verify ownership of the parent split_sheet before using service client.
import { createServiceClient } from '@/lib/supabase/server'
const adminSupabase = createServiceClient()
```

---

### `app/(artist)/collaborators/page.tsx` (page server component, request-response)

**Analog:** `app/(artist)/vault/page.tsx` (lines 1–55)

**Server component fetch pattern** (lines 22–54):
```typescript
export const dynamic = 'force-dynamic'

export default async function CollaboratorsPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: collaborators, error } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('name', { ascending: true })

  // Pass to client component:
  return <CollaboratorRoster collaborators={collaborators ?? []} />
}
```

**Imports pattern** (lines 1–9):
```typescript
import { createServerClient } from '@/lib/supabase/server'
import { CollaboratorRoster } from '@/components/collaborators/CollaboratorRoster'
import { Topbar } from '@/components/layout/Topbar'
```

---

### `app/(artist)/layout.tsx` (layout, modify)

**Analog:** `components/nav/ArtistNav.tsx` (lines 23–32 — ITEMS array)

**ITEMS entry to add:**
```typescript
// In components/nav/ArtistNav.tsx, add to ITEMS array:
{ href: '/collaborators', label: 'Collaborators', match: '/collaborators', Icon: CollaboratorsIcon }
```

**Icon import** follows the pattern at line 6–14:
```typescript
import {
  VaultIcon,
  LockerIcon,
  // ... existing icons ...
  CollaboratorsIcon,  // ← add here
} from './icons'
```

---

### `app/(industry)/layout.tsx` (layout, modify)

**Analog:** `app/(industry)/layout.tsx` (full file, 29 lines)

**Nav link pattern to add** (lines 15–19):
```typescript
<nav className="flex items-center gap-6 text-sm text-white/60">
  <Link href="/opportunities" className="transition hover:text-white">
    Opportunities
  </Link>
  <Link href="/split-sheets" className="transition hover:text-white">
    Split Sheets
  </Link>  {/* ← add this */}
  <Link href="/opportunities/new" className="transition hover:text-white">
    Post
  </Link>
  {!DEMO && <SignOutButton />}
</nav>
```

---

### `app/approve/[token]/page.tsx` (page server component, public, request-response)

**Analog:** `app/(artist)/vault/page.tsx` (server fetch pattern)

**Public route — no auth check.** Server fetches the token from DB, validates expiry, passes data to `SplitApprovalView` client component. Pattern:
```typescript
export const dynamic = 'force-dynamic'

// No createServerClient() auth check — this page is intentionally public.
// Use createServiceClient() to look up the token (RLS would block unauthenticated reads).
import { createServiceClient } from '@/lib/supabase/server'

export default async function ApprovePage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient()
  const { data: party } = await supabase
    .from('split_sheet_parties')
    .select('*, split_sheets(*)')
    .eq('approval_token', params.token)
    .maybeSingle()

  if (!party || new Date(party.token_expires_at) < new Date()) {
    return <p>This approval link has expired or is invalid.</p>
  }
  return <SplitApprovalView party={party} />
}
```

---

### `middleware.ts` (middleware, modify)

**Analog:** `middleware.ts` (full file, 38 lines)

**isProtected list** (lines 17–21) — verify `/approve` and `/join` are NOT included:
```typescript
const isProtected =
  pathname.startsWith('/vault') ||
  pathname.startsWith('/dashboard') ||
  pathname.startsWith('/settings')
  // ← /approve and /join must NOT appear here
  // ← /collaborators MUST be added here
```

**Add `/collaborators` to protected routes:**
```typescript
const isProtected =
  pathname.startsWith('/vault') ||
  pathname.startsWith('/dashboard') ||
  pathname.startsWith('/settings') ||
  pathname.startsWith('/collaborators') ||  // ← add
  pathname.startsWith('/split-sheets')       // ← add (artist + industry flows)
```

---

### `components/collaborators/CollaboratorForm.tsx` (component, CRUD)

**Analog:** `components/vault/EditProjectForm.tsx` (full file, 269 lines)

**Client component shell + state pattern** (lines 1–52):
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { PRO_LABELS, PRO_VALUES } from '@/lib/metadata/schema'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

export function CollaboratorForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<CollaboratorProfile>
  onSaved: (c: CollaboratorProfile) => void
  onCancel: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  // ... more useState per field ...
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
```

**Submit + router.refresh() pattern** (lines 65–93):
```typescript
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, /* ... */ }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not save collaborator')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    router.refresh()
    onSaved(json.data)
  }
```

**Error display pattern** (line 215):
```typescript
{error && <p className="text-xs text-rose-300">{error}</p>}
```

**Save/cancel button pattern** (lines 218–235):
```typescript
<button
  type="submit"
  disabled={submitting || !name.trim()}
  className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
>
  {submitting ? 'Saving…' : 'Save collaborator'}
</button>
<button
  type="button"
  onClick={onCancel}
  className="text-sm text-white/50 transition hover:text-white"
>
  Cancel
</button>
```

---

### `components/collaborators/CollaboratorRoster.tsx` (component, CRUD)

**Analog:** `components/vault/EditProjectForm.tsx` (open/close modal pattern, lines 38–120)

**Modal open/close pattern** (lines 38–120):
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// ...

export function CollaboratorRoster({ collaborators }: { collaborators: CollaboratorProfile[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  // Card grid + edit modal overlay — consistent with EditProjectForm toggle pattern
  // editingId !== null → show CollaboratorForm for that collaborator
  // creating === true → show CollaboratorForm for new entry
}
```

---

### `components/collaborators/CollaboratorPicker.tsx` (component, CRUD)

**Analog:** `components/vault/MetadataStudio.tsx` — ComposerEditor (lines 608–700)

**Client component fetching roster on mount:**
```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { CollaboratorProfile } from '@/lib/collaborators'
import type { Composer } from '@/lib/metadata/schema'

export function CollaboratorPicker({
  onSelect,
}: {
  onSelect: (c: CollaboratorProfile) => void
}) {
  const [collaborators, setCollaborators] = useState<CollaboratorProfile[]>([])
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/collaborators')
      .then(r => r.json())
      .then(({ data }) => setCollaborators(data ?? []))
  }, [])
  // ...
}
```

**ComposerEditor augmentation — how the picker integrates** (lines 629–682 of MetadataStudio.tsx):

The picker is injected as a sibling element inside each composer row `<div>`. It does NOT replace any existing inputs. The `ComposerEditor` function signature gains a `collaborators` prop:
```typescript
function ComposerEditor({
  composers,
  onChange,
  collaborators,   // ← new prop (array from GET /api/collaborators)
}: {
  composers: Composer[]
  onChange: (next: Composer[]) => void
  collaborators: CollaboratorProfile[]  // ← new
}) {
```

---

### `components/split-sheets/SplitSheetBuilder.tsx` (component, CRUD)

**Analog:** `components/vault/EditProjectForm.tsx` (form pattern) + ComposerEditor (repeating row pattern, lines 626–700 of MetadataStudio.tsx)

**Even-split pre-fill logic:**
```typescript
function evenSplit(count: number): number {
  return Math.round((100 / count) * 1000) / 1000
}
// Called when adding a party row; updates all existing party splits
```

**Repeating party row pattern** (mirror of composer row at MetadataStudio lines 628–682):
```typescript
{parties.map((p, i) => (
  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-12">
    {/* CollaboratorPicker to auto-fill name/email/pro/ipi */}
    {/* name, email, role, split % inputs */}
  </div>
))}
```

---

### `components/split-sheets/SplitApprovalView.tsx` (component, request-response)

**Analog:** `components/vault/EditProjectForm.tsx` (form submit + error pattern)

This is a public-facing form (no auth). Follows the same submit pattern but POSTs to `/api/approve/[token]`. Validates that counter-proposal totals 100% client-side before submit.

---

### `components/nav/icons.tsx` (utility, modify — add CollaboratorsIcon)

**Analog:** `components/nav/icons.tsx` (lines 1–32, existing icon shape)

**Exact icon component shape to copy:**
```typescript
// lines 4–6: shared types
import type { SVGProps } from 'react'
type IconProps = SVGProps<SVGSVGElement> & { gradient?: boolean }

// lines 8–22: Svg wrapper (do NOT duplicate — reuse existing)
function Svg({ gradient, children, ...props }: IconProps & { children: React.ReactNode }) { ... }

// Add after existing exports:
// Collaborators — group / people icon
export const CollaboratorsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="7" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6" />
    <circle cx="16" cy="7" r="3" />
    <path d="M10 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
  </Svg>
)
```

---

### `lib/collaborators/index.ts` (utility, transform)

**Analog:** `app/api/profile/route.ts` sanitize function (lines 21–59)

**sanitizeCollaborator pattern** (copy directly from profile/route.ts sanitize, adapting fields):
```typescript
const COLLABORATOR_EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'pro', 'ipi',
  'publisher', 'mlc_id', 'soundexchange_id', 'mailing_address',
] as const

export type CollaboratorProfile = {
  id: string
  user_id: string
  name: string
  email?: string | null
  phone?: string | null
  pro?: string | null
  ipi?: string | null
  publisher?: string | null
  mlc_id?: string | null
  soundexchange_id?: string | null
  mailing_address?: Record<string, string> | null
  created_at: string
  updated_at: string
}

export function sanitizeCollaborator(
  body: Record<string, unknown>
): Partial<Omit<CollaboratorProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>> {
  const update: Record<string, unknown> = {}
  for (const key of COLLABORATOR_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null || (key === 'mailing_address' && typeof value === 'object')) {
      update[key] = value
    }
  }
  return update
}
```

---

### `lib/split-sheets/approval.ts` (utility, transform)

**Analog:** `lib/metadata/schema.ts` (pure utility functions, named exports)

**Token generation:**
```typescript
import { randomBytes } from 'crypto'

export function generateApprovalToken(): string {
  return randomBytes(32).toString('hex')
}

export function validateApprovalTotal(splits: number[]): boolean {
  const total = Math.round(splits.reduce((s, n) => s + n, 0) * 1000) / 1000
  return total === 100
}
```

---

### `lib/vault/readiness.ts` (utility, modify)

**Analog:** `lib/vault/readiness.ts` (lines 19–75, the switch statement in `readinessItemsForProject`)

**Existing composersComplete function** (lines 19–24) — add IPI-missing sub-check:
```typescript
// Existing:
function composersComplete(metadata: Record<string, unknown> | null | undefined): boolean {
  const comps = readComposers(metadata)
  if (comps.length === 0) return false
  const total = Math.round(comps.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
  return total === 100
}

// New helper alongside it:
function composersHaveMissingIpi(metadata: Record<string, unknown> | null | undefined): boolean {
  const comps = readComposers(metadata)
  // A composer row is "from roster" if it has an email set (heuristic for Phase 1)
  // or if a flag ipi_missing is stored in the JSONB
  return comps.some(c => c.email && !c.ipi)
}
```

**ReadinessInput type** (lines 4–16) — extend to support IPI-missing flag:
```typescript
// Option (b) from RESEARCH.md: store flag in track JSONB on pick, no DB join needed
// The track metadata JSONB gets a field: composer_ipi_missing: true
// readinessItemsForProject reads it without a DB client
```

---

## Shared Patterns

### Authentication (all API routes)
**Source:** `app/api/profile/route.ts` lines 61–66 and `lib/supabase/server.ts` lines 5–6
```typescript
import { createApiClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// In every route handler:
const supabase = createApiClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
**Apply to:** All API routes except `app/api/approve/[token]/route.ts` (which is public).

### Email Delivery
**Source:** `lib/email/index.ts` (full file, 36 lines)
```typescript
import { sendEmail } from '@/lib/email'

// Usage pattern:
const { ok, error } = await sendEmail({
  to: recipientEmail,
  subject: 'Subject line',
  html: '<p>Body</p>',
  replyTo: artistEmail,  // optional
})
if (!ok) return NextResponse.json({ error }, { status: 500 })
```
**Apply to:** `app/api/collaborators/[id]/invite/route.ts`, `app/api/split-sheets/[id]/send-for-approval/route.ts`

### Input Sanitization (EDITABLE_FIELDS allowlist)
**Source:** `app/api/profile/route.ts` lines 6–59
```typescript
const EDITABLE_FIELDS = [...] as const

function sanitize(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (!(key in body)) continue
    // type-specific coercion per field
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
**Apply to:** `app/api/collaborators/route.ts`, `app/api/collaborators/[id]/route.ts`, `app/api/split-sheets/route.ts`

### Client Component Structure (forms/modals)
**Source:** `components/vault/EditProjectForm.tsx` lines 1–52
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Styling constants at top of file:
const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'
```
**Apply to:** `CollaboratorForm`, `CollaboratorRoster`, `CollaboratorPicker`, `SplitSheetBuilder`, `SplitApprovalView`

### router.refresh() after mutations
**Source:** `components/vault/EditProjectForm.tsx` lines 92–93
```typescript
setSubmitting(false)
setOpen(false)
router.refresh()  // Revalidates server-fetched data
```
**Apply to:** All client components that mutate collaborator or split sheet data.

### PRO enum reuse
**Source:** `lib/metadata/schema.ts` lines 8–41
```typescript
import { PRO_LABELS, PRO_VALUES, type PRO } from '@/lib/metadata/schema'
// Already covers all major PROs — do not create new enum
```
**Apply to:** `CollaboratorForm`, `SplitSheetBuilder`, `lib/collaborators/index.ts`

### Server Component fetch
**Source:** `app/(artist)/vault/page.tsx` lines 22–54
```typescript
export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  // fetch + pass to client component
}
```
**Apply to:** `app/(artist)/collaborators/page.tsx`, `app/(industry)/split-sheets/page.tsx`

---

## No Analog Found

All files have analogs. No gaps.

---

## Metadata

**Analog search scope:** `app/api/`, `app/(artist)/`, `app/(industry)/`, `components/vault/`, `components/nav/`, `lib/`, `supabase/migrations/`, `middleware.ts`
**Files scanned:** 13 source files read in full or targeted sections
**Pattern extraction date:** 2026-06-26
