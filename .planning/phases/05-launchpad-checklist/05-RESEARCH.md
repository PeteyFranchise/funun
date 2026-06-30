# Phase 5: Launchpad Checklist — Research

**Researched:** 2026-06-30
**Domain:** Next.js 15 dynamic route, Supabase RLS, dnd-kit sortable, admin auth gate
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

1. **Route Architecture** — `/launchpad/[projectId]` is the per-project room; global `/launchpad` gets project cards added at the top only (no structural changes to existing playbook render). Admin lives at `(admin)` route group with routes `/admin/checklist` and `/admin/tips`.

2. **Checklist Structure** — Four sections keyed to sections `before_release`, `week_1`, `week_2`, `weeks_3_4`. Before release section collapses after release date passes (not disappears). Week-based ordering matches Spotify algorithmic window (weeks 1–4).

3. **Tips UX** — Side panel / drawer (right side) matching existing `ToolSidePanel` pattern. Row click opens panel; checkbox click is independent and does NOT open panel. Unapproved tip drafts never surface to artists.

4. **Admin Tip Pipeline** — Route `/admin/tips`. Access gate: `is_admin` flag in `raw_app_meta_data` (set via Supabase dashboard). Schema includes `author` and `contribution_type` as first-class fields for Wave 4 expansion.

5. **Admin Checklist Item CRUD (LAUNCH-05)** — Route `/admin/checklist` in shared `(admin)` layout. dnd-kit drag-and-drop on desktop; up/down arrow buttons on mobile. Hard delete with cascade via FK or API. Fields: label, section, action CTA (type/href/label), sort order.

### Claude's Discretion

- None specified. All major decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Auto-generate tip drafts in Phase 5 (AI monthly cadence is a future operational workflow)
- Industry expert contribution flow (Wave 4)
- Auto-complete items based on tool run events (Phase 5 stretch or Phase 6)
- Do not change the structure of the existing global `/launchpad` playbook page render (only add project cards above it)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAUNCH-01 | Artist sees a Launchpad room with a guided post-release checklist per project | New route `app/(artist)/launchpad/[projectId]/page.tsx`; server component fetches items + progress |
| LAUNCH-02 | Each checklist item links to an in-Funūn tool or opens an external action with step-by-step instructions; items grouped/ordered by `suggested_week` | `launchpad_checklist_items.action_type` + `action_href`; `suggested_week` column drives section grouping |
| LAUNCH-03 | Per-item tips surface contextual guidance; DB-backed, admin-approved before publish | `tip_body` + `tip_approved` columns; admin-only PATCH to approve; artist API filters `tip_approved = true` |
| LAUNCH-04 | Checklist item completion tracked per project, persists across sessions | `launchpad_progress` table; RLS restricts to `user_id = auth.uid()`; PATCH toggles `completed` |
| LAUNCH-05 | Admin can add, edit, reorder, and delete checklist items from in-app UI | `(admin)` route group; `is_admin` gate; dnd-kit sortable; full CRUD on `/api/admin/checklist` |
</phase_requirements>

---

## Summary

Phase 5 builds three interlocking features on a greenfield foundation: the per-project Launchpad room (`/launchpad/[projectId]`), a tip side panel (mirrors existing `ToolSidePanel`), and an admin CRUD interface for checklist items and tip approval. No upstream phases in Wave 3 are prerequisites; this phase establishes the data layer that Phases 6 and 7 will reuse.

The codebase is well-structured for this work. The server-component + API-route pattern used by every existing page (fetch in server component, mutations via API route with `createApiClient()`) applies directly. The `ToolSidePanel` component provides an exact structural template for the `TipPanel` — same fixed-right positioning, backdrop, Escape handling, and header layout. The global `/launchpad/page.tsx` is intentionally narrow (pure server render of static data) and only needs project cards inserted above the existing content.

The largest new dependency is `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` for admin row reorder — none of these are in `package.json` yet. All three passed registry legitimacy checks with 18M+ weekly downloads and the same GitHub source repo. The migration numbering continues from `027_*` → next is `028_launchpad_checklist.sql`. An important inconsistency: the CONTEXT.md schema proposal uses `gen_random_uuid()` but every existing migration (001–027) uses `uuid_generate_v4()` — the migration must use `uuid_generate_v4()` to match codebase convention.

