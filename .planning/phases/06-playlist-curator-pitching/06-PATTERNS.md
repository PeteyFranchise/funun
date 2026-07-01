# Phase 6: Playlist Curator Pitching - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 27
**Analogs found:** 24 / 27

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/0XX_curators.sql` | migration | CRUD | `supabase/migrations/0XX_launchpad_checklist.sql`-style table + RLS pattern (see `lib/admin/gate.ts` EDITABLE_FIELDS / SECTION_VALUES comments) | role-match |
| `supabase/migrations/0XX_pitch_history.sql` | migration | CRUD | same as above; unique-constraint precedent given directly in RESEARCH.md Code Examples | role-match |
| `lib/curators/tokens.ts` | utility | request-response | `lib/split-sheets/approval.ts` | exact |
| `lib/curators/reach.ts` | utility | event-driven (scheduled fetch) | `lib/email/index.ts` (graceful no-op pattern) | role-match |
| `lib/curators/drift.ts` | utility | transform | `lib/split-sheets/approval.ts` (`validateApprovalTotal`, pure function style) | partial |
| `lib/curators/pitch-copy.ts` (AI prompt builder) | utility | transform | `lib/tools/pitchplug.ts` | exact |
| `lib/webhooks/resend-verify.ts` | utility | event-driven | none (first webhook in codebase) — RESEARCH.md Pattern 1 is the reference | no analog |
| `lib/admin/curators-gate.ts` (or extend `lib/admin/gate.ts`) | utility | request-response | `lib/admin/gate.ts` | exact |
| `lib/email/index.ts` (extend with `from` override) | utility | request-response | itself (modify in place) | exact |
| `lib/notifications/index.ts` (reuse, no changes needed) | utility | event-driven | itself (reuse verbatim) | exact |
| `lib/industry-roles.ts` (add "Playlist Curator") | config | CRUD | itself (modify in place) | exact |
| `app/api/admin/curators/route.ts` | route | CRUD | `app/api/admin/checklist/route.ts` | exact |
| `app/api/admin/curators/[id]/route.ts` | route | CRUD | `app/api/admin/checklist/[itemKey]/route.ts` | exact |
| `app/api/curators/route.ts` (artist-facing directory GET) | route | request-response | `app/api/collaborators/route.ts` (GET list pattern) | role-match |
| `app/api/curators/claim/[token]/route.ts` | route | request-response | RESEARCH.md Pattern 4 (new precedent) + `lib/split-sheets/approval.ts` token shape | partial |
| `app/api/curators/[id]/route.ts` (curator self-serve PATCH) | route | CRUD | `app/api/profile/route.ts` (EDITABLE_FIELDS allowlist PATCH pattern) | exact |
| `app/api/pitches/route.ts` (POST create + send) | route | request-response | `app/api/tools/pitchplug/route.ts` (send sub-route) + `app/api/admin/checklist/route.ts` (validation shape) | role-match |
| `app/api/pitches/draft/route.ts` (AI draft) | route | request-response | `app/api/tools/pitchplug/route.ts` | exact |
| `app/api/pitch/accept/[token]/route.ts` | route | request-response | RESEARCH.md Pattern 5 (new precedent, built from `lib/split-sheets/approval.ts` shape) | partial |
| `app/api/pitch/decline/[token]/route.ts` | route | request-response | same as accept, + optional body field | partial |
| `app/api/cron/curator-reach/route.ts` | route | batch | none (first cron route) — RESEARCH.md Pattern 2 is the reference | no analog |
| `app/api/webhooks/resend/route.ts` | route | event-driven | none (first webhook route) — RESEARCH.md Pattern 1 is the reference | no analog |
| `app/(admin)/curators/page.tsx` | route (page) | request-response | `app/(admin)/checklist/page.tsx` (mirrors `ChecklistAdmin.tsx` usage) | exact |
| `app/(artist)/curators/page.tsx` | route (page) | request-response | `app/(artist)/launchpad/page.tsx`-style server component + searchParams filter (no direct file read this session; same SSR+searchParams convention noted in RESEARCH.md) | role-match |
| `app/(curator-portal)/layout.tsx` | provider | request-response | `app/(admin)/layout.tsx` | exact |
| `app/(curator-portal)/portal/page.tsx` | component | CRUD | `app/(admin)/checklist/page.tsx` + curator self-serve form styled like composer textarea | partial |
| `app/pitch/accept/[token]/page.tsx` | component | request-response | `app/(auth)/layout.tsx` shell (centered card) | role-match |
| `app/pitch/decline/[token]/page.tsx` | component | request-response | `app/(auth)/layout.tsx` shell + form | role-match |
| `app/curators/claim/[token]/page.tsx` | component | request-response | `app/(auth)/layout.tsx` shell | role-match |
| `components/admin/CuratorAdmin.tsx` | component | CRUD | `components/admin/ChecklistAdmin.tsx` (minus dnd-kit) | exact |
| `components/curators/CuratorCard.tsx` | component | CRUD (display) | `components/collaborators/CollaboratorCard.tsx` | exact |
| `components/curators/PitchComposer.tsx` | component | request-response | `components/tools/PitchCard.tsx` | exact |
| `components/curators/PitchHistoryList.tsx` | component | CRUD (display) | `components/vault/DocumentCard.tsx` (STATUS_META badge pattern) | exact |
| `vercel.json` | config | batch | none (first crons config) — RESEARCH.md Pattern 2 | no analog |
| `middleware.ts` (no change — curator routes deliberately excluded) | middleware | request-response | itself (read-only reference) | exact |

## Pattern Assignments

### `lib/curators/tokens.ts` (utility, request-response)

**Analog:** `lib/split-sheets/approval.ts` (read in full, 55 lines)

**Full pattern to copy verbatim (adapt names only):**
```typescript
import { randomBytes } from 'crypto'

