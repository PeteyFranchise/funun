# Phase 7: Social Campaign Planner - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 20 (per RESEARCH.md's "Recommended Project Structure")
**Analogs found:** 20 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/033_social_campaigns.sql` | migration | CRUD | `supabase/migrations/030_curators_pitch_history.sql` (+ `032_curators_claim_token_unique.sql`) | exact |
| `lib/launchpad/campaigns.ts` | model/utility (JSONB read/sanitize) | transform | `lib/metadata/schema.ts` (`readComposers`/`sanitizeComposers`) | exact |
| `lib/launchpad/platform-nudges.ts` | utility (pure lookup) | transform | `lib/benchmarks/engine.ts` (`GENRE_FACTORS` lookup) | exact |
| `lib/tools/registry.ts` (extended) | service (prompt builder) | request-response | itself, `buildDropReadyPrompt`/`buildSoundBaitPrompt` | exact |
| `app/api/launchpad/[projectId]/campaigns/route.ts` | route/controller | CRUD | `app/api/tools/[slug]/route.ts` | role-match |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/route.ts` | route/controller | CRUD | `app/api/launchpad/[projectId]/progress/route.ts` (PATCH pattern) + `app/api/profile/route.ts` (allowlist pattern) | role-match |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts` | route/controller | request-response (AI, no write) | `app/api/tools/[slug]/route.ts` | exact |
| `app/api/launchpad/[projectId]/campaigns/[campaignId]/export/route.ts` | route/controller | file-I/O (CSV export) | `app/api/vault/[projectId]/metadata/export/route.ts` | exact |
| `components/launchpad/PlatformSelector.tsx` | component | CRUD (selection state) | `components/curators/CuratorCard.tsx` (multi-select checkbox + badge) | role-match |
| `components/launchpad/CampaignCalendar.tsx` | component (container) | event-driven (optimistic PATCH) | `components/launchpad/LaunchpadRoom.tsx` | exact |
| `components/launchpad/CampaignSlot.tsx` | component (row) | event-driven | `components/launchpad/ChecklistItem.tsx` | exact |
| `components/launchpad/SlotGeneratePanel.tsx` | component (panel) | request-response (preview-accept) | `components/launchpad/TipPanel.tsx` | exact |
| `components/launchpad/SaveToCalendarPicker.tsx` | component (modal) | request-response | `components/launchpad/TipPanel.tsx` (shell logic) + `components/vault/ToolSidePanel.tsx`/`PitchComposer.tsx` (select fields) | role-match |
| `components/launchpad/CampaignHistoryList.tsx` | component (list) | CRUD (hard-delete) | `components/admin/ChecklistAdmin.tsx` (inline delete-confirm) | role-match |
| `app/(artist)/launchpad/[projectId]/page.tsx` (modified) | route (server component) | request-response | itself (existing file, Phase 6's stacking addition) | exact |

## Pattern Assignments

### `supabase/migrations/033_social_campaigns.sql` (migration, CRUD)

**Analog:** `supabase/migrations/030_curators_pitch_history.sql`, `supabase/migrations/032_curators_claim_token_unique.sql`

**RLS pattern — denormalized owner column, not a join** (030, lines 65-81):
```sql
CREATE TABLE pitch_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID NOT NULL REFERENCES vault_projects(id) ON DELETE CASCADE,
  artist_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ...
);
ALTER TABLE pitch_history ENABLE ROW LEVEL SECURITY;
```
Apply identically: `social_campaigns` gets `project_id` + `user_id` columns, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` immediately after `CREATE TABLE` (CVE-2025-48757 convention), policy `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.

**"Exactly one" invariant — DB-level backstop, not app-logic-only** (032, full file):
```sql
DROP INDEX idx_curators_claim_token;
CREATE UNIQUE INDEX idx_curators_claim_token ON curators (claim_token) WHERE claim_token IS NOT NULL;
```
Apply as: `CREATE UNIQUE INDEX idx_social_campaigns_one_active_per_project ON social_campaigns (project_id) WHERE is_active;` written directly into 033 (not retrofitted later like 032 was) — combine with API-level two-step flip inside one request.

**Trigger reuse** (030, lines 51-54):
```sql
CREATE TRIGGER set_curators_updated_at
  BEFORE UPDATE ON curators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```
Reuse `update_updated_at()` (defined migration 001) for `social_campaigns.updated_at`.

Migration numbering confirmed: `032` is latest on disk → this phase's migration is `033_social_campaigns.sql`.

---

### `lib/launchpad/campaigns.ts` (model/utility, transform)

**Analog:** `lib/metadata/schema.ts` (`readComposers`/`sanitizeComposers`, lines 187-234)

**Read pattern** (lines 188-208):
```typescript
export function readComposers(metadata: Record<string, unknown> | null | undefined): Composer[] {
  const raw = metadata?.composers
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const role = COMPOSER_ROLE_VALUES.includes(o.role as ComposerRole) ? (o.role as ComposerRole) : 'composer_lyricist'
      const pro = PRO_VALUES.includes(o.pro as PRO) ? (o.pro as PRO) : 'none'
      const split = Number(o.split)
      return {
        name: String(o.name ?? '').trim(),
        role, pro,
        ipi: o.ipi ? String(o.ipi).trim() : undefined,
        split: Number.isFinite(split) ? split : 0,
      }
    })
    .filter(c => c.name)
}
```
Mirror exactly for `readPosts(posts: unknown): SocialPost[]` — validate `platform`/`content_type` against `PLATFORM_VALUES`/`CONTENT_TYPE_VALUES`, `week` against `[1,2,3,4]`, coerce strings, drop invalid rows via `.filter()`.

**Sanitize/allowlist pattern** (lines 213-234):
```typescript
export function sanitizeComposers(input: unknown): Composer[] {
  if (!Array.isArray(input)) return []
  const out: Composer[] = []
  for (const r of input) {
    const o = (r ?? {}) as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    ...
    out.push({ name, role, pro, split })
  }
  return out
}
```
Mirror for `sanitizeSlotEdit(input: unknown): Partial<Pick<SocialPost, 'caption' | 'posting_time' | 'completed'>>` — allowlist single fields only, never accept a full `posts` array from the client.

---

### `lib/launchpad/platform-nudges.ts` (utility, transform)

**Analog:** `lib/benchmarks/engine.ts` (`GENRE_FACTORS`, lines 81-139)

```typescript
const GENRE_FACTORS: Record<string, Partial<Targets>> = { /* ...genre slug keys... */ }
...
const factors = GENRE_FACTORS[(genre ?? '').trim().toLowerCase()] ?? {}
```
Mirror the defensive lowercase/trim lookup for `platform-nudges.ts`'s genre → platform map. Source genre slug list from `lib/genres.ts` (`GENRES` array, 20 slugs). Since `vault_projects.genre` is free text (not a slug — confirmed via `components/vault/EditProjectForm.tsx`'s plain `<input>`), prefer `artist_profiles.genres` (already slug array) as primary signal, fall back to fuzzy-matching free text with a small alias table, and degrade to no badge (never an error) on no match — same graceful-degradation posture as `GENRE_FACTORS[...] ?? {}`.

---

### `lib/tools/registry.ts` (extended — new prompt builders)

**Analog:** itself — `buildDropReadyPrompt`/`buildSoundBaitPrompt` tail convention

```typescript
export function buildSlotCaptionPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext,
  slot: { platform: string; week: number; content_type: string; existingCaption: string }
): string {
  return `You are a social media strategist writing ONE piece of release-day content...
Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{ "caption": "the single caption/hook for this slot" }`
}
```
Reuse `ToolProjectContext` type directly (already has title/genre/release_date/notes/trackTitles — extend with collaborator names as a separate argument, not a type change, since only the calendar prompt needs it). **Do not** register these as a 7th `ToolSlug` — dispatch directly from the new routes, bypassing `getTool()`/`buildToolPrompt()`.

---

### `app/api/launchpad/[projectId]/campaigns/route.ts` (controller, CRUD)

**Analog:** `app/api/tools/[slug]/route.ts` (full file, 126 lines)

**Imports pattern** (lines 1-6):
```typescript
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getTool, buildToolPrompt, type ToolProjectContext } from '@/lib/tools/registry'
import { addDemoToolOutput } from '@/lib/vault/demo-store'
```

**Auth pattern** (lines 46-50):
```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
Note: `middleware.ts`'s matcher excludes `api` paths — every new route must independently call `auth.getUser()`, cannot rely on middleware alone.