**Primary recommendation:** Follow the server-component + RLS-enforced RPC pattern used across the codebase. The admin `is_admin` gate has no existing implementation — it must be established fresh in the `(admin)` layout using `user.app_metadata.is_admin` from `supabase.auth.getUser()`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Checklist item definitions + tip content | Database / Storage | API / Backend | Items are admin-managed seed data; tips are gated server-side, never trusted from client |
| Per-project progress persistence | Database / Storage | API / Backend | RLS restricts rows to `user_id = auth.uid()`; completion state is authoritative in DB |
| Checklist render + section grouping | Frontend Server (SSR) | Browser / Client | Server component fetches items + progress merged; grouping done server-side |
| TipPanel interaction (open/close/Escape) | Browser / Client | — | Purely interactive UI state, no data required beyond initial load |
| Checkbox toggle (optimistic update) | Browser / Client | API / Backend | Optimistic update on click; PATCH persists; rollback on error |
| Admin `is_admin` gate | API / Backend | Frontend Server (SSR) | Layout server component redirects non-admins; API routes double-check on every write |
| Admin dnd-kit drag reorder | Browser / Client | API / Backend | Sort state is client-managed during drag; persisted via PATCH `sort_order` array on drop |
| Before-release collapse behavior | Browser / Client | — | Collapse is local UI state; release date comparison happens at render time in server component |

---

## Existing Patterns

### 1. Server Component Data Fetch Pattern
Every artist page fetches with `createServerClient()` and redirects on no session. Exact pattern used in `app/(artist)/vault/[projectId]/rights/page.tsx` at lines 44–53:

```typescript
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')

const { data: project } = await supabase
  .from('vault_projects')
  .select('id, title, ...')
  .eq('id', projectId)
  .eq('user_id', user.id)
  .single()

if (!project) notFound()
```

**File:** `app/(artist)/vault/[projectId]/rights/page.tsx:44–66` [VERIFIED: codebase grep]

### 2. API Route Auth Pattern
`createApiClient()` + `supabase.auth.getUser()` + ownership check. Exact pattern in `app/api/vault/[projectId]/route.ts` at lines 130–133:

```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

For ownership on writes, the `.eq('user_id', user.id)` clause on the Supabase query acts as the authorization gate (not a separate check). [VERIFIED: codebase grep]

**File:** `app/api/vault/[projectId]/route.ts:130–133`

### 3. Nested Dynamic Route Pattern
`app/api/vault/[projectId]/route.ts` uses `params: Promise<{ projectId: string }>` (Next.js 15 async params). All new API routes under `/api/launchpad/[projectId]/` must use the same pattern:

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
```

**File:** `app/api/vault/[projectId]/route.ts:110–115` [VERIFIED: codebase grep]

### 4. ToolSidePanel Structure (TipPanel Reference)
`components/vault/ToolSidePanel.tsx` — the TipPanel must replicate this exact shell:

- **Container:** `fixed inset-0 z-50 flex justify-end`
- **Backdrop:** `absolute inset-0 bg-black/60 backdrop-blur-sm` (click closes)
- **Panel aside:** `relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl`
- **Header:** `flex items-start justify-between gap-3 border-b border-white/10 p-5`
- **Body:** `flex-1 overflow-y-auto p-5`
- **Footer:** `border-t border-white/10 p-5`
- **Escape key:** `useEffect` listens for `keydown`, calls `onClose` when `e.key === 'Escape'`
- **Reset on item change:** `useEffect` with `[req]` dep resets all internal state

**File:** `components/vault/ToolSidePanel.tsx:1–255` [VERIFIED: codebase grep]

