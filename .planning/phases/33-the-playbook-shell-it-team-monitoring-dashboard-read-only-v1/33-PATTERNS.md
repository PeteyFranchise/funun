# Phase 33: The Playbook shell + IT Team monitoring dashboard — Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 15 (create/modify)
**Analogs found:** 12 exact/role-match / 15 (3 net-new, flagged below)

This phase's CONTEXT/RESEARCH/UI-SPEC already named every analog. This file verifies each against the live source and extracts the exact excerpt to mirror — no new analog search was needed beyond confirming line-accurate excerpts.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/admin/staff-role.ts` | config/type-union | request-response (auth) | itself, `'anr'` addition (Phase 30) | exact — same file, same edit shape |
| `supabase/migrations/114_it_staff_role.sql` | migration | CRUD (schema) | `supabase/migrations/108_anr_staff_role.sql` | exact — verbatim shape swap |
| `app/(admin)/layout.tsx` | route/layout | request-response | itself, existing `NAV_LINK_CLASS` links | exact — add one more `<Link>` |
| `app/(admin)/playbook/layout.tsx` | route/layout | request-response | `app/(admin)/layout.tsx` (gate + role read pattern) | role-match — nested layout, no existing double-sidebar precedent |
| `app/(admin)/playbook/page.tsx` | route | request-response (redirect) | `app/(admin)/layout.tsx`'s `if (!role) redirect('/')` idiom | role-match |
| `app/(admin)/playbook/it/{dashboard,vendor-directory,runbook,operating-rhythm,thresholds}/page.tsx` (5 files) | route/page | request-response | inline self-guard pattern (RESEARCH Pitfall 2, no exact page-context precedent — API-only today) | role-match, adapted |
| `components/playbook/PlaybookNavLink.tsx` | component (client) | request-response (nav) | `components/nav/ArtistNav.tsx` (`usePathname()` active-state) | exact pattern, scoped down |
| `components/playbook/Rail2.tsx` | component | request-response (nav) | `components/nav/ArtistNav.tsx` + `app/(admin)/layout.tsx` nav list | role-match — net-new structure, reused active-state technique |
| `app/(admin)/playbook/it/dashboard/page.tsx` (dashboard body/data) | service+component (server) | request-response | `app/api/cron/daily-observability-check/route.ts` (`checkHealth()` reuse + `classifyThreshold` loop) | exact — direct code reuse |
| `lib/observability/config.ts` (read-only reuse, no modification) | config | — | itself | exact — consumed, not changed |
| `lib/playbook/read-doc.ts` | utility | file-I/O | `lib/vault/pdf/fonts.ts` (fail-fast fs pattern, `process.cwd()`) | role-match |
| `next.config.mjs` | config | build/deploy | itself, existing `outputFileTracingIncludes` fonts entry | exact — add sibling entry |
| `components/playbook/MarkdownDoc.tsx` + `lib/playbook/markdown-components.tsx` | component/utility | transform (markdown→React) | **none** — no markdown renderer exists in this codebase | **net-new** |
| `lib/playbook/nav.ts` | config | — | `app/(admin)/layout.tsx`'s inline nav-link list (informal precedent, not extracted to a module today) | role-match, new convention |

## Pattern Assignments

### `lib/admin/staff-role.ts` (config, MODIFY)

**Analog:** the file's own existing `'anr'` addition (verbatim below — this IS the pattern to repeat for `'it'`)

```typescript
// Source: lib/admin/staff-role.ts, lines 16-35 (current state, pre-'it')
export type StaffRole = 'leadership' | 'ae' | 'bd' | 'anr'

export const ALL_STAFF_ROLES: StaffRole[] = ['leadership', 'ae', 'bd', 'anr']

export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user?.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (
    meta?.staff_role === 'leadership' ||
    meta?.staff_role === 'ae' ||
    meta?.staff_role === 'bd' ||
    meta?.staff_role === 'anr'
  ) {
    return meta.staff_role
  }
  if (meta?.is_admin === true) return 'leadership'
  return null
}
```