**Project fetch scoped by user_id** (lines 52-58):
```typescript
const { data: project } = await supabase
  .from('vault_projects')
  .select('id, title, type, genre, sub_genre, release_date, notes, tracks (title)')
  .eq('id', projectId)
  .eq('user_id', user.id)
  .maybeSingle()
if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
```

**Batch AI call + JSON extraction** (lines 11-22, 87-109) — reuse verbatim, raise `max_tokens` to 6000-8000 for the larger calendar payload (Pitfall 2):
```typescript
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}
const MODEL = 'claude-sonnet-4-6' // NOT lib/anthropic/index.ts's stale constant — see Pitfall 4
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
```

**Error handling** (lines 102-109):
```typescript
} catch (e) {
  const msg = e instanceof Error ? e.message : 'Generation failed'
  return NextResponse.json({ error: msg }, { status: 502 })
}
if (!output) return NextResponse.json({ error: 'Could not parse tool output' }, { status: 502 })
```

**Demo-mode branch** (lines 40-44) — check whether `lib/vault/demo-store.ts` covers Launchpad before deciding if this is needed (Open Question 2 in RESEARCH.md):
```typescript
if (DEMO) {
  const project = await addDemoToolOutput(projectId, { tool_slug: slug, title: tool.name })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json({ data: { demo: true } })
}
```