### 5. Migration Conventions
- Naming: `NNN_descriptive_name.sql` (zero-padded 3 digits, snake_case)
- Next migration: `028_launchpad_checklist.sql`
- UUID: `uuid_generate_v4()` — all 001–027 migrations use this; NOT `gen_random_uuid()` (CONTEXT.md schema has a bug here)
- RLS: `ALTER TABLE x ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 pattern, locked decision from Wave 3 research)
- `updated_at` trigger: reuse `update_updated_at()` function already defined in migration 001
- Indexes: one `CREATE INDEX` per column used in `WHERE` or `JOIN` clauses

**File:** `supabase/migrations/` (verified 001–027) [VERIFIED: codebase grep]

### 6. Service Role Client for Admin Writes
`createServiceClient()` is used for cross-user writes that bypass RLS (see `app/api/approve/[token]/route.ts`). Admin checklist item mutations that affect all users' data (e.g., delete propagates to `launchpad_progress`) should use `createServiceClient()` after verifying `is_admin` via `createApiClient()`.

**File:** `lib/supabase/server.ts:12–18` + `app/api/approve/[token]/route.ts:8` [VERIFIED: codebase grep]

### 7. Global Launchpad Page (Minimal Change Required)
`app/(artist)/launchpad/page.tsx` is a pure server component rendering `PLAYBOOK` static data. The only change is inserting a `ProjectCards` section above the existing `div.flex-1.px-9.py-[30px]` content. The existing `LaunchpadPage` function structure, all CSS classes, and the `PLAYBOOK`/`LAUNCH_PHASES` render must be left entirely intact.

**File:** `app/(artist)/launchpad/page.tsx:1–83` [VERIFIED: codebase grep]

### 8. Tailwind Responsive Breakpoints for Mobile Detection
The codebase uses Tailwind's `md:` prefix for responsive behavior — no JS-based `isMobile` detection. See `components/vault/DocumentStage.tsx` with `grid-cols-1 md:grid-cols-2`. The admin mobile fallback (up/down arrow buttons instead of drag handles) should use `md:hidden` to show arrows on small screens and `hidden md:block` for the drag handle.

**File:** `components/vault/DocumentStage.tsx:127` [VERIFIED: codebase grep]

### 9. TypeScript Types Location
`types/index.ts` is the single manually-maintained types file. There is no auto-generated `types/supabase.ts` in use (the `db:types` script exists in `package.json` but the output file is not present). New types for `ChecklistItem` and `LaunchpadProgress` must be added to `types/index.ts` manually, following the existing `VaultProject` pattern (named exports, explicit `| null` for nullable columns).

**File:** `types/index.ts` [VERIFIED: codebase grep]

---

## New Infrastructure

### What Does Not Exist Yet

| Item | Status | Notes |
|------|--------|-------|
| `app/(artist)/launchpad/[projectId]/page.tsx` | Not created | New server component page |
| `app/(admin)/` route group | Not created | No admin route group exists anywhere in `app/` |
| `app/(admin)/layout.tsx` | Not created | Admin shell with `is_admin` gate |
| `app/(admin)/checklist/page.tsx` | Not created | Admin checklist CRUD page |
| `app/(admin)/tips/page.tsx` | Not created | Admin tip approval page |
| `app/api/launchpad/` directory | Not created | All launchpad API routes |
| `app/api/admin/` directory | Not created | All admin API routes |
| `components/launchpad/` directory | Not created | All launchpad UI components |
| `components/admin/` directory | Not created | Admin UI components |
| `supabase/migrations/028_launchpad_checklist.sql` | Not created | Two new tables + RLS + seed data |
| `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` | Not in `package.json` | New npm dependencies |
| `is_admin` auth check logic | Not implemented anywhere | No existing admin flag check in codebase |

### Middleware: `/launchpad` and `/admin` Must Be Added to Protected Routes
`middleware.ts` currently protects: `/vault`, `/dashboard`, `/settings`, `/collaborators`, `/split-sheets`. The new `/launchpad` and `/admin` paths must be added to the `isProtected` check. Without this, unauthenticated users could reach launchpad pages (the server component would redirect, but a defense-in-depth addition is correct).

**File:** `middleware.ts:16–21` [VERIFIED: codebase grep]

### `is_admin` Check Implementation
No `is_admin` check exists anywhere in the codebase. The CONTEXT.md decision locks this to `raw_app_meta_data.is_admin` (set via Supabase dashboard). In practice, `supabase.auth.getUser()` returns a `User` object whose `app_metadata` property contains the Supabase `raw_app_meta_data`. The check pattern is:

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')
const isAdmin = user.app_metadata?.is_admin === true
if (!isAdmin) redirect('/')
```

This must be applied in:
1. `app/(admin)/layout.tsx` (redirect non-admins at the layout level) — use `createServerClient()`
2. Every `/api/admin/*` route handler (401 for non-admins) — use `createApiClient()`

[ASSUMED] The Supabase `User.app_metadata` type may need explicit casting since the TypeScript type is `Record<string, unknown>` — access as `(user.app_metadata as { is_admin?: boolean })?.is_admin === true`.

---

## Implementation Risks

### Risk 1: UUID Function Mismatch
**What:** The CONTEXT.md schema proposal for `launchpad_checklist_items` and `launchpad_progress` uses `gen_random_uuid()` as the UUID default. Every existing migration (001–027) uses `uuid_generate_v4()`.

**Why it matters:** Using `gen_random_uuid()` works (it is a PostgreSQL built-in), but it diverges from the established codebase convention without reason and introduces inconsistency.

**Resolution:** Migration `028_launchpad_checklist.sql` must use `uuid_generate_v4()` to match all other migrations.

### Risk 2: No FK for `item_key` in `launchpad_progress`
**What:** `launchpad_progress.item_key` is a `text` column referencing `launchpad_checklist_items.key` — but it is not a foreign key. The CONTEXT.md schema uses a `UNIQUE` constraint on the `key` column of `launchpad_checklist_items`, but `launchpad_progress.item_key` has no FK constraint.

**Why it matters:** When a checklist item is hard-deleted, progress rows with that `item_key` become orphaned. The CONTEXT.md says "removed via ON DELETE CASCADE (set on a FK or handled in the API)."

**Resolution:** There are two options:
1. Add a FK: `item_key TEXT NOT NULL REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE` — cleaner, DB enforces cascade automatically.
2. Handle in API: DELETE route for checklist items must also `DELETE FROM launchpad_progress WHERE item_key = $1` before deleting the item.

Option 1 (FK) is strongly preferred because it removes the possibility of orphaned progress rows if the API ever fails mid-delete. The planner must choose and commit to one approach.