export const CLAIM_TOKEN_EXPIRY_HOURS = 72 // D-18: 72h expiry, one-time use

export function generateClaimToken(): string {
  return randomBytes(32).toString('hex')
}

export function generateResponseToken(): string {
  return randomBytes(32).toString('hex')
}
```
Note: this codebase's established token shape is `randomBytes(32).toString('hex')` (256 bits) — do not introduce a JWT or third-party token library. Same shape covers claim tokens (D-18, 72h expiry) and pitch response tokens (D-11, no expiry stated — one-time-use via `status !== 'pending'` guard instead, per RESEARCH.md Pattern 5).

---

### `lib/curators/reach.ts` (utility, event-driven / graceful no-op)

**Analog:** `lib/email/index.ts` (read in full, 36 lines)

**No-op-when-unconfigured pattern to copy** (lines 16-20 of analog):
```typescript
const apiKey = process.env.RESEND_API_KEY
const from = process.env.RESEND_FROM_EMAIL
if (!apiKey || !from) {
  return { ok: false, error: 'Email not configured' }
}
```
Apply identically for `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` and `YOUTUBE_API_KEY` — return `null` (not throw) when unset, and wrap the actual fetch in try/catch returning `null` on any failure (never let one curator's fetch error break the cron loop). Full implementation already provided in RESEARCH.md Pattern 3 — copy directly.

**Error handling pattern** (lines 31-35 of analog):
```typescript
} catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : 'Email failed' }
}
```

---

### `lib/admin/curators-gate.ts` (utility, request-response) — or extend `lib/admin/gate.ts`

**Analog:** `lib/admin/gate.ts` (read in full, 51 lines)

**Auth gate pattern to copy verbatim** (lines 15-24):
```typescript
export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}
```
Reuse `verifyAdmin()` as-is (already exported from `lib/admin/gate.ts` — no need to duplicate) for all `/api/admin/curators*` routes. Add a new `EDITABLE_FIELDS` constant array + a `PLATFORM_VALUES`/`GENRE_VALUES` enum array in the same file (or a sibling `lib/curators/schema.ts`), following the exact shape of:
```typescript
export const EDITABLE_FIELDS = [
  'name', 'email', 'platform', 'playlist_url', 'genre_focus', 'submission_notes',
] as const
```

---

### `app/api/admin/curators/route.ts` (route, CRUD)

**Analog:** `app/api/admin/checklist/route.ts` (read in full, 164 lines)

**Imports pattern** (lines 1-9):
```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  verifyAdmin,
  EDITABLE_FIELDS,
  SECTION_VALUES,
  ACTION_TYPE_VALUES,
  KEY_REGEX,
} from '@/lib/admin/gate'
```

**Auth + GET pattern** (lines 14-28):
```typescript
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const service = createServiceClient()
  const { data, error } = await service.from('launchpad_checklist_items').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