**Divergence from analog:** writes to `social_campaigns` (insert row with `platforms`, `posts` computed from AI output, `is_active: true`, and a same-request flip of any prior active campaign to `is_active: false`) instead of `tool_outputs`. GET (list campaigns)/PATCH (set active)/DELETE (inactive campaign, D-05) are new verbs this analog doesn't have — for PATCH/DELETE shape, see `app/api/launchpad/[projectId]/progress/route.ts` below.

---

### `.../slots/[slotId]/route.ts` (controller, CRUD — PATCH single slot)

**Analog:** `app/api/launchpad/[projectId]/progress/route.ts` (PATCH shape) + `app/api/profile/route.ts` (allowlist pattern, `EDITABLE_FIELDS`)

**Allowlist pattern** (`app/api/profile/route.ts` lines 8, 38):
```typescript
const EDITABLE_FIELDS = [ /* ... */ ]
for (const key of EDITABLE_FIELDS) { /* only copy allowlisted keys from body into update */ }
```
Apply to slot PATCH: load campaign scoped by `.eq('user_id', user.id)` first (IDOR mitigation — re-derive ownership from parent before touching `posts[]`, per RESEARCH.md's Known Threat Patterns table), locate slot by `id` inside `posts` array, apply only `sanitizeSlotEdit()`'s allowlisted fields (`caption`, `posting_time`, `completed` — setting `completed_at` server-side on the true-flip), re-save the full array. Never accept a client-supplied full `posts` array.

---

### `.../slots/[slotId]/generate/route.ts` (controller, request-response, AI preview-only)

**Analog:** `app/api/tools/[slug]/route.ts` (same auth/fetch/Anthropic/extractJson shape, but no DB write)

```typescript
export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string; slotId: string }> }) {
  // 1. auth.getUser()
  // 2. load campaign scoped by user_id, find slot by slotId in posts[]
  // 3. build slot-scoped prompt (buildSlotCaptionPrompt / buildSlotHookPrompt by platform)
  // 4. Anthropic call + extractJson()
  // 5. return NextResponse.json({ data: { caption: output.caption } }) — NO db write here
}
```
Preview-then-accept (D-10) — the write only happens via the PATCH slot route above, on explicit "Use this" click.

---

### `.../campaigns/[campaignId]/export/route.ts` (controller, file-I/O CSV export)

**Analog:** `app/api/vault/[projectId]/metadata/export/route.ts` (full file, 86 lines) + `lib/metadata/export.ts` (`csvCell`/`buildCsv`)

**Escaping helper — reuse verbatim** (`lib/metadata/export.ts` lines 203-206):
```typescript
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
```

**Download response shape** (export route, lines 79-84):
```typescript
return new Response(buildCsv(bundle), {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${slug}-metadata.csv"`,
  },
})
```
Apply identically, filename `${slug}-social-calendar.csv`, with `BUFFER_CSV_HEADERS = ['Text', 'Image URL', 'Tags', 'Posting Time']` (case-sensitive, per Buffer's bulk-upload spec). Query params carry the D-18 platform/week subset filter (filter `posts` before building rows — no blank rows for excluded slots). Must NOT use `.toISOString()` for Posting Time — use an explicit `YYYY-MM-DD HH:mm` formatter (Pitfall 3).

**Demo-mode gate** (export route, lines 23-25):
```typescript
if (DEMO) {
  return new Response('Export is not available in demo mode', { status: 400 })
}
```

---

### `components/launchpad/CampaignSlot.tsx` (component, event-driven)

**Analog:** `components/launchpad/ChecklistItem.tsx` (full file, 65 lines)

**Checkbox-independent-of-row-click pattern** (lines 22-53) — copy verbatim, adapt label→caption:
```tsx
<div className="... px-[18px] py-4 ..." onClick={() => onOpenPanel(item)} role="button" tabIndex={0}>
  <div className="shrink-0 p-2.5">
    <button
      role="checkbox" aria-checked={item.completed}
      className={`flex h-5 w-5 items-center justify-center rounded border transition ${
        item.completed ? 'border-emerald-400 bg-emerald-400' : 'border-white/20 bg-transparent hover:border-white/40'
      }`}
      onClick={e => { e.stopPropagation(); onToggle(item.key, !item.completed) }}
    >
      {item.completed && <svg .../>}
    </button>
  </div>
  <span className={`text-[14px] font-bold ${item.completed ? 'text-white/40 line-through' : 'text-white'}`}>
    {item.label}
  </span>