### Risk 3: dnd-kit Peer Dependency with React 18
**What:** `@dnd-kit/core` 6.3.1 requires React 16.8+. The project uses React 18.3.0. No conflict.

**Note:** `@dnd-kit/sortable` and `@dnd-kit/utilities` are companion packages that must be installed alongside `@dnd-kit/core` for the `SortableContext` + `arrayMove` patterns used in the admin reorder UI. `@dnd-kit/accessibility` (for `aria-label` on drag handles) is listed in the UI-SPEC accessibility contracts but is optional — the accessibility labels can be applied manually without it.

### Risk 4: Admin Route Group Not in Middleware
**What:** The admin `(admin)` route group will render as `/admin/*` URLs. The middleware currently does not include `/admin` in the `isProtected` list.

**Resolution:** Add `pathname.startsWith('/admin')` to the `isProtected` guard in `middleware.ts`. The `(admin)` layout provides a second layer (redirect on `!isAdmin`), but middleware is the first line of defense.

### Risk 5: `before_release` Collapse Logic Requires Project Release Date
**What:** The "Before release" section auto-collapses when `project.release_date` is in the past. The per-project room server component must fetch `release_date` from `vault_projects`.

**Resolution:** Include `release_date` in the server component's `vault_projects` select query. Pass it to `LaunchpadRoom` as a prop. The collapse state is initialized server-side (collapsed = release_date < today) and managed client-side with React state.

### Risk 6: `sort_order` Conflicts on Seed Insert
**What:** If seed data is inserted with explicit `sort_order` values and then admin reorders items, there is no auto-increment or gap management — sort orders can become non-contiguous.

**Resolution:** The PATCH reorder endpoint must accept an array of `{ key, sort_order }` objects and update all of them in a single transaction (or sequential updates within one API call). The client sends the full reordered list's keys with their new integer positions (0-indexed) after every drop.

### Risk 7: `tip_draft` Column Not in CONTEXT.md Table DDL
**What:** The CONTEXT.md DDL for `launchpad_checklist_items` includes both `tip_body` (approved tip) and `tip_draft` (pending AI draft). However the tip approval workflow at `/admin/tips` reads `tip_draft` and promotes it to `tip_body` on approve. The `tip_draft` column is included in the CONTEXT.md DDL — this is intentional design, not a gap.

**Planner note:** The admin tips page (`TipsAdmin` component) must display `tip_draft` text (editable), not `tip_body`. On approve: copy `tip_draft` → `tip_body`, set `tip_approved = true`, clear `tip_draft`. On reject: clear `tip_draft`, leave `tip_body` as-is.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.0.0 | Server components, dynamic routes | Already in project |
| Supabase JS | 2.45.0 | DB, RLS, auth | Already in project |
| React | 18.3.0 | UI components | Already in project |
| Tailwind CSS | 3.4.0 | Styling | Already in project |
| Zod | 3.23.0 | API input validation | Already in project |

### New Dependencies
| Library | Version | Purpose | Verdict |
|---------|---------|---------|---------|
| `@dnd-kit/core` | 6.3.1 | Drag-and-drop primitives | OK [VERIFIED: npm registry] |
| `@dnd-kit/sortable` | 10.0.0 | `SortableContext`, `useSortable` hook | OK [VERIFIED: npm registry] |
| `@dnd-kit/utilities` | 3.2.2 | `CSS.Transform.toString()` helper | OK [VERIFIED: npm registry] |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@dnd-kit/core` | npm | ~4 yrs (Dec 2024 last pub) | 18.5M/wk | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/sortable` | npm | ~4 yrs (Dec 2024 last pub) | 18.3M/wk | github.com/clauderic/dnd-kit | OK | Approved |
| `@dnd-kit/utilities` | npm | ~5 yrs (Nov 2023 last pub) | 18.4M/wk | github.com/clauderic/dnd-kit | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Artist Browser
    │
    ├── GET /launchpad/[projectId]
    │       └── Server Component
    │               ├── createServerClient().auth.getUser()
    │               ├── vault_projects (title, release_date)
    │               ├── launchpad_checklist_items (WHERE tip_approved=true OR tip IS NULL → filter at API)
    │               ├── launchpad_progress (WHERE user_id=uid AND project_id=pid)
    │               └── → LaunchpadRoom (client component)
    │                       ├── ChecklistSection × 4 (before_release / week_1 / week_2 / weeks_3_4)
    │                       │       └── ChecklistItem × N (checkbox + row click)
    │                       └── TipPanel (right drawer, opens on row click)
    │
    ├── PATCH /api/launchpad/[projectId]/progress
    │       └── createApiClient().auth.getUser()
    │       └── UPSERT launchpad_progress (RLS: user_id = auth.uid())
    │