**Pattern to replicate:** append `| 'it'` to the union, `'it'` to `ALL_STAFF_ROLES`, and a fourth `meta?.staff_role === 'it'` branch in the `if`. Copy the header comment style (explain why it's safe to ship before the migration — mirror the existing `'anr'` comment block at lines 9-15) with an `'it'`-specific version referencing migration 114 and D-01.

---

### `supabase/migrations/114_it_staff_role.sql` (migration, CREATE)

**Analog:** `supabase/migrations/108_anr_staff_role.sql` (verbatim template — copy structure exactly, swap role name/number/phase refs)

```sql
-- Source: supabase/migrations/108_anr_staff_role.sql, lines 41-54
ALTER TABLE public.funun_staff DROP CONSTRAINT IF EXISTS funun_staff_staff_role_check;

ALTER TABLE public.funun_staff ADD CONSTRAINT funun_staff_staff_role_check
  CHECK (staff_role IN ('leadership', 'ae', 'bd', 'anr'));

COMMENT ON CONSTRAINT funun_staff_staff_role_check ON public.funun_staff IS
  'Widened in migration 108 (Phase 30) to add ''anr'' ... ';

NOTIFY pgrst, 'reload schema';
```

**Pattern to replicate:**
- Same `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` shape; new CHECK list = `('leadership', 'ae', 'bd', 'anr', 'it')`.
- Header comment block (lines 1-39 of 108) documents WHY/WHAT/HUMAN-GATED — mirror this format exactly, referencing Phase 33/D-01 and this phase's narrow `it` authority (Playbook IT-room read access only).
- Keep the "HUMAN-GATED — never runs `supabase db push` from an agent" disclaimer verbatim (owner-run convention).
- `NOTIFY pgrst, 'reload schema';` at the end — required, do not omit.
- Confirmed next available number: **114** (highest landed is 113, per RESEARCH).

---

### `app/(admin)/layout.tsx` (route/layout, MODIFY — add Rail 1 link + active-state)

**Analog:** itself — existing `NAV_LINK_CLASS` link list + gate pattern

```typescript
// Source: app/(admin)/layout.tsx, lines 11-12 (existing shared class)
const NAV_LINK_CLASS =
  'rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'
```

```tsx
// Source: app/(admin)/layout.tsx, lines 109-114 (a plain always-visible link,
// the placement precedent for a new top-of-nav "all staff" entry)
<Link href="/admin/crate-requests" className={NAV_LINK_CLASS}>
  Crate Requests
</Link>
<Link href="/admin/selects" className={NAV_LINK_CLASS}>
  Selects
</Link>
```

```typescript
// Source: app/(admin)/layout.tsx, lines 15-28 (gate — DO NOT duplicate;
// this layout gate already admits all staff roles, which is exactly what
// D-04 wants for "The Playbook" link visibility — no new gate needed here)
const supabase = await createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')
const role = getStaffRole(user)
if (!role) redirect('/')
const isLeadership = role === 'leadership'
```

**Pattern to replicate:**
- Per UI-SPEC §Rail reconciliation #1: insert `<Link href="/admin/playbook" className={...}>The Playbook</Link>` as the **first item**, before "Checklist Items", **outside** the `isLeadership &&` block (visible to all staff, D-04).
- Add active-state ONLY to this one link via a new scoped client component (see `PlaybookNavLink.tsx` below) — do not add active-state anywhere else in Rail 1 (UI-SPEC explicit: "Rail 1 currently has no active-state styling anywhere... scoped to this single link only").
- Reuse `NAV_LINK_CLASS` unmodified; active variant = `` `${NAV_LINK_CLASS} bg-[color:var(--border)] text-[color:var(--ink)] font-semibold` `` (UI-SPEC's literal value).

---

### `app/(admin)/playbook/layout.tsx` (route/layout, CREATE — Rail 2 shell)

**Analog:** `app/(admin)/layout.tsx`'s gate-read pattern (role read, not full gate — Rail 2's IT-room row visibility is render-time only; D-02's real enforcement lives in each IT-room page)

```typescript
// Source: app/(admin)/layout.tsx, lines 15-28 — adapt this exact idiom for
// the nested layout: read the session/role again (Next.js layouts don't
// share request-scoped state with parents), but do NOT redirect non-staff
// here beyond what the parent already enforces — this layout's only new
// responsibility is: is role in ['leadership','it'] → show enterable IT
// room row; else → omit it entirely from Rail 2 (D-06).
const supabase = await createServerClient()
const { data: { user } } = await supabase.auth.getUser()
const role = getStaffRole(user)
const canSeeItRoom = role === 'leadership' || role === 'it'
```

**Pattern to replicate:** server-rendered Rail 2 room list (static array from `lib/playbook/nav.ts`), IT room row conditionally rendered per `canSeeItRoom`; five other rooms always render as inert "Coming soon" `<div>`s (UI-SPEC §"Coming soon" ghost rooms — non-interactive, `opacity:.45`, no `<a>`/`<button>`). No existing double-sidebar precedent in this codebase — build to `docs/design/playbook-double-sidebar.html`'s `.rail2` per UI-SPEC.

---

### IT-room pages (5 files: `dashboard`, `vendor-directory`, `runbook`, `operating-rhythm`, `thresholds`)

**Analog:** RESEARCH's own adapted example (Pattern 3) + `requireStaff()` shape from `lib/admin/gate.ts`

```tsx
// Source: 33-RESEARCH.md Pattern 3, adapted from lib/admin/gate.ts's
// requireStaff() signature (API-route-shaped; RESEARCH Pitfall 2 flags this
// needs a page-context adaptation — planner must pick ONE of:
//   (a) call getStaffRole(user) directly + redirect()/notFound() inline
//       (mirrors app/(admin)/layout.tsx's own `if (!role) redirect('/')`)
//   (b) add a requireStaffPage() helper to lib/admin/gate.ts
// D-02 requires this guard on EVERY one of the 5 pages, not just the layout.
import { requireStaff } from '@/lib/admin/gate' // API-route shape — needs page adaptation, see above
```

```typescript
// Source: lib/admin/gate.ts, lines 34-43 (the underlying primitive every
// page-guard variant must reproduce the semantics of)
export async function requireStaff(allowed: StaffRole[] = ALL_STAFF_ROLES): Promise<RequireStaffResult> {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const staffRole = getStaffRole(user)
  if (!staffRole || !allowed.includes(staffRole)) return { error: 'Forbidden', status: 403 }
  return { user, staffRole }
}
```

**Pattern to replicate:** every page opens with `requireStaff(['leadership','it'])`-equivalent logic (page-context adapted per RESEARCH Pitfall 2) BEFORE any `readObservabilityDoc()` / `checkHealth()` call (fail closed — UI-SPEC Access & Role Gating section, ASVS V4). Never widen the allowed-role array to `ALL_STAFF_ROLES` (Security Domain: elevation-of-privilege risk explicitly called out in RESEARCH).

---

### `components/playbook/PlaybookNavLink.tsx` (client component, CREATE)

**Analog:** `components/nav/ArtistNav.tsx` (`usePathname()` active-state)

```tsx
// Source: components/nav/ArtistNav.tsx, lines 4, 107, 287 (verified live)
import { usePathname } from 'next/navigation'
// ...
const pathname = usePathname() ?? ''
// ...
const active = pathname === match || pathname.startsWith(match + '/')
```

```tsx
// Source: 33-RESEARCH.md's Code Examples section (already-drafted component
// matching this exact analog, scoped to just the one new link per UI-SPEC)
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BASE = 'rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'

export function PlaybookNavLink() {
  const pathname = usePathname() ?? ''
  const active = pathname.startsWith('/admin/playbook')
  return (
    <Link href="/admin/playbook" className={active ? `${BASE} bg-[color:var(--border)] text-[color:var(--ink)] font-semibold` : BASE}>
      The Playbook
    </Link>
  )
}
```

**Pattern to replicate:** `usePathname()` + `startsWith()` comparison — identical technique for Rail 2's room/sub-room active rows (scoped to just the interactive row components, per RESEARCH "Rail 2's room/sub-room active rows should use the identical usePathname() + startsWith() comparison technique").

---

### Dashboard data layer (`app/(admin)/playbook/it/dashboard/page.tsx`)

**Analog:** `app/api/cron/daily-observability-check/route.ts` (health re-check + threshold classification loop — direct reuse, not just pattern-mimicry)

```typescript
// Source: app/api/cron/daily-observability-check/route.ts, lines 2, 40-50
import { GET as checkHealth } from '@/app/api/health/route'

async function checkHealthStatus(): Promise<'healthy' | 'degraded' | 'unknown'> {
  try {
    const res = await checkHealth()
    const body = await res.json()
    return body?.status === 'healthy' ? 'healthy' : 'degraded'
  } catch {
    return 'unknown'
  }
}
```

```typescript
// Source: app/api/cron/daily-observability-check/route.ts, lines 4, 62-69
import { THRESHOLDS, classifyThreshold, type ThresholdMetric } from '@/lib/observability/config'

const healthStatus = await checkHealthStatus()
const metricLines = (Object.keys(THRESHOLDS) as ThresholdMetric[])
  .filter((metric) => metric !== 'monthly_spend_usd')
  .map((metric) => `<li>${metric}: ${classifyThreshold(metric, undefined)}</li>`)
  .join('')
```

**Pattern to replicate:**
- Import `{ GET as checkHealth }` directly — **never** self-fetch `/api/health` (RESEARCH Anti-Pattern, explicit).
- Reuse `checkHealthStatus()`'s try/catch shape verbatim for the App Health tile + banner.
- Reuse the `classifyThreshold` mapping loop for the digest "today" row, but **do not call `fanOutAlert()`** (D-08 — that's the ONE line of the cron this phase must not reuse) and use the UI-SPEC's stricter exclusion (`monthly_spend_usd` AND `uptime_consecutive_failures` excluded from the 7-row Thresholds panel; the digest row itself stays metric-agnostic prose per UI-SPEC Pitfall 4 guidance).
- `THRESHOLDS[metric]` (from `lib/observability/config.ts`, lines 66-79, read directly — no modification to this file) supplies `warning`/`critical` values for the Thresholds panel's `warn {x} · crit {y}` mono strings.

---

### `lib/playbook/read-doc.ts` (utility, CREATE)

**Analog:** `lib/vault/pdf/fonts.ts` (fail-fast `fs` + `process.cwd()` pattern — cited by RESEARCH; not re-read here since RESEARCH already extracted the exact idiom verbatim)

```typescript
// Source: 33-RESEARCH.md Pattern 3 (already adapted from the fonts.ts precedent)
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

const DOCS_DIR = path.join(process.cwd(), 'docs', 'observability')

export async function readObservabilityDoc(filename: string): Promise<string> {
  const filePath = path.join(DOCS_DIR, filename)
  if (!fsSync.existsSync(filePath)) {
    throw new Error(
      `readObservabilityDoc(): required doc not found at "${filePath}". ` +
        'If this is a production deploy, confirm outputFileTracingIncludes...'
    )
  }
  return fs.readFile(filePath, 'utf-8')
}
```

**Pattern to replicate:** `path.join(process.cwd(), ...)` — never a literal relative path (`'./docs/...'`) — matches the fonts.ts precedent's rationale (build vs. deployed-Lambda cwd mismatch). Fail-fast with a descriptive error, not a silent blank render.

---

### `next.config.mjs` (config, MODIFY — add `outputFileTracingIncludes` entry)

**Analog:** itself — existing fonts entry (exact sibling pattern)

```javascript
// Source: next.config.mjs, lines 16-18 (current state)
outputFileTracingIncludes: {
  'app/api/**/*': ['./assets/fonts/**'],
},
```

**Pattern to replicate:** add a second key for the Playbook doc routes:
```javascript
outputFileTracingIncludes: {
  'app/api/**/*': ['./assets/fonts/**'],
  'app/(admin)/playbook/**/*': ['./docs/observability/**'], // mirrors the fonts fix
},
```
**Critical caveat (RESEARCH Pitfall 1, MEDIUM confidence):** the exact glob-key format (filesystem-path-style vs. route-path-style) is ambiguous across Next.js doc versions vs. this repo's own working config. Mandatory verification step: `npx next build` then grep `.next/server/**/*.nft.json` for `docs/observability` before considering this task done — this is a hard gate per RESEARCH, not optional.

---

### `components/playbook/MarkdownDoc.tsx` + `lib/playbook/markdown-components.tsx` — **NET-NEW, no analog**

No markdown renderer exists anywhere in this codebase (confirmed by RESEARCH's explicit search: "No markdown renderer exists yet — adding one is net-new (D-10). The few `dangerouslySetInnerHTML` uses in the repo (messages/selects) are unrelated to markdown.").

Use the RESEARCH-drafted implementation directly (already verified against the installed-package plan and the UI-SPEC's element contract table):

```tsx
// Source: 33-RESEARCH.md Pattern 3/4 (net-new; drafted specifically for this phase)
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownComponents } from '@/lib/playbook/markdown-components'

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-[900px] px-[34px] pb-[60px] pt-[22px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

The `markdownComponents` map must satisfy the UI-SPEC's "Doc-Page Markdown Container Contract" table verbatim (h1/h2/h3/p/strong/a/blockquote/table/th/td/code/pre/ul/ol/hr) — RESEARCH's Pattern 4 code block already derives this from the UI-SPEC and is ready to use as the starting point (see 33-RESEARCH.md lines 266-297 for the full map). No `dangerouslySetInnerHTML` — RSC-only, zero client JS.

---

## Shared Patterns

### Role gating (`requireStaff` / `getStaffRole`)
**Source:** `lib/admin/staff-role.ts`, `lib/admin/gate.ts`
**Apply to:** `staff-role.ts` (D-01 union widen), all 5 IT-room pages (D-02 inline self-guard), `playbook/layout.tsx` (Rail 2 render-time IT-room visibility per D-06)
**Rule:** the layout gate is never sole authority — every gated page carries its own inline guard (established codebase doctrine, cited at 25-06/13-04).

### Admin theme injection
**Source:** `components/admin/console-theme.ts` (`ADMIN_CONSOLE_CSS`), already injected once by `app/(admin)/layout.tsx` (`<style>{ADMIN_CONSOLE_CSS}</style>` inside the `.fncon` wrapper)
**Apply to:** all Playbook surfaces — no new theme provider, no new `data-theme` toggle logic; Playbook renders inside the existing `.fncon` wrapper the parent layout already sets up. Where mockup hex differs from console tokens (`--rose:#F43F5E` vs. console's `--rose-fg:#F9A8C0`; `--amber:#F59E0B` vs. console's `--amber-fg:#F4C77B`), use the mockup's literal hex via Tailwind arbitrary values scoped to Playbook components only — do not mutate `ADMIN_CONSOLE_CSS`'s shared token block (UI-SPEC explicit).

### `outputFileTracingIncludes` (deploy-time file bundling)
**Source:** `next.config.mjs` (fonts precedent)
**Apply to:** `lib/playbook/read-doc.ts`'s `fs.readFile` calls — same failure class as the PDF font files, same fix shape.

### Server-side health re-check (no self-fetch)
**Source:** `app/api/cron/daily-observability-check/route.ts`
**Apply to:** dashboard's App Health tile/banner, digest "today" row.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `components/playbook/MarkdownDoc.tsx` | component | transform | No markdown renderer exists in this codebase (RESEARCH-verified); use `react-markdown`+`remark-gfm` per RESEARCH's Standard Stack, styled to UI-SPEC's element contract table (already drafted, see above) |
| `lib/playbook/markdown-components.tsx` | utility | transform | Same — net-new, no `components`-override-map precedent exists anywhere |
| `app/(admin)/playbook/layout.tsx` (Rail 2 double-sidebar structure itself) | route/layout | request-response | No double-sidebar nav precedent exists in this codebase; build to `docs/design/playbook-double-sidebar.html` per UI-SPEC §Rail reconciliation #2 (canonical source, nothing to reconcile against) |

## Metadata

**Analog search scope:** `lib/admin/`, `app/(admin)/`, `app/api/health/`, `app/api/cron/daily-observability-check/`, `lib/observability/`, `components/nav/`, `components/admin/`, `supabase/migrations/108_anr_staff_role.sql`, `next.config.mjs`, `lib/vault/pdf/fonts.ts` (cited, not re-read — RESEARCH already extracted its exact idiom)
**Files scanned:** 10 direct reads + RESEARCH/CONTEXT/UI-SPEC's own prior verified reads (cross-checked, not duplicated)
**Pattern extraction date:** 2026-08-17