**POST with field-by-field validation + allowlisted optional fields** (lines 32-110) — copy this shape exactly for curator create: required-field checks with early 400 returns, enum validation against a `_VALUES` array, unique-constraint 409 handling:
```typescript
if (error) {
  if (error.code === '23505') {
    return NextResponse.json({ error: `Item with key "${key}" already exists` }, { status: 409 })
  }
  return NextResponse.json({ error: error.message }, { status: 500 })
}
```
For curators, apply the `23505` handling to the `(curator_id, track_id)` unique constraint on `pitch_history`, and to `curators.email` if uniqueness is desired.

---

### `app/api/curators/[id]/route.ts` (route, CRUD — curator self-serve PATCH)

**Analog:** `app/api/profile/route.ts` (not re-read this session — referenced directly in CLAUDE.md conventions: "explicit allowlist of editable fields... `EDITABLE_FIELDS`")

**Pattern to follow:** Build an `EDITABLE_FIELDS` allowlist scoped to curator-editable columns only (`genre_focus`, `platform`, `playlist_url`, `submission_notes`) — explicitly excluding `email_valid`, `flagged_inactive`, `reach_signal`, `claimed_by` (mass-assignment protection, matches UI-SPEC's "absent, not just disabled" requirement). Iterate only allowlisted keys present in the request body before building the `update` object, exactly like `lib/admin/gate.ts`'s `EDITABLE_FIELDS` const is consumed downstream.

---

### `lib/curators/pitch-copy.ts` (AI draft prompt builder)

**Analog:** `lib/tools/pitchplug.ts` (read in full, 156 lines)

**System prompt + prompt-builder pattern** (lines 98-156) — copy the overall shape: a `SYSTEM` constant with hard style rules, a `buildXPrompt()` function assembling artist facts + release facts + recipient-specific angle, and a final instruction demanding raw-JSON-only output:
```typescript
const PITCHPLUG_SYSTEM = `You are a music outreach specialist...
Hard rules:
- Sound like the artist wrote it themselves...
- NEVER use these phrases...
Respect the recipient's time: every email is 3–4 short paragraphs and under 180 words of body text.`
```
Adapt the word-count rule to 150 words (locked gate) and steer the "angle" using the curator's `genre_focus` field instead of a fixed `CuratorDef.angle`.

---

### `app/api/pitches/draft/route.ts` (route, request-response — AI draft)

**Analog:** `app/api/tools/pitchplug/route.ts` (read in full, 136 lines)

**Imports + JSON-fence extraction pattern** (lines 1-27):
```typescript
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const MODEL = 'claude-sonnet-4-6'

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}
```

**Demo-mode fallback pattern** (lines 29-39, 55-57) — copy directly:
```typescript
if (DEMO) {
  return NextResponse.json({ data: demoPitches(curatorTypes, 'Your Track') })
}
```

**Anthropic call + error handling** (lines 97-117):
```typescript
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
let parsed: Record<string, unknown> | null
try {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
  parsed = extractJson(text)
} catch (e) {
  const msg = e instanceof Error ? e.message : 'Generation failed'
  return NextResponse.json({ error: msg }, { status: 502 })
}
```
For the pitch-draft route, output shape simplifies to a single `{ note: string }` (not a per-curator-type map), but the extraction/demo/error scaffolding is identical.

---

### `app/api/pitches/route.ts` (route, request-response — send)

**Analog:** `app/api/tools/pitchplug/route.ts` (ownership check pattern, lines 59-71) + `components/tools/PitchCard.tsx` `sendViaFunun()` (client POST shape, lines 52-76)

**Ownership verification pattern** (lines 65-71 of pitchplug route):
```typescript
const { data: project } = await supabase
  .from('vault_projects')
  .select('id, title, type, genre, sub_genre, release_date, notes, tracks (title)')
  .eq('id', projectId)
  .eq('user_id', user.id)
  .maybeSingle()