Admin Browser
    │
    ├── GET /admin/checklist
    │       └── (admin) layout: createServerClient() + is_admin check
    │       └── ChecklistAdmin (client component)
    │               └── GET /api/admin/checklist → all items
    │               └── POST/PATCH/DELETE /api/admin/checklist/[itemKey]
    │
    └── GET /admin/tips
            └── (admin) layout (shared gate)
            └── TipsAdmin (client component)
                    └── GET /api/admin/tips → pending tip drafts
                    └── PATCH /api/admin/tips/[itemKey] → approve/reject
```

### Recommended Project Structure

```
app/
├── (artist)/launchpad/
│   ├── page.tsx                    # MODIFIED: add ProjectCards above existing playbook
│   └── [projectId]/
│       └── page.tsx                # NEW: per-project Launchpad room (server component)
├── (admin)/
│   ├── layout.tsx                  # NEW: is_admin gate + admin nav
│   ├── checklist/
│   │   └── page.tsx                # NEW: admin checklist CRUD page
│   └── tips/
│       └── page.tsx                # NEW: admin tip approval page
├── api/
│   ├── launchpad/
│   │   └── [projectId]/
│   │       ├── checklist/
│   │       │   └── route.ts        # GET: items + progress merged
│   │       └── progress/
│   │           └── route.ts        # PATCH: toggle completion
│   └── admin/
│       ├── checklist/
│       │   ├── route.ts            # GET list, POST new item
│       │   └── [itemKey]/
│       │       └── route.ts        # PATCH edit, DELETE item
│       └── tips/
│           ├── route.ts            # GET pending drafts
│           └── [itemKey]/
│               └── route.ts        # PATCH approve/reject

components/
├── launchpad/
│   ├── LaunchpadRoom.tsx           # NEW: per-project container (client)
│   ├── ChecklistSection.tsx        # NEW: section with collapse behavior
│   ├── ChecklistItem.tsx           # NEW: row: checkbox + label + row click
│   └── TipPanel.tsx                # NEW: right side panel
└── admin/
    ├── ChecklistAdmin.tsx          # NEW: CRUD + dnd-kit reorder
    └── TipsAdmin.tsx               # NEW: approve/reject tip drafts

lib/launchpad/
└── playbook.ts                     # UNCHANGED (global page still uses it)

supabase/migrations/
└── 028_launchpad_checklist.sql     # NEW: two tables + RLS + seed

types/
└── index.ts                        # ADD: ChecklistItem, LaunchpadProgress types
```

### Pattern 1: Merged Checklist + Progress Query
The GET `/api/launchpad/[projectId]/checklist` endpoint must return checklist items with user progress merged. Two options:

Option A — Two queries, merge in TypeScript (matches existing codebase pattern):
```typescript
// Source: pattern from app/api/vault/[projectId]/route.ts
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
  completed: progressMap.get(item.key)?.completed ?? false,
  completed_at: progressMap.get(item.key)?.completed_at ?? null,
}))
```

Option B — Supabase LEFT JOIN via foreign key (requires FK between tables). Only viable if `launchpad_progress.item_key` has a FK to `launchpad_checklist_items.key`.

**Recommendation:** Use Option A (two queries, merge in TS) — matches existing codebase pattern, no schema dependency.

### Pattern 2: dnd-kit Sortable Admin Rows
```typescript
// Source: dnd-kit official docs pattern [ASSUMED]
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// In ChecklistAdmin:
function ChecklistAdmin({ items }: { items: ChecklistItem[] }) {
  const [localItems, setLocalItems] = useState(items)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLocalItems(prev => {
      const oldIdx = prev.findIndex(i => i.key === active.id)
      const newIdx = prev.findIndex(i => i.key === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      // Persist: send full reordered keys with new sort_order positions
      void persistOrder(reordered.map((item, idx) => ({ key: item.key, sort_order: idx })))
      return reordered
    })
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localItems.map(i => i.key)} strategy={verticalListSortingStrategy}>
        {localItems.map(item => <SortableRow key={item.key} item={item} />)}
      </SortableContext>
    </DndContext>
  )
}