</div>
```
Per UI-SPEC: `CampaignSlot`'s caption text is NOT bold (body role, regular weight, prose-length) unlike `ChecklistItem`'s short bold label — everything else (checkbox markup, `p-2.5` 44×44 hit area, `stopPropagation`, `border-hair bg-card px-[18px] py-4` shell, completed → `text-white/40 line-through`) is a pixel-identical copy.

---

### `components/launchpad/CampaignCalendar.tsx` (component, container)

**Analog:** `components/launchpad/LaunchpadRoom.tsx` (full file, 177 lines)

**Optimistic update + re-fetch-on-failure rollback** (lines 49-123) — copy this exact control flow for slot edits/completion toggles/posting-time overrides:
```typescript
async function onToggle(key: string, completed: boolean) {
  const prior = items.find(i => i.key === key)
  setItems(prev => prev.map(i => (i.key === key ? { ...i, completed } : i))) // optimistic
  setSaveError(null)
  try {
    const res = await fetch(`/api/launchpad/${project.id}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: key, completed }),
    })
    if (!res.ok) {
      // Re-fetch authoritative state on failure (not blind rollback) — WR-02 fix
      const refetch = await fetch(`/api/launchpad/${project.id}/checklist`)
      if (refetch.ok) { const { data } = await refetch.json(); setItems(data) }
      else { setItems(prev => prev.map(i => (i.key === key ? { ...i, completed: prior.completed } : i))) }
      setSaveError("Couldn't save your progress — please try again.")
    }
  } catch { /* same re-fetch-then-fallback pattern */ }
}
```

**Empty state** (lines 144-151):
```tsx
<div className="rounded-[14px] border border-hair bg-card px-[18px] py-10 text-center">
  <p className="text-[15px] font-bold text-white">Checklist is being set up</p>
  <p className="mt-2 text-[13px] text-lavdim">...</p>
</div>
```
Reuse verbatim shape with UI-SPEC's copy ("No campaign yet" / empty-state body) + centered "Generate calendar" CTA (`bg-grad shadow-cta`).

**Section spacing** (line 155): `space-y-9` — reuse for week-grouped sections (weeks 1-4, matching `ChecklistSection.tsx`'s grouping rhythm per UI-SPEC).

---

### `components/launchpad/SlotGeneratePanel.tsx` (component, request-response preview panel)

**Analog:** `components/launchpad/TipPanel.tsx` (full file, 86 lines) — **reuse the shell verbatim** per UI-SPEC's explicit instruction.

**Shell + Escape/backdrop dismissal** (lines 24-44):
```tsx
useEffect(() => {
  if (!item) return
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [item, onClose])
...
<div className="fixed inset-0 z-50 flex justify-end">
  <button aria-label="Close tip panel" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
  <aside className="relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl">
```

**Footer CTA pattern** (lines 71-82) — adapt to two buttons ("Discard" secondary + "Use this" primary `bg-grad shadow-cta`) instead of TipPanel's single conditional CTA:
```tsx
<div className="border-t border-white/10 p-5">
  {item.action_href && (
    <a href={item.action_href} className="block w-full rounded-lg bg-white px-4 py-2.5 text-center text-sm font-bold text-black transition hover:bg-white/90">
      {item.action_label}
    </a>
  )}
</div>
```

---

### `components/launchpad/CampaignHistoryList.tsx` (component, list with hard-delete)

**Analog:** `components/admin/ChecklistAdmin.tsx` (inline delete-confirm pattern, lines ~281-302, ~460-486)

**Inline confirm block (never `window.confirm`)**:
```tsx
{/* Inline delete confirm */}
<div role="alert" className="rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4">
  <p>Delete this item? All artist progress on it will be permanently removed. This cannot be undone.</p>
  <button onClick={onDeleteConfirm} className="...">{saving ? 'Deleting…' : 'Delete item'}</button>
  <button onClick={onDeleteCancel} className="...">Cancel</button>
</div>
```
```typescript
const handleDeleteClick = (key: string) => { /* sets confirm-pending state */ }
const handleDeleteConfirm = async () => { /* DELETE fetch, then remove from local list */ }
const handleDeleteCancel = () => { /* clears confirm-pending state */ }
```
Apply identically for campaign hard-delete (D-05) — copy for `CampaignHistoryList` per UI-SPEC Copywriting Contract ("Delete this campaign? All {N} slots...").

---

## Shared Patterns

### Auth + ownership scoping (every new API route)
**Source:** `app/api/tools/[slug]/route.ts` lines 46-58
**Apply to:** all `app/api/launchpad/[projectId]/campaigns/**` routes
```typescript
const supabase = createApiClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// ...then scope every query with .eq('user_id', user.id)
```
Note: `middleware.ts`'s matcher excludes `/api/*` — this check cannot be skipped in any new route.

### Batch AI JSON call + fenced-JSON extraction
**Source:** `app/api/tools/[slug]/route.ts` lines 9-22, 87-101
**Apply to:** calendar-generation route, slot-scoped generation route
```typescript
const MODEL = 'claude-sonnet-4-6' // do NOT import lib/anthropic/index.ts's dead constant
function extractJson(text: string): Record<string, unknown> | null { /* fenced-JSON + brace-matching */ }
```

### JSONB read/sanitize (never trust raw client or raw AI JSONB)
**Source:** `lib/metadata/schema.ts` `readComposers`/`sanitizeComposers`
**Apply to:** `lib/launchpad/campaigns.ts`'s `readPosts()`/`sanitizeSlotEdit()` — run enum validation on AI-generated output too, not just human edits.

### CSV escaping + download response
**Source:** `lib/metadata/export.ts` `csvCell()`; `app/api/vault/[projectId]/metadata/export/route.ts` response headers
**Apply to:** `campaigns/[campaignId]/export/route.ts`

### Optimistic PATCH + re-fetch-on-failure rollback
**Source:** `components/launchpad/LaunchpadRoom.tsx` `onToggle()`
**Apply to:** `CampaignCalendar.tsx` (completion toggle, inline caption edit, posting-time override, platform selection change)

### Checkbox-independent-of-detail-interaction
**Source:** `components/launchpad/ChecklistItem.tsx` (checkbox `e.stopPropagation()`)
**Apply to:** `CampaignSlot.tsx` completion checkbox (must never trigger inline-edit or open `SlotGeneratePanel`)

## No Analog Found

None — RESEARCH.md's own audit confirms every mechanical piece this phase needs has a working precedent already in the repo (see RESEARCH.md "Don't Hand-Roll" and "Summary" sections). The two components without a pixel-identical sibling (`PlatformSelector.tsx`'s genre-nudge badge, `SaveToCalendarPicker.tsx`'s centered-modal shell) still have strong partial analogs (`CuratorCard.tsx`'s badge treatment; `TipPanel.tsx`'s backdrop/dismissal logic + `PitchComposer.tsx`'s select-field styling) documented above.

## Metadata

**Analog search scope:** `components/launchpad/`, `components/admin/`, `components/curators/`, `app/api/tools/`, `app/api/launchpad/`, `app/api/vault/[projectId]/metadata/`, `lib/metadata/`, `lib/tools/`, `lib/benchmarks/`, `supabase/migrations/030-032`
**Files scanned:** ChecklistItem.tsx, TipPanel.tsx, ChecklistSection.tsx, LaunchpadRoom.tsx, ChecklistAdmin.tsx, CuratorCard.tsx, PitchComposer.tsx, app/api/tools/[slug]/route.ts, app/api/vault/[projectId]/metadata/export/route.ts, lib/metadata/export.ts, lib/metadata/schema.ts, lib/tools/registry.ts, lib/genres.ts, lib/benchmarks/engine.ts, migrations 030/032, app/api/profile/route.ts, app/(artist)/launchpad/[projectId]/page.tsx
**Pattern extraction date:** 2026-07-03