if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
```
Apply the same `.eq('user_id', user.id)` ownership check when loading the project/track being pitched. Server-side, re-validate all three Send gates (curator selected, note non-empty, ≤150 words) — never trust client state, per UI-SPEC's locked note.

**Duplicate-send guard:** rely on the DB unique constraint (`uniq_curator_track_pitch` on `(curator_id, track_id)`) as the backstop per RESEARCH.md Code Examples, and pre-check in the API for a friendlier 409 message before insert.

**Send via lib/email:**
```typescript
const result = await sendEmail({
  to: curator.email,
  subject: `...`,
  html: `...`,
  from: process.env.PITCH_FROM_EMAIL, // NEW: from-override param to add to lib/email/index.ts
})
```
Requires extending `lib/email/index.ts`'s `sendEmail()` signature with an optional `from` override (currently hardcoded to `process.env.RESEND_FROM_EMAIL`), keeping the existing no-op-when-unconfigured shape (lines 16-20) intact but checking `PITCH_FROM_EMAIL` instead when the override path is used.

---

### `app/api/pitch/accept/[token]/route.ts` and `app/api/pitch/decline/[token]/route.ts` (route, request-response)

**Analog:** RESEARCH.md Pattern 5 (built directly from `lib/split-sheets/approval.ts` token shape + `lib/notifications/index.ts`)

**Full reference implementation** (already verified against codebase precedent, use as-is):
```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = createServiceClient()

  const { data: pitch } = await service
    .from('pitch_history')
    .select('id, status, project_id, curator_id, curators(name), vault_projects(user_id, title)')
    .eq('response_token', token)
    .maybeSingle()

  if (!pitch) return Response.json({ error: 'Invalid or expired link' }, { status: 404 })
  if (pitch.status !== 'pending') return Response.json({ error: 'This pitch was already responded to' }, { status: 410 })

  await service.from('pitch_history').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', pitch.id)

  const project = pitch.vault_projects as unknown as { user_id: string; title: string }
  await createNotification(service, {
    userId: project.user_id,
    type: 'pitch_accepted',
    title: `A curator accepted your pitch for "${project.title}"`,
    link: `/launchpad/${pitch.project_id}`,
    sendEmailCopy: true,
    email: null,
  })

  return Response.json({ ok: true })
}
```
Decline route: same shape, `status: 'declined'`, plus optional `reason` from request body written to a `decline_reason` column, `type: 'pitch_declined'` notification.

**notifications call pattern** — `createNotification()` copied verbatim from `lib/notifications/index.ts` (read in full, 50 lines):
```typescript
export async function createNotification(
  service: SupabaseClient,
  args: { userId: string; type: string; title: string; body?: string | null; link?: string | null; data?: Record<string, unknown>; email?: string | null; sendEmailCopy?: boolean }
): Promise<{ ok: boolean; error?: string }>
```
No changes needed to this file — reuse directly, matching D-14's "reuse the pattern already used for Antenna match notifications" instruction.

---

### `app/api/webhooks/resend/route.ts` (route, event-driven) — NO ANALOG, first webhook

**Reference:** RESEARCH.md Pattern 1 (full implementation given, verified against docs.svix.com + resend.com/docs). Critical pitfall (RESEARCH.md Pitfall 2): must call `await request.text()` — never `request.json()` — before signature verification, breaking the convention every other route in this codebase follows.

---

### `app/api/cron/curator-reach/route.ts` (route, batch) — NO ANALOG, first cron route

**Reference:** RESEARCH.md Pattern 2 (full implementation given). Auth pattern is a bearer-secret check, not session-based — distinct from every other route in the app:
```typescript
const authHeader = request.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new NextResponse('Unauthorized', { status: 401 })
}
```

---

### `app/(curator-portal)/layout.tsx` (provider, request-response)

**Analog:** `app/(admin)/layout.tsx` (read in full, 38 lines)

**Full auth-gate-in-layout pattern to copy and adapt:**
```typescript
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function CuratorPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/curators/signin') // NOT /signin (artist page) — RESEARCH.md Pitfall 3

  const isCurator = (user.app_metadata as { role?: string })?.role === 'curator'
  if (!isCurator) redirect('/')

  return (
    <div className="flex min-h-screen bg-ink text-white">
      {/* own portal shell, does not reuse ArtistNav/Topbar per UI-SPEC */}
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
```
**Critical:** do NOT add `(curator-portal)`'s path prefix to `middleware.ts`'s `isProtected` array (RESEARCH.md Pitfall 3) — this layout's own `getUser()` check is the sole gate, exactly mirroring how `(admin)/layout.tsx` is the sole gate for `is_admin` (middleware.ts already includes `/admin` in `isProtected` for session-existence only; the `is_admin` check itself lives in the layout, not middleware).

---

### `app/api/curators/claim/[token]/route.ts` (route, request-response)

**Analog:** RESEARCH.md Pattern 4 (full implementation given, built from `lib/split-sheets/approval.ts` token shape + Supabase Admin API)

Full reference implementation already provided in RESEARCH.md — copy directly, including the critical `app_metadata: { role: 'curator' }` set-at-creation-time requirement (RESEARCH.md Pitfall 1) and the accompanying `handle_new_user()` migration branch:
```sql
IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN RETURN NEW; END IF;
```
This must be added as a new migration extending the existing trigger function, not a new trigger — same "extend, don't replace" approach migration 026 used.

---

### `components/admin/CuratorAdmin.tsx` (component, CRUD)

**Analog:** `components/admin/ChecklistAdmin.tsx` (read lines 1-120 of 699)

**Imports + type/constant scaffold pattern** (lines 1-55):
```typescript
'use client'
import { useState, useCallback } from 'react'
import type { ChecklistItem } from '@/types' // → replace with Curator type

type FormState = { /* curator fields as strings for controlled inputs */ }
const EMPTY_FORM: FormState = { /* ... */ }
```
**Explicitly exclude:** `@dnd-kit/core`/`@dnd-kit/sortable` imports and the `SortableRow` wrapper (curators have no manual ordering per UI-SPEC) — reuse only the inline add/edit/delete/confirm-delete state machine (`editingKey`, `deletingKey`, `editForm`, `saving`, `error` state shape visible in the `SortableRow` props signature at lines 77-95), rendered as a plain row instead of a sortable one.

---

### `components/curators/CuratorCard.tsx` (component, CRUD display)

**Analog:** `components/collaborators/CollaboratorCard.tsx` (read in full, 141 lines)

**Card shell pattern to copy verbatim** (lines 58-64):
```typescript
<div
  className={[
    'relative flex flex-col gap-2 rounded-[18px] border bg-card p-4',
    hasIpi ? 'border-hair' : 'border-hair border-l-2 border-l-amber-400/70', // → adapt condition to drift-flagged
  ].join(' ')}
>
```
**"Funūn member" badge pattern** (lines 91-96) → rename copy to "Claimed profile" per UI-SPEC, identical markup:
```typescript
{isClaimed && (
  <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
    Funūn member
  </span>
)}
```
**Two-state badge pattern (present/missing)** (lines 98-107) → adapt for "Email bounced" / valid, and "Genre focus may have shifted" drift badge, reusing the amber/brandindigo pill shapes exactly.

**Archived/reduced-opacity read-only variant** (lines 36-56) → adapt directly for the "Already pitched" / "Unsubscribed" disabled states (D-08, D-20): `opacity-60` + `disabled` checkbox + `text-white/30` label, per UI-SPEC.

---

### `components/curators/PitchHistoryList.tsx` (component, CRUD display)

**Analog:** `components/vault/DocumentCard.tsx` (read lines 1-70 of 199)

**STATUS_META pattern to copy verbatim, retarget keys** (lines 7-26):
```typescript
const STATUS_META: Record<PitchStatus, { label: string; badge: string; dot: string }> = {
  pending: { label: 'Pending', badge: 'border-amber-400/30 bg-amber-400/10 text-amber-300', dot: 'bg-amber-400' },
  accepted: { label: 'Accepted', badge: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
  declined: { label: 'Declined', badge: 'border-rose-400/30 bg-rose-400/10 text-rose-300', dot: 'bg-rose-400' },
}
```
This is a byte-for-byte match to UI-SPEC's locked color triad (§Color, pitch status rows) — no adaptation needed beyond the type name and removing the `missing`/`signed` keys DocumentCard uses for documents.

---

### `components/curators/PitchComposer.tsx` (component, request-response)

**Analog:** `components/tools/PitchCard.tsx` (read lines 1-90 of 232)

**Client-side send pattern to copy** (lines 52-76):
```typescript
async function sendViaFunun() {
  setBusy(true)
  setError(null)
  const res = await fetch('/api/pitches', { // → adapt endpoint
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ /* curatorIds, trackId, note */ }),
  })
  setBusy(false)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    setError(json.error ?? 'Could not send')
    return
  }
  setSent(true)
}
```
**Input styling to match verbatim** (per UI-SPEC, `PitchCard.tsx`'s textarea/input treatment): `rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white`.

---

## Shared Patterns

### Graceful no-op when integration env vars unset
**Source:** `lib/email/index.ts` (full file, canonical reference cited directly by RESEARCH.md and CONTEXT.md D-04/D-22/D-23)
**Apply to:** `lib/curators/reach.ts` (Spotify/YouTube), pitch-send path in `app/api/pitches/route.ts` (`PITCH_FROM_EMAIL`), webhook route (`RESEND_WEBHOOK_SECRET`)
```typescript
const apiKey = process.env.RESEND_API_KEY
const from = process.env.RESEND_FROM_EMAIL
if (!apiKey || !from) {
  return { ok: false, error: 'Email not configured' }
}
```

### Admin auth re-verification (never rely on layout alone)
**Source:** `lib/admin/gate.ts` `verifyAdmin()`
**Apply to:** All `/api/admin/curators*` routes
```typescript
const auth = await verifyAdmin()
if ('error' in auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status })
}
```

### In-app + email notification
**Source:** `lib/notifications/index.ts` `createNotification()`
**Apply to:** `app/api/pitch/accept/[token]/route.ts`, `app/api/pitch/decline/[token]/route.ts` (D-14)
```typescript
await createNotification(service, {
  userId: project.user_id,
  type: 'pitch_accepted',
  title: `A curator accepted your pitch for "${project.title}"`,
  link: `/launchpad/${pitch.project_id}`,
  sendEmailCopy: true,
  email: null,
})
```

### Token generation (claim + response links)
**Source:** `lib/split-sheets/approval.ts` `generateApprovalToken()`
**Apply to:** `lib/curators/tokens.ts` (new file, same shape for both claim and response tokens)
```typescript
export function generateClaimToken(): string {
  return randomBytes(32).toString('hex')
}
```

### Status badge color triad (pending/accepted-signed/declined-missing)
**Source:** `components/vault/DocumentCard.tsx` `STATUS_META`
**Apply to:** `components/curators/PitchHistoryList.tsx`, `components/curators/CuratorCard.tsx` (email-valid badge), admin curator rows (inactive/claimed badges) — amber/emerald/rose triad locked by UI-SPEC verbatim

### Mass-assignment protection via explicit EDITABLE_FIELDS allowlist
**Source:** `lib/admin/gate.ts` `EDITABLE_FIELDS` const + consuming pattern in `app/api/admin/checklist/route.ts`
**Apply to:** `app/api/curators/[id]/route.ts` (curator self-serve PATCH — explicitly excludes `email_valid`, `flagged_inactive`, `reach_signal`, `claimed_by` per UI-SPEC)

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/webhooks/resend-verify.ts` | utility | event-driven | No webhook route exists yet in this codebase (first one, per INTEGRATIONS.md and RESEARCH.md) — use RESEARCH.md Pattern 1 verbatim as the reference implementation instead of a codebase analog |
| `app/api/webhooks/resend/route.ts` | route | event-driven | Same — first webhook route |
| `app/api/cron/curator-reach/route.ts` | route | batch | No scheduled-job infra exists today — use RESEARCH.md Pattern 2 verbatim |
| `vercel.json` | config | batch | No `crons` config exists in this repo — use RESEARCH.md Pattern 2's example JSON verbatim |

## Metadata

**Analog search scope:** `components/admin/`, `components/collaborators/`, `components/vault/`, `components/tools/`, `lib/admin/`, `lib/email/`, `lib/notifications/`, `lib/split-sheets/`, `lib/tools/`, `app/api/admin/`, `app/api/tools/`, `app/(admin)/`, `middleware.ts`
**Files scanned:** 12 analog files read in full or targeted range; 4 additional files inspected via `wc -l` / `find` to confirm size/existence before reading
**Pattern extraction date:** 2026-07-01