// In SortableRow:
function SortableRow({ item }: { item: ChecklistItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  return (
    <div ref={setNodeRef} style={style}>
      <button {...attributes} {...listeners} aria-label={`Drag to reorder ${item.label}`}>
        {/* 6-dot grip icon */}
      </button>
      {/* rest of row */}
    </div>
  )
}
```

### Pattern 3: Admin API Route is_admin Check
```typescript
// Source: pattern derived from createApiClient() convention [ASSUMED - no existing admin route]
import { createApiClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ... proceed with admin operation using createServiceClient() for writes
}
```

### Anti-Patterns to Avoid

- **Checking `is_admin` only in layout, not in API routes:** The layout redirect protects the page but not the API. Any admin mutation route must re-verify `is_admin` independently.
- **Using `createServiceClient()` without verifying `is_admin` first:** Service role bypasses RLS. Always verify the session is an admin via `createApiClient()` before switching to `createServiceClient()` for the actual write.
- **Rendering `tip_draft` to artists:** The artist-facing checklist GET must filter to `tip_approved = true`; drafts are admin-only. Do not expose `tip_draft` or unapproved `tip_body` in the artist API response.
- **Calling the `/api/launchpad/[projectId]/checklist` GET from the server component directly:** The server component should query Supabase directly (not via `fetch('/api/...')`), following the established pattern in the codebase.
- **Using `gen_random_uuid()` in the migration:** All migrations use `uuid_generate_v4()`. Using `gen_random_uuid()` in migration 028 would be an inconsistency.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop row reorder | Custom mouse/touch event handlers | `@dnd-kit/sortable` | Touch support, keyboard accessibility, scroll-aware, pointer events across browsers |
| UUID generation in SQL | Custom sequence or manual ID | `uuid_generate_v4()` (already enabled in DB) | Extension already registered in all migrations |
| `updated_at` triggers | Custom trigger per table | Reuse `update_updated_at()` from migration 001 | Already defined, no re-creation needed |
| Array reorder algorithm | Custom index swap logic | `arrayMove` from `@dnd-kit/sortable` | Handles edge cases (first/last position, same position) |
| CSS transform for dragging | Manual `transform` string | `CSS.Transform.toString(transform)` from `@dnd-kit/utilities` | Handles translate + scale + rotate correctly |

---

## Seed Data

The following items should be seeded in migration `028_launchpad_checklist.sql` in an `INSERT INTO launchpad_checklist_items` block. All items seed with `tip_approved = false` and `tip_body = NULL` (no tips until admin drafts and approves them). `sort_order` values start at 0 and increment within each section.

### Before Release (`section = 'before_release'`, `suggested_week = 0`)

| key | label | action_type | action_href | action_label | sort_order |
|-----|-------|-------------|-------------|--------------|------------|
| `presave_link` | Set up a pre-save link | `external_url` | `https://distrokid.com/hyperfollow` | Create pre-save on DistroKid | 0 |
| `spotify_editorial_pitch` | Pitch Spotify editorial | `internal_tool` | `/vault` | Open Sound Vault | 1 |
| `canvas_clips` | Create Spotify Canvas / Clips | `external_url` | `https://artists.spotify.com/home` | Open Spotify for Artists | 2 |
| `social_teasers` | Post social teasers | `internal_tool` | `/vault` | Open Sound Vault | 3 |
| `epk_ready` | Press kit (EPK) ready | `internal_tool` | `/vault` | Open Sound Vault | 4 |

### Week 1 — Release week (`section = 'week_1'`, `suggested_week = 1`)

| key | label | action_type | action_href | action_label | sort_order |
|-----|-------|-------------|-------------|--------------|------------|
| `announce_platforms` | Announce across platforms | `internal_tool` | `/vault` | Open Sound Vault | 0 |
| `email_list_push` | Push to email list | `external_url` | `https://mailchimp.com` | Open Mailchimp | 1 |
| `save_to_stream_prompt` | Ask fans to save (not just stream) | `external_url` | null | — | 2 |
| `curator_pitches_week1` | Send first curator pitches | `internal_tool` | `/tools/pitchplug` | Open PitchPlug | 3 |
| `engagement_sprint` | Engagement sprint: comments & shares | `external_url` | null | — | 4 |

### Week 2 (`section = 'week_2'`, `suggested_week = 2`)

| key | label | action_type | action_href | action_label | sort_order |
|-----|-------|-------------|-------------|--------------|------------|
| `bts_content` | Post behind-the-scenes content | `external_url` | null | — | 0 |
| `listener_reactions` | Share listener reactions | `external_url` | null | — | 1 |
| `playlist_followup` | Follow up on playlist pitches | `internal_tool` | `/tools/pitchplug` | Open PitchPlug | 2 |
| `benchmark_check` | Check benchmark readiness | `internal_tool` | `/benchmarks` | Open Benchmarks | 3 |

### Weeks 3–4 (`section = 'weeks_3_4'`, `suggested_week = 3`)

| key | label | action_type | action_href | action_label | sort_order |
|-----|-------|-------------|-------------|--------------|------------|
| `lyric_pull_posts` | Post lyric pull content | `external_url` | null | — | 0 |
| `ugc_push` | Push UGC (user-generated content) | `external_url` | null | — | 1 |
| `discovery_mode` | Set up Spotify Discovery Mode | `external_url` | `https://artists.spotify.com/home` | Open Spotify for Artists | 2 |
| `spotify_ads` | Run Spotify / Meta ads | `external_url` | `https://adstudio.spotify.com` | Open Spotify Ad Studio | 3 |
| `rights_cleanup` | Complete rights registrations | `internal_tool` | `/coach` | Open Rights Coach | 4 |
| `catalog_bridge` | Mention earlier releases | `external_url` | null | — | 5 |

**Notes on seed data:**
- `action_href = null` for items that have no specific destination yet (pure guidance)
- `action_label = null` for those items too; the TipPanel CTA button should be hidden when `action_href` is null
- The `DistroKid` URL for pre-save is `[ASSUMED]` — admin can update after seed
- All `Mailchimp` / social URLs are generic entry points; tips will provide specific instructions

---

## Implementation Risks (Continued)

### Common Pitfalls

**Pitfall 1: `params` must be awaited in Next.js 15**
In Next.js 15, dynamic route params in API routes are a `Promise`. Every route handler using `[projectId]` or `[itemKey]` must `await params` before destructuring:
```typescript
const { projectId } = await params  // correct
const { projectId } = params        // WRONG — TypeScript error in Next.js 15
```
This is already established in the existing `app/api/vault/[projectId]/route.ts` — copy the pattern exactly.

**Pitfall 2: Optimistic checkbox update must roll back on error**
The checkbox in `ChecklistItem` should update local `completed` state immediately on click, then send the PATCH. If the PATCH returns an error, the component must revert to the previous value. Using a local `useState` with rollback (set to previous on error) rather than just relying on a re-fetch prevents the flickering UX.

**Pitfall 3: `before_release` collapse: no release_date means always expanded**
If `project.release_date` is null, the Before Release section must always show expanded. The collapse should only trigger when `release_date` is a valid date in the past. The comparison must use UTC to avoid timezone edge cases:
```typescript
const isReleased = project.release_date
  ? new Date(project.release_date) < new Date()
  : false
```

**Pitfall 4: `sort_order` PATCH must update ALL reordered items atomically**
After a drag-and-drop, the client has a new full ordered array. The PATCH to persist order must send ALL item keys with their new `sort_order` values, not just the moved item. A single-item update will conflict with other items that now have the same `sort_order`.

**Pitfall 5: Supabase `upsert` for launchpad_progress requires conflict target**
```typescript
await supabase.from('launchpad_progress').upsert(
  { user_id: user.id, project_id: projectId, item_key: itemKey, completed, completed_at },
  { onConflict: 'user_id,project_id,item_key' }  // must specify the UNIQUE constraint columns
)
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected in project (`package.json` has no test runner) |
| Config file | None |
| Quick run command | Manual verification only |
| Full suite command | `npm run build` (TypeScript compile + lint as proxy) |

No automated test infrastructure exists in this project. Nyquist validation for Phase 5 is manual verification against acceptance criteria.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAUNCH-01 | Artist sees per-project Launchpad room with checklist | manual-smoke | Visit `/launchpad/{projectId}` in browser | N/A — no test file |
| LAUNCH-02 | Items grouped by week; internal links navigate; external links open new tab | manual-smoke | Click items in each section | N/A |
| LAUNCH-03 | Approved tips appear in TipPanel; unapproved do not | manual-smoke | Toggle `tip_approved` in DB; verify panel content | N/A |
| LAUNCH-04 | Checkbox persists after page reload | manual-smoke | Check item, reload, verify checked state | N/A |
| LAUNCH-05 | Admin can add/edit/reorder/delete items at `/admin/checklist` | manual-smoke | Perform CRUD + drag; verify changes appear on artist page | N/A |

### Sampling Rate

- **Per task commit:** `npm run build` (TypeScript compile, no type errors)
- **Per wave merge:** Full manual smoke test of all 5 LAUNCH requirements
- **Phase gate:** All 5 LAUNCH acceptance criteria verified before `/gsd-verify-work`

### Wave 0 Gaps

- [x] No test framework needed — `npm run build` is the proxy gate
- [ ] Manual test checklist document to be created in Wave 0 of execution

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser()` on every protected route; no unauthenticated access |
| V3 Session Management | yes | Supabase cookie-based session (no custom session logic) |
| V4 Access Control | yes | RLS on `launchpad_progress`; `is_admin` gate on all admin routes; service client only after verification |
| V5 Input Validation | yes | Zod schemas on all admin API POST/PATCH bodies; explicit allowlist for editable fields (follow `vault/[projectId]/route.ts` sanitize pattern) |
| V6 Cryptography | no | No custom crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Artist accesses another artist's progress | Elevation of Privilege | RLS: `USING (auth.uid() = user_id)` on `launchpad_progress`; API routes also `.eq('user_id', user.id)` |
| Non-admin accesses `/admin/*` routes | Elevation of Privilege | `is_admin` check in layout (redirect) + every admin API route (401/403) |
| Non-admin calls admin API directly (bypassing layout) | Elevation of Privilege | Admin API routes independently verify `is_admin` — layout alone is insufficient |
| Unapproved tip body exposed to artist | Information Disclosure | Artist-facing GET filters `WHERE tip_approved = true`; never returns `tip_draft` column |
| Mass assignment on checklist item PATCH | Tampering | Explicit allowlist of patchable fields (label, section, action_type, action_href, action_label, sort_order) — same pattern as `EDITABLE_FIELDS` in `app/api/profile/route.ts` |
| SQL injection via `item_key` in DELETE path | Tampering | Supabase client uses parameterized queries automatically; `itemKey` is validated against a regex (alphanumeric + underscore) before use |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `user.app_metadata.is_admin` is the correct path to the Supabase `raw_app_meta_data.is_admin` flag | Implementation Risks: is_admin check | Admin gate silently fails to block non-admins; test this with an actual Supabase session in dev |
| A2 | dnd-kit `@dnd-kit/sortable` 10.0.0 is compatible with `@dnd-kit/core` 6.3.1 (major version jump on sortable) | Standard Stack | Breaking change in sortable API; pin to matching versions from dnd-kit changelog |
| A3 | DistroKid hyperfollow URL (`distrokid.com/hyperfollow`) is the correct pre-save entry point | Seed Data | Admin will need to update after seeding; low risk since seed is admin-managed |
| A4 | `items: localItems.map(i => i.key)` is the correct way to set dnd-kit item IDs (using `key` text field, not UUID) | Architecture Patterns: dnd-kit | If dnd-kit requires numeric IDs, use `id` UUID column instead and track reorder by `id` |

---

## Open Questions

1. **FK on `launchpad_progress.item_key` vs API-level cascade**
   - What we know: Hard delete is locked; progress rows must be removed when an item is deleted
   - What's unclear: CONTEXT.md says "ON DELETE CASCADE (set on a FK or handled in the API)" — not chosen yet
   - Recommendation: Use FK (`REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE`) — simpler, safer

2. **dnd-kit `@dnd-kit/sortable` major version mismatch**
   - What we know: npm registry shows `@dnd-kit/core` at 6.3.1 and `@dnd-kit/sortable` at 10.0.0 — the sortable package had a major version bump
   - What's unclear: Whether the API for `useSortable` and `SortableContext` changed in v10 vs v6
   - Recommendation: Check the dnd-kit changelog before writing any sortable code; if v10 has breaking changes from v6 docs, use v10 docs not v6 docs

3. **`action_href = null` items in TipPanel CTA**
   - What we know: Several seed items have no actionable URL yet
   - What's unclear: Should the TipPanel hide the CTA button entirely, or show a disabled/grayed button?
   - Recommendation: Hide the CTA entirely when `action_href` is null; show only tip body + steps

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js build | inferred ✓ | inferred from npm | — |
| npm | Package install | ✓ | from package-lock.json | — |
| Supabase CLI | `db:push` migration | ✓ | `supabase@1.200.0` (devDep) | Manual SQL exec in Studio |
| `@dnd-kit/core` | Admin reorder UI | ✗ (not installed) | — | Must install before admin component |
| `@dnd-kit/sortable` | Admin reorder UI | ✗ (not installed) | — | Must install before admin component |
| `@dnd-kit/utilities` | Admin reorder UI | ✗ (not installed) | — | Must install before admin component |

**Missing dependencies with no fallback:**
- `@dnd-kit/*` packages — must be installed as part of Wave 0 before admin components are built

---

## Sources

### Primary (HIGH confidence)
- Codebase grep — all patterns verified against actual source files in `/Users/peterzora/Desktop/funun/` [VERIFIED: codebase grep]
- `package.json` — confirmed dependency versions and absence of dnd-kit [VERIFIED: codebase grep]
- `supabase/migrations/` (001–027) — confirmed UUID convention, RLS patterns, trigger reuse [VERIFIED: codebase grep]

### Secondary (MEDIUM confidence)
- `npm view @dnd-kit/core` — confirmed 6.3.1, 18.5M weekly downloads, github.com/clauderic/dnd-kit [VERIFIED: npm registry]
- `npm view @dnd-kit/sortable` — confirmed 10.0.0 [VERIFIED: npm registry]
- `npm view @dnd-kit/utilities` — confirmed 3.2.2 [VERIFIED: npm registry]
- GSD package-legitimacy seam — all three dnd-kit packages returned OK verdict [VERIFIED: npm registry]

### Tertiary (LOW confidence)
- dnd-kit API patterns (`DndContext`, `SortableContext`, `useSortable`, `arrayMove`) — from training knowledge [ASSUMED] — verify against dnd-kit v6/v10 changelog before implementation

---

## Metadata

**Confidence breakdown:**
- Existing patterns: HIGH — all verified by direct file read
- New infrastructure inventory: HIGH — verified by `ls` and grep
- dnd-kit API: LOW — training knowledge; sortable v10 may have breaking changes vs v6
- Migration conventions: HIGH — verified across 27 migrations
- Admin auth pattern: MEDIUM — `user.app_metadata` path confirmed as Supabase SDK pattern but not yet implemented in codebase

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable stack; dnd-kit major version question is the only volatility)
