# Phase 33: The Playbook shell + IT Team monitoring dashboard (read-only v1) - Research

**Researched:** 2026-08-17
**Domain:** Next.js 15 App Router (nested layouts, Server Components, output file tracing) + markdown rendering + existing Funūn admin/observability infrastructure reuse
**Confidence:** HIGH

## Summary

This phase is almost entirely a wiring/integration exercise on top of code that already exists: `getStaffRole()`/`requireStaff()`, `/api/health`, the daily cron's health+threshold summary logic, and `THRESHOLDS`/`classifyThreshold()` are all live, tested, in-production primitives. The five genuinely open implementation questions research was scoped to are now resolved:

1. **Markdown renderer:** use `react-markdown` v10 + `remark-gfm` v4. Both packages are verified legitimate (27M/31M weekly downloads, official remarkjs org repos, no postinstall scripts). Neither is installed yet. Because the 4 doc pages render exclusively inside React Server Components with no interactivity, `react-markdown` ships **zero client JS** for this use case — it is a plain function component with no `'use client'` directive, so Next.js keeps it server-only automatically. `remark-gfm` gives table support, which the docs need heavily.
2. **Deployment risk (`docs/observability/*.md` at runtime on Vercel) is real and already has a proven fix pattern in this exact repo.** `next.config.mjs` already solves an identical problem for `assets/fonts/*.ttf` (read via `fs` + `process.cwd()` at runtime, invisible to Next's file tracer) using `outputFileTracingIncludes`. The same fix — a new glob entry — must be added for `docs/observability/**`. This is the single highest-risk item in the phase; skipping it means the doc pages 404/throw in production while working perfectly in local dev.
3. **Server-side health re-check:** `import { GET as checkHealth } from '@/app/api/health/route'` is the exact live pattern already used by the cron (`app/api/cron/daily-observability-check/route.ts`). It returns a `NextResponse`; call `.json()` on it to get `{ status: 'healthy'|'degraded', checkedAt, durationMs }`.
4. **Active-nav highlighting in a "URL-driven, no client state" shell:** `usePathname()` in a small, scoped Client Component is the correct, codebase-consistent answer — the UI-SPEC has already locked this for Rail 1; Rail 2 should use the identical pattern (already proven at scale in `components/nav/ArtistNav.tsx`), not a different Next.js primitive. `useSelectedLayoutSegment()` was considered and rejected as unnecessary complexity for this shape.
5. **`it` StaffRole:** mechanically identical to the `anr` precedent (migration 108). Next available migration number is **114** (highest landed is 113).

**Primary recommendation:** Install `react-markdown` + `remark-gfm`, add an `outputFileTracingIncludes` entry for `docs/observability/**` mirroring the fonts precedent (and verify it with a local `next build` trace inspection before considering the phase done), reuse `checkHealth()`/`THRESHOLDS`/`classifyThreshold()` exactly as the cron does, and build Rail 1/Rail 2 active-state with a minimal `usePathname()` client wrapper.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Role gate (`it` + `leadership`) | API/Backend (`lib/admin/gate.ts`, `requireStaff`) | Frontend Server (inline route-segment guard) | Auth decisions are server-owned; the layout gate is deliberately not sole authority (D-02) |
| Rail 1 / Rail 2 nav shell rendering | Frontend Server (SSR layouts) | Browser (minimal active-state hook) | Static nav structure is server-rendered; only URL-comparison for active styling needs the client |
| Doc-page markdown rendering | Frontend Server (RSC) | — | `react-markdown` runs entirely server-side; no client JS, no hydration cost |
| `.md` file reads (`docs/observability/*`) | Frontend Server (RSC via `fs`) | Build/Deploy tooling (`outputFileTracingIncludes`) | Content lives in the repo, not the DB; the deploy-time file tracer must be told about it explicitly |
| App Health tile + banner | API/Backend (`/api/health` logic, invoked in-process) | Frontend Server (renders the result) | `checkHealth()` is the single source of truth; the dashboard is a thin renderer over it |
| Thresholds panel | API/Backend (`lib/observability/config.ts`) | Frontend Server (renders `THRESHOLDS` + `classifyThreshold`) | Config module is the canonical source; no new config surface introduced |
| Vendor deep-links, quick-links, Better Stack link-out | Frontend Server (static link data) | — | Pure static content, no runtime dependency |
| `it` role + CHECK constraint | Database (migration, owner-run) | API/Backend (`StaffRole` union) | Schema authority always lives in the owner-run migration; code union must ship first (safe — no row can hold the value pre-migration) |

<phase_requirements>
## Phase Requirements

No requirement IDs exist yet for Phase 33 — `.planning/REQUIREMENTS.md` has not been updated for this phase (it currently ends its traceability at Phase 28/25/23/26/16 sections; Phase 33 is not yet a milestone-tracked requirement set). Per the phase description, requirement IDs are "TBD (register during planning)." The planner should register IDs (suggested prefix: `PLAYBOOK-`) covering, at minimum:

| Suggested ID | Description | Research Support |
|----|-------------|------------------|
| PLAYBOOK-01 | `it` StaffRole added to the union + owner-run migration widening `funun_staff` CHECK | See `## it StaffRole + migration mechanics` below; mirrors migration 108 exactly |
| PLAYBOOK-02 | Rail 1 "The Playbook" entry, visible to all staff, active-state styling | See `## Active-nav highlighting` below |
| PLAYBOOK-03 | Rail 2 double-sidebar shell — 6 rooms, 5 "Coming soon" ghosts, IT room role-conditional | UI-SPEC fully specifies this; research confirms `usePathname()` approach |
| PLAYBOOK-04 | IT room inline `requireStaff(['leadership','it'])` guard on all 5 pages | See `## it StaffRole` section; `lib/admin/gate.ts` reused unchanged |
| PLAYBOOK-05 | 4 doc pages rendered from `.md` via `react-markdown`+`remark-gfm` | See `## Markdown renderer` section |
| PLAYBOOK-06 | `docs/observability/*.md` readable in the deployed Vercel serverless bundle | See `## Deployment risk` section — the single highest-risk item |
| PLAYBOOK-07 | Monitoring Dashboard: live App Health tile + banner via `checkHealth()` | See `## Server-side health re-check reuse` section |
| PLAYBOOK-08 | Monitoring Dashboard: live digest "today" row via cron's summary logic (no email sent) | Same section; reuse `classifyThreshold(metric, undefined)` loop |
| PLAYBOOK-09 | Thresholds panel rendering real `THRESHOLDS` values | `lib/observability/config.ts` read directly |
| PLAYBOOK-10 | Uptime tile/panel replaced with Better Stack link-out (no fabricated %s) | Static content; no research risk |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-markdown` | 10.1.0 (installed range should pin `^10.1.0`) | Renders trusted `.md` content as React elements in a Server Component | Zero-client-JS in RSC usage, no `dangerouslySetInnerHTML`, `components` prop maps 1:1 onto the UI-SPEC's per-element style table. Verified `[VERIFIED: npm registry, package-legitimacy check OK, 27M weekly downloads, github.com/remarkjs/react-markdown]` |
| `remark-gfm` | 4.0.1 | Adds GitHub-Flavored-Markdown table support (and other GFM extensions: strikethrough, task lists, autolinks) to `react-markdown`'s remark pipeline | The 4 doc pages use GFM tables extensively (`VENDOR-DIRECTORY.md`'s "At a glance" table is 5 columns × 11 rows; `RUNBOOK.md` §1's origin-triage table; `THRESHOLDS-AND-SEVERITY.md` and `OPERATING-RHYTHM.md` also use tables) — plain CommonMark does not support tables. Verified `[VERIFIED: npm registry, package-legitimacy check OK, 31M weekly downloads, github.com/remarkjs/remark-gfm]` |

### Supporting
None needed. No syntax-highlighter, no TOC plugin, no rehype plugins — the UI-SPEC explicitly states "No table of contents, no sidebar-within-page anchor nav, no syntax highlighting beyond the plain `pre` treatment."

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-markdown` + `remark-gfm` | `marked` (18.0.9 latest, tiny footprint, zero deps) | `marked` returns an HTML **string**, requiring `dangerouslySetInnerHTML` to render it. This codebase's own CLAUDE.md/UI-SPEC explicitly flags `dangerouslySetInnerHTML` as an anti-pattern to avoid (the two existing uses in messages/selects are called out as unrelated exceptions, not a precedent to extend). Styling per-element (the UI-SPEC's h2/h3/table/blockquote/code contract) would require either a `marked.Renderer` subclass (more code, more surface area than `react-markdown`'s declarative `components` prop) or a global scoped CSS block (`.markdown-body h2 {...}`), which conflicts with this phase's "adds zero new CSS custom properties to the token block" posture (UI-SPEC, Design System section). `marked` is a reasonable choice in isolation but a worse fit for *this* codebase's established conventions. |
| Reading `.md` at request time via `fs` | `@next/mdx` / MDX compilation | MDX is the officially-recommended Next.js pattern for markdown-as-content, but it requires either `.mdx` file extensions (renaming the canonical `docs/observability/*.md` files, which D-10 explicitly forbids — they must stay the single source of truth used elsewhere, e.g. by `RUNBOOK.md`'s own cross-references) or a build-time compile step wired through `next.config.mjs`'s `pageExtensions`. Overkill for "render 4 trusted, already-written markdown files with GFM tables." `react-markdown` reading raw file content via `fs.readFile` is simpler and requires no config beyond `outputFileTracingIncludes`. |

**Installation:**
```bash
npm install react-markdown remark-gfm
```

**Version verification:** confirmed live via `npm view react-markdown version` → `10.1.0` (published 2025-03-07) and `npm view remark-gfm version` → `4.0.1` (published 2025-02-10). `npm ls react-markdown marked remark-gfm` confirms **none are currently installed** — this is a net-new dependency addition, matching the CONTEXT.md code-context note ("No markdown renderer exists yet").

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `react-markdown` | npm | current major (10.x) published 2025-03-07; project itself is years old | 27,124,804/wk | github.com/remarkjs/react-markdown | OK | Approved |
| `remark-gfm` | npm | current major (4.x) published 2025-02-10 | 31,168,360/wk | github.com/remarkjs/remark-gfm | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none. Both packages returned `postinstall: null` (no suspicious install scripts) and are under the well-known `remarkjs` GitHub org (the unified/remark/rehype ecosystem maintained by the same team as MDX's underlying tooling — this is the de facto standard markdown-in-React toolchain, not an obscure alternative).

## Architecture Patterns

### System Architecture Diagram

```
Staff browser
   │  GET /admin/playbook  (or /admin/playbook/it/*)
   ▼
app/(admin)/layout.tsx  ── existing shell gate (any staff role) ──┐
   │                                                                │ redirect '/' if no role
   ▼                                                                │
Rail 1 (existing sidebar, server-rendered)                         │
   + net-new "The Playbook" <PlaybookNavLink/> (client, usePathname)
   │  click → navigates to /admin/playbook/*
   ▼
app/(admin)/playbook/layout.tsx  ── NEW nested layout ─────────────┘
   │  renders Rail 2 (server-rendered static room list)
   │  + <PlaybookRoomLink/> / <PlaybookSubLink/> (client, usePathname, active-state only)
   │  role-conditional: IT room row rendered only if requireStaff(['leadership','it']) passes
   │                     (read once here for RENDER-time visibility;
   │                      re-checked independently on every IT-room page per D-02)
   ▼
app/(admin)/playbook/it/layout.tsx OR inline per-page guard  ── requireStaff(['leadership','it']) ──┐
   │  (5 pages, each carries its OWN inline guard — D-02)                                            │ redirect/404 if denied
   ├── /admin/playbook/it/dashboard (index)          ─── bespoke React, NOT markdown ─────────────┐  │
   │      │                                                                                         │  │
   │      ├─ checkHealth() [import { GET as checkHealth } from '@/app/api/health/route']            │  │
   │      │      → App Health tile + global status banner                                           │  │
   │      ├─ classifyThreshold(metric, undefined) × 7  [lib/observability/config.ts]                │  │
   │      │      → Thresholds panel + digest "today" row                                            │  │
   │      ├─ THRESHOLDS[metric] → warn/crit values → Thresholds panel                                │  │
   │      └─ static vendor/quick-link URLs → Vendors grid + Quick links + Uptime link-out            │  │
   │                                                                                                  │  │
   ├── /admin/playbook/it/vendor-directory   ─┐                                                      │  │
   ├── /admin/playbook/it/runbook             ├─ fs.readFile(docs/observability/*.md)                │  │
   ├── /admin/playbook/it/operating-rhythm    │     → <ReactMarkdown remarkPlugins=[remarkGfm]        │  │
   ├── /admin/playbook/it/thresholds          ─┘        components={...}> (RSC, no client JS)         │  │
   │                                                                                                  │  │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                                         │
next.config.mjs outputFileTracingIncludes ── includes docs/observability/** in the deployed bundle ────┘
   (build-time concern; without this, the 4 doc-page fs.readFile calls 404/throw ONLY in production)
```

### Recommended Project Structure
```
app/(admin)/
├── layout.tsx                          # EXISTING — add "The Playbook" link only
└── playbook/
    ├── layout.tsx                      # NEW — Rail 2 shell, room list, role-conditional IT row
    ├── page.tsx                        # NEW — index: redirect authorized staff to /playbook/it/dashboard
    └── it/
        ├── layout.tsx                  # NEW — OR fold requireStaff(['leadership','it']) into each page
        ├── dashboard/page.tsx          # NEW — bespoke Monitoring Dashboard (index page)
        ├── vendor-directory/page.tsx   # NEW — react-markdown render of VENDOR-DIRECTORY.md
        ├── runbook/page.tsx            # NEW — react-markdown render of RUNBOOK.md
        ├── operating-rhythm/page.tsx   # NEW — react-markdown render of OPERATING-RHYTHM.md
        └── thresholds/page.tsx         # NEW — react-markdown render of THRESHOLDS-AND-SEVERITY.md

lib/playbook/                           # NEW domain module (mirrors lib/[domain]/ convention)
├── nav.ts                              # room list constants (rooms, sub-pages, hrefs) — single source
├── read-doc.ts                         # fs.readFile wrapper + fail-fast guard (mirrors fonts.ts pattern)
└── markdown-components.tsx             # shared react-markdown `components` override map (UI-SPEC contract)

components/playbook/
├── PlaybookNavLink.tsx                 # 'use client' — Rail 1's single active-aware link
├── Rail2.tsx                           # server-rendered room list + client active-state sub-links
├── MarkdownDoc.tsx                     # wraps ReactMarkdown + remarkGfm + markdown-components.tsx
├── StatusBanner.tsx                    # healthy/degraded/unreachable banner (3 states, UI-SPEC)
├── ThresholdsPanel.tsx
├── VendorsGrid.tsx
├── DigestPanel.tsx
└── QuickLinks.tsx

next.config.mjs                         # MODIFIED — add outputFileTracingIncludes entry
```

### Pattern 1: Reusing `checkHealth()` in a Server Component (no self-HTTP-fetch)

**What:** Import the health route's `GET` handler directly and invoke it in-process, exactly as the cron does.
**When to use:** Any server-rendered surface (dashboard page, digest row) that needs the live health status.
**Example — verified against the actual repo files (`app/api/health/route.ts`, `app/api/cron/daily-observability-check/route.ts`):**
```typescript
// Source: existing app/api/cron/daily-observability-check/route.ts (lines 40-50), adapted for a page
import { GET as checkHealth } from '@/app/api/health/route'

async function getHealthStatus(): Promise<{ status: 'healthy' | 'degraded' | 'unknown'; checkedAt?: string }> {
  try {
    const res = await checkHealth() // NextResponse — no HTTP round-trip, no fetch()
    const body = await res.json() as { status: string; checkedAt: string }
    return { status: body.status === 'healthy' ? 'healthy' : 'degraded', checkedAt: body.checkedAt }
  } catch {
    // Belt-and-suspenders — checkHealth() itself never throws (verified in
    // route.ts: every branch is try/catch-wrapped and always returns a
    // NextResponse), but the UI-SPEC's "Unreachable/exception" banner state
    // still requires this page-level catch as defense in depth.
    return { status: 'unknown' }
  }
}
```
Note: `checkHealth()`'s actual return shape is `{ status: 'healthy'|'degraded', checkedAt: ISOString, durationMs: number }` — there is no `'unknown'` status from the route itself (only from a page-level catch, per the UI-SPEC's "Unreachable/exception" state).

### Pattern 2: Digest "today" row — reusing the cron's classification loop without sending email

**What:** Compute the same per-metric classification the cron emails, but render it instead of calling `fanOutAlert`.
**Example — mirrors `app/api/cron/daily-observability-check/route.ts` lines 62-69 exactly, minus the email dispatch:**
```typescript
import { THRESHOLDS, classifyThreshold, type ThresholdMetric } from '@/lib/observability/config'

const metricRows = (Object.keys(THRESHOLDS) as ThresholdMetric[])
  .filter((metric) => metric !== 'monthly_spend_usd') // handled by its own Spend tile (D-09)
  .map((metric) => ({ metric, status: classifyThreshold(metric, undefined) })) // always 'unknown' until v2 wires telemetry — this is honest, not a bug
```
Do NOT call `fanOutAlert()` — that is the one line of the cron's logic this phase must NOT reuse (D-08: "without sending email").

### Pattern 3: Markdown doc page as a plain (non-`'use client'`) Server Component

**What:** Read the trusted `.md` file at request time, render with `react-markdown`.
**Example:**
```tsx
// app/(admin)/playbook/it/vendor-directory/page.tsx
import { requireStaff } from '@/lib/admin/gate' // adapted for a page context — see D-02 note below
import { readObservabilityDoc } from '@/lib/playbook/read-doc'
import { MarkdownDoc } from '@/components/playbook/MarkdownDoc'

export default async function VendorDirectoryPage() {
  // D-02: inline self-guard on every IT-room page, not just the layout.
  // requireStaff() as written returns { error, status } | { user, staffRole }
  // and is designed for API routes; a page-context equivalent should call
  // getStaffRole(user) directly + redirect()/notFound(), mirroring the
  // pattern in app/(admin)/layout.tsx (getStaffRole + redirect), not
  // requireStaff()'s NextResponse-shaped return. Planner: confirm the exact
  // page-guard helper signature during planning (may need a new
  // requireStaffPage()-style wrapper in lib/admin/gate.ts, or inline
  // getStaffRole() + redirect() calls per page).
  const md = await readObservabilityDoc('VENDOR-DIRECTORY.md')
  return <MarkdownDoc content={md} />
}
```
```tsx
// components/playbook/MarkdownDoc.tsx — NOT 'use client': react-markdown
// has no client-only hooks/state, so this stays a Server Component and
// ships zero JS for the markdown body.
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
```typescript
// lib/playbook/read-doc.ts — mirrors lib/vault/pdf/fonts.ts's fail-fast
// pattern (assertFontFileExists) so a missing/renamed doc file throws a
// descriptive error instead of rendering blank or crashing opaquely.
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'

const DOCS_DIR = path.join(process.cwd(), 'docs', 'observability')

export async function readObservabilityDoc(filename: string): Promise<string> {
  const filePath = path.join(DOCS_DIR, filename)
  if (!fsSync.existsSync(filePath)) {
    throw new Error(
      `readObservabilityDoc(): required doc not found at "${filePath}". ` +
        'If this is a production deploy, confirm outputFileTracingIncludes in ' +
        'next.config.mjs actually shipped docs/observability/ into the serverless bundle ' +
        '(see 33-RESEARCH.md "Deployment risk" section).'
    )
  }
  return fs.readFile(filePath, 'utf-8')
}
```

### Pattern 4: `components` override map satisfying the UI-SPEC's element contract

**What:** A single shared object mapping markdown element tags to styled React elements, matching the UI-SPEC's "Doc-Page Markdown Container Contract" table verbatim.
**Example (abbreviated — full map covers all rows in the UI-SPEC table: h1/h2/h3/p/strong/a/blockquote/table/thead/th/td/code/pre/ul/ol/hr):**
```tsx
// Source: derived from 33-UI-SPEC.md "Doc-Page Markdown Container Contract"
import type { Components } from 'react-markdown'

export const markdownComponents: Components = {
  h1: (props) => <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-white leading-[1.1]" {...props} />,
  h2: (props) => <h2 className="mt-8 mb-3 text-[20px] font-bold text-white" {...props} />,
  h3: (props) => <h3 className="mt-[22px] text-[15px] font-bold text-white" {...props} />,
  p: (props) => <p className="text-[14px] leading-[1.6] text-[color:var(--lav)]" {...props} />,
  strong: (props) => <strong className="text-white font-semibold" {...props} />,
  a: (props) => <a className="text-[color:var(--indigo)] hover:underline" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-4 rounded-r-xl border-l-[3px] border-[#F59E0B] bg-[#F59E0B0F] px-4 py-3"
      {...props}
    />
  ),
  table: (props) => <table className="w-full overflow-hidden rounded-xl border border-[color:var(--hair)]" {...props} />,
  th: (props) => (
    <th className="bg-[color:var(--card2)] px-3 py-2.5 text-[11px] font-bold uppercase text-[color:var(--lavdim)]" {...props} />
  ),
  td: (props) => <td className="border-t border-[color:var(--hair)] px-3 py-2.5 text-[13px] text-[color:var(--lav)]" {...props} />,
  code: (props) => <code className="rounded bg-[color:var(--card2)] px-1.5 py-0.5 font-mono text-[12.5px] text-[color:var(--lav)]" {...props} />,
  pre: (props) => (
    <pre className="overflow-x-auto rounded-[10px] border border-[color:var(--hair)] bg-[color:var(--card)] px-4 py-3.5 font-mono text-[12.5px]" {...props} />
  ),
  hr: () => <hr className="my-8 border-t border-[color:var(--hair)]" />,
}
```

### Anti-Patterns to Avoid
- **`dangerouslySetInnerHTML` with `marked`-produced HTML:** avoided entirely by choosing `react-markdown`; do not reintroduce this pattern for the Playbook surface.
- **Self-HTTP-fetching `/api/health` from the dashboard page:** never `fetch('/api/health')` or `fetch(\`${origin}/api/health\`)` from a server component — this doubles latency, requires resolving the deploy's own base URL, and is explicitly what D-07 says to avoid. Always `import { GET as checkHealth }`.
- **Sending the digest email from the dashboard render:** never call `fanOutAlert()` from the page — that would silently double-send the daily digest email on every dashboard page view. Only reuse the classification loop, not the alert dispatch.
- **Reading `.md` files with a literal relative path (`'./docs/...'`) instead of `path.join(process.cwd(), ...)`:** Next.js's build working directory and the deployed Lambda's working directory are not guaranteed to match a naive relative path; `process.cwd()` is the pattern already proven in `lib/vault/pdf/fonts.ts`.
- **Forgetting the `outputFileTracingIncludes` entry:** this is the phase's single highest-risk gap — it will pass every local `npm run dev` check and 404/throw only after a real Vercel deploy.

## Runtime State Inventory

Not applicable — this phase is not a rename/refactor/migration phase. It is a net-new feature addition (new route tree, new role, new render surface). No existing runtime state (data, service config, OS registrations, secrets, build artifacts) is being renamed or moved.

## Common Pitfalls

### Pitfall 1: `docs/observability/*.md` files invisible to Vercel's serverless bundle
**What goes wrong:** `fs.readFile(path.join(process.cwd(), 'docs/observability/RUNBOOK.md'))` works perfectly in `npm run dev` and even in `npm run build && npm run start` locally (because `process.cwd()` is the repo root either way), but 404s/throws once deployed to Vercel, because Next.js's `@vercel/nft`-based output file tracing only bundles files it can statically detect from `import`/`require`/traced `fs` calls — a `path.join(process.cwd(), ...)` argument built at runtime is invisible to that static trace.
**Why it happens:** This is the exact same failure class the codebase already hit and fixed for `assets/fonts/*.ttf` (see `next.config.mjs`'s inline comment: "a Font.register() call passing a runtime-computed path is invisible to that trace... without this declaration the fonts resolve fine in local dev... and then 404/throw in the deployed serverless bundle").
**How to avoid:** Add a new `outputFileTracingIncludes` entry in `next.config.mjs`, e.g.:
```javascript
outputFileTracingIncludes: {
  'app/api/**/*': ['./assets/fonts/**'],
  'app/(admin)/playbook/**/*': ['./docs/observability/**'], // NEW — mirrors the fonts fix exactly
},
```
**IMPORTANT — key-format ambiguity found during research:** the *currently published* Next.js docs (fetched against a Next.js 16.3.1 docs snapshot, newer than this project's installed **15.5.19**) state `outputFileTracingIncludes` keys are **route-path globs matched by picomatch against the URL route** (e.g. `'/api/hello'`, with route-group parens needing `\\(admin\\)`-style escaping) — NOT filesystem-path globs. But this exact repo's `next.config.mjs`, already shipped and live in production, uses a **filesystem-path-style key** (`'app/api/**/*'`) for the fonts fix and (per STATE.md) works correctly. Do not resolve this ambiguity by guessing — **the concrete verification step is mandatory**: after adding the new entry, run `npx next build` locally and inspect the emitted trace manifest (`.next/server/app/**/*.nft.json` — find the file(s) corresponding to the IT-room doc-page routes) and grep for `docs/observability` to confirm the `.md` files are actually listed as bundled dependencies **before** merging/deploying. If the file-path-style key (mirroring the proven fonts fix) doesn't produce the expected trace entries, try the route-path style key as a fallback, escaping the `(admin)` route group per the official docs' example (`'/playbook/it/\\*'`-equivalent — route groups are stripped from the actual URL, so the key likely should NOT include `(admin)` at all if using route-path format, since `(admin)` never appears in the browser URL).
**Warning signs:** Everything works in `npm run dev`, works in `npm run build && npm run start` run from the repo root, and STILL breaks in Vercel — because only Vercel's actual per-function serverless bundle isolates files per the trace manifest; a local `next start` run from the full repo checkout can mask this bug completely since all files are present on disk regardless of what's in the trace.

### Pitfall 2: Treating `requireStaff()` as page-ready as-is
**What goes wrong:** `requireStaff()` (`lib/admin/gate.ts`) returns `{ error: 'Forbidden', status: 403 }` — a shape designed for API route handlers (`return NextResponse.json(result, { status: result.status })`), not for a page Server Component, which needs to call `redirect()` or `notFound()` instead of returning a JSON error body.
**Why it happens:** Every existing `requireStaff()` call site in the codebase is inside an `app/api/**/route.ts` handler. This phase is the first to need the same role check inside a **page** (`app/(admin)/playbook/it/*/page.tsx`).
**How to avoid:** Either (a) call `getStaffRole(user)` directly (the underlying primitive `requireStaff()` itself calls) and `redirect()`/`notFound()` inline, mirroring `app/(admin)/layout.tsx`'s own `if (!role) redirect('/')` pattern, or (b) add a small new `requireStaffPage()` helper to `lib/admin/gate.ts` that wraps the same logic but returns a page-appropriate result. The planner should pick one approach and apply it consistently across all 5 IT-room pages (D-02 requires each page carry its own guard, not just the nested layout).
**Warning signs:** A page that imports `requireStaff()` and tries to `return NextResponse.json(...)` from inside a Server Component page function — this is a type/runtime mismatch (page components must return JSX or call Next.js's `redirect`/`notFound`, not construct a `NextResponse`).

### Pitfall 3: `react-markdown`'s ESM-only nature breaking a Jest test, not the app itself
**What goes wrong:** `react-markdown` v9+ and `remark-gfm` v4 are ESM-only packages. Next.js's own bundler (webpack/Turbopack under `next build`/`next dev`) handles ESM packages natively — **the app itself will not break**. But if any Wave-0/verification Jest test imports these components directly (e.g. a snapshot test of `MarkdownDoc`), Jest's default CommonJS transform can fail on `import`/`export` syntax in the ESM-only package unless a matching transform is configured.
**Why it happens:** This codebase already hit an identical issue for a different ESM-only package: STATE.md documents (17-03) "added a scoped ESM transform (babel-jest + next/babel) and an import.meta.url shim for `@react-pdf/renderer`'s ESM-only dependency tree (first exercised by a test in this codebase)."
**How to avoid:** If the plan includes a Jest test that renders `<MarkdownDoc>` or otherwise imports `react-markdown`/`remark-gfm` at the top of a test file, extend `jest.config.js`'s existing `transformIgnorePatterns` (added for the `@react-pdf/renderer` case) to also allow-list `react-markdown`, `remark-gfm`, and their `unified`/`remark`/`mdast`/`micromark`/`vfile` transitive dependencies (the entire unified ecosystem is ESM-only). Alternatively, scope automated tests to pure-logic modules (`read-doc.ts`, `markdown-components.tsx`'s exported map shape) and cover the actual `<ReactMarkdown>` render only via manual/UAT verification, avoiding the Jest-ESM problem entirely.
**Warning signs:** `SyntaxError: Cannot use import statement outside a module` when running `npm test` after adding a test file that imports `react-markdown`.

### Pitfall 4: Digest row silently double-counting an "unknown" vendor-uptime signal as a threshold metric
**What goes wrong:** `THRESHOLDS` includes `uptime_consecutive_failures`, which per the UI-SPEC's own Thresholds panel table is intentionally **excluded** from the 7-row thresholds table ("belongs to Better Stack's own alerting, represented by the Uptime tile/panel, not this table"). If the digest-row logic naively iterates `Object.keys(THRESHOLDS)` without also excluding `uptime_consecutive_failures` (only `monthly_spend_usd` is excluded in the cron's own existing filter), the digest text could imply a threshold classification exists for a metric the dashboard has visually declared "not measured here."
**Why it happens:** The cron's existing filter (`.filter((metric) => metric !== 'monthly_spend_usd')`) predates the UI-SPEC's stricter 7-row exclusion list (which also drops `uptime_consecutive_failures`). Copying the cron's filter verbatim into the dashboard's digest-row computation would under-filter relative to what the Thresholds panel itself renders.
**How to avoid:** For the **Thresholds panel**, use the UI-SPEC's explicit 7-metric allowlist table (not a blanket "all except spend" filter). For the **digest row's own summary text**, the UI-SPEC's locked copy ("All threshold metrics: no live telemetry yet") is metric-agnostic prose, not a per-metric list — so this pitfall mainly affects the Thresholds panel row set, not the digest text. Flag to the planner: use two different derivations (allowlist for the panel, cron-mirrored generic filter+status only for the digest's `healthStatus`).

## Code Examples

### Reading `getStaffRole()` for page-level rendering (visibility, not the security gate itself)
```typescript
// Source: lib/admin/staff-role.ts (verbatim, existing file — DO NOT reinvent)
export type StaffRole = 'leadership' | 'ae' | 'bd' | 'anr' // + 'it' added by this phase

export function getStaffRole(user: { app_metadata?: unknown }): StaffRole | null {
  const meta = user?.app_metadata as { staff_role?: string; is_admin?: boolean } | undefined
  if (
    meta?.staff_role === 'leadership' ||
    meta?.staff_role === 'ae' ||
    meta?.staff_role === 'bd' ||
    meta?.staff_role === 'anr'
    // + meta?.staff_role === 'it'  (D-01 addition)
  ) {
    return meta.staff_role
  }
  if (meta?.is_admin === true) return 'leadership'
  return null
}
```

### Active-nav highlighting — minimal client wrapper (mirrors `components/nav/ArtistNav.tsx`'s proven pattern, scoped down)
```tsx
// Source: pattern derived from components/nav/ArtistNav.tsx (existing, full-nav
// 'use client' + usePathname) — but scoped to ONLY the new link, per UI-SPEC's
// explicit instruction that "the rest of Rail 1 stays server-rendered and stateless"
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BASE = 'rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'

export function PlaybookNavLink() {
  const pathname = usePathname() ?? ''
  const active = pathname.startsWith('/admin/playbook')
  return (
    <Link
      href="/admin/playbook"
      className={active ? `${BASE} bg-[color:var(--border)] text-[color:var(--ink)] font-semibold` : BASE}
    >
      The Playbook
    </Link>
  )
}
```
Rail 2's room/sub-room active rows should use the identical `usePathname()` + `startsWith()` comparison technique (already proven at `components/nav/ArtistNav.tsx` line 287: `pathname === match || pathname.startsWith(match + '/')`), scoped to just the interactive row components, keeping the room-list structure itself server-rendered.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — first markdown renderer in this codebase | `react-markdown` v10 (ESM-only since v9, released ~2023) | react-markdown went ESM-only starting v9 | Works fine in Next.js's bundler; only affects Jest test config if tests import it directly (Pitfall 3) |
| N/A | `outputFileTracingIncludes` at top-level config (graduated from `experimental` in Next.js 13/14, confirmed still top-level in 15.5.19) | Already adopted in this repo for the fonts fix | No new adoption needed — extend the existing pattern |

**Deprecated/outdated:** none relevant — this is new-territory tooling for this codebase, not a migration off something old.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `outputFileTracingIncludes`'s exact key-matching semantics (file-path glob vs. route-path glob) for this project's installed Next.js 15.5.19 | Common Pitfall 1 | If the wrong key format is used and not verified via a local trace inspection, the doc pages will 404/throw only in production — this is exactly the failure mode research question #2 was scoped to prevent. Mitigated by the mandatory `next build` trace-verification step documented above; this is a MEDIUM-confidence area despite the HIGH-confidence fix pattern, because official docs and this repo's own working config visibly disagree on key format across Next.js versions. |
| A2 | `requireStaff()` needs a page-context adaptation (vs. being directly callable in a Server Component page) | Common Pitfall 2 | Low risk — if wrong, the fix is a one-line signature adjustment; worst case is a type error caught at build time, not a silent production gap. |
| A3 | Rail 2's room/sub-room active-state should reuse `usePathname()` (not `useSelectedLayoutSegment()`) | Architecture Patterns, Code Examples | Low risk — both are valid Next.js primitives for this; `usePathname()` was chosen for consistency with the already-locked Rail 1 approach and the existing `ArtistNav.tsx` precedent, not because `useSelectedLayoutSegment()` would fail. |

## Open Questions

1. **Exact `outputFileTracingIncludes` glob key syntax for this Next.js version/route-group combination.**
   - What we know: the fonts fix uses a filesystem-path-style key (`'app/api/**/*'`) and works in production; the newest published Next.js docs (a newer version than installed) describe a route-path-style key (`'/api/hello'`) with explicit escaping for route-group parens.
   - What's unclear: whether Next.js 15.5.19 specifically accepts the filesystem-path style, the route-path style, or both; whether the `(admin)` route group needs escaping in either format.
   - Recommendation: the planner should include an explicit task/verification step — `npx next build` locally, then `grep -r docs/observability .next/server` (or inspect the specific `.nft.json` for the IT room's page routes) — as a **hard gate** before considering the doc-page tasks done, not just "add the config line and assume it works."

2. **Whether `docs/observability/*.md`'s existing cross-references to files NOT rendered in v1 (`docs/BREAK-GLASS.md`, `SUPABASE-HEALTH-REVIEW.md`, `VERCEL-ALERTS-RESPONSE.md`, `UPTIME-MONITORING.md`) should render as plain text or become dead/external links.**
   - What we know: `RUNBOOK.md` and `VENDOR-DIRECTORY.md` reference these other docs by filename in prose (e.g. "docs/BREAK-GLASS.md's framing..."). These other docs are NOT part of the 4-page v1 scope (D-10's page→file map covers only VENDOR-DIRECTORY/RUNBOOK/OPERATING-RHYTHM/THRESHOLDS-AND-SEVERITY).
   - What's unclear: the UI-SPEC doesn't address whether `react-markdown`'s default `a` renderer should auto-linkify these filename-mentions (it won't — they're plain text, not markdown links, in the source `.md` — confirmed by reading the actual files) or whether some renderer enhancement should turn `docs/X.md` mentions into links to those (non-existent-in-v1) routes.
   - Recommendation: no action needed — these are plain prose text in the source markdown (not `[text](url)` links), so `react-markdown` renders them as plain text automatically, with zero extra logic. Confirmed by direct inspection of `RUNBOOK.md` and `VENDOR-DIRECTORY.md` — verified, not assumed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 15 runtime | ✓ | v24.15.0 (local); Vercel resolves per its own Node runtime config | — |
| Next.js | App Router, `outputFileTracingIncludes`, nested layouts | ✓ | 15.5.19 (installed, `npm ls next`) | — |
| `react-markdown` | Doc-page rendering | ✗ (not yet installed) | target 10.1.0 | none needed — `npm install` is the fix, not a workaround |
| `remark-gfm` | GFM table support | ✗ (not yet installed) | target 4.0.1 | none needed |
| `docs/observability/*.md` (4 files) | Doc-page content source | ✓ (all 4 exist and were read directly: VENDOR-DIRECTORY.md 123 lines, RUNBOOK.md 113 lines, OPERATING-RHYTHM.md 74 lines, THRESHOLDS-AND-SEVERITY.md 78 lines) | — | — |
| `funun_staff` table / `it` StaffRole | Role gating | Code-ready (union not yet widened); DB CHECK not yet widened | — | Owner-run migration required before any account can actually hold `it` (see below) |

**Missing dependencies with no fallback:**
- `react-markdown` + `remark-gfm` — must be installed; no viable substitute given the codebase's established anti-`dangerouslySetInnerHTML` convention (see Alternatives Considered).

**Missing dependencies with fallback:**
- None — the `it` StaffRole code addition can ship immediately (safe, no DB row can hold it pre-migration, per the established `anr` precedent); the migration itself is owner-run and gated behind a `checkpoint:human-verify`-equivalent step, not a blocking dependency for the code portion of this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 + ts-jest (transpile-only, `isolatedModules: true` — TS type errors do NOT fail test runs; rely on `tsc --noEmit` separately) |
| Config file | `jest.config.js` (already has a scoped ESM transform for `@react-pdf/renderer`'s ESM-only deps — see Pitfall 3; extend if `react-markdown` is unit-tested directly) |
| Quick run command | `npx jest lib/playbook lib/admin/staff-role.test.ts --silent` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAYBOOK-01 | `it` added to `StaffRole` union, `ALL_STAFF_ROLES`, `getStaffRole()` recognizes it | unit | `npx jest lib/admin` | ✅ existing `staff-role`-adjacent tests likely need a new assertion — ❌ Wave 0 if no dedicated `staff-role.test.ts` exists yet (confirm during planning) |
| PLAYBOOK-04 | IT room pages 403/redirect for non-`leadership`/`it` roles | integration | manual/UAT — page-level auth typically isn't unit-testable without a full request/response harness in this codebase's existing convention | N/A — manual verification, matches existing pattern for other inline page guards |
| PLAYBOOK-06 | `docs/observability/*.md` readable via `readObservabilityDoc()` locally | unit | `npx jest lib/playbook/read-doc.test.ts` | ❌ Wave 0 — new file |
| PLAYBOOK-06 | `.md` files bundled into the Vercel serverless trace | build-verification (not unit-testable) | `npx next build` + manual grep of `.next/server/**/*.nft.json` | N/A — this is the mandatory manual gate from Open Question 1, not an automatable Jest test |
| PLAYBOOK-07 | `checkHealth()` reuse produces the expected banner state for healthy/degraded/exception | unit | `npx jest components/playbook/StatusBanner.test.tsx` (mock `checkHealth`) | ❌ Wave 0 — new file |
| PLAYBOOK-08 | Digest row classification matches cron's own logic (parity, not divergence) | unit | `npx jest lib/playbook/digest.test.ts` | ❌ Wave 0 — new file; consider a shared-fixture test mirroring the 18-04 "shared coverage-fixtures.ts scenario table" parity-anchor pattern already used elsewhere in this codebase for exactly this kind of "two call sites must stay in sync" risk |
| PLAYBOOK-09 | Thresholds panel renders the correct 7-row allowlist (excludes spend + uptime_consecutive_failures) | unit | `npx jest components/playbook/ThresholdsPanel.test.tsx` | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npx jest lib/playbook lib/admin/staff-role.test.ts --silent` (fast, scoped)
- **Per wave merge:** `npm test` (full suite — this repo's suite was ~455-462+ tests as of Phase 17 and has grown substantially since; always run full suite before considering a wave done)
- **Phase gate:** Full suite green + `npm run lint` + `tsc --noEmit` (ts-jest is transpile-only, so type errors are NOT caught by `npm test` alone) + the manual `next build` trace-verification step (Open Question 1) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `lib/playbook/read-doc.test.ts` — covers PLAYBOOK-06 (local file existence, fail-fast error message)
- [ ] `lib/admin/staff-role.test.ts` (if it doesn't already exist — confirm during planning; grep found no existing file by this name, though `getStaffRole` is presumably covered indirectly by other admin tests) — covers PLAYBOOK-01
- [ ] `lib/playbook/digest.test.ts` — covers PLAYBOOK-08, parity against the cron's own filter logic
- [ ] `components/playbook/StatusBanner.test.tsx` — covers PLAYBOOK-07's 3 banner states (healthy/degraded/unreachable)
- [ ] `components/playbook/ThresholdsPanel.test.tsx` — covers PLAYBOOK-09's 7-row allowlist
- Framework install: none — Jest/ts-jest already fully configured; only a possible `transformIgnorePatterns` extension if `react-markdown` is imported into a test file directly (Pitfall 3)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new surface) | Reuses existing Supabase session auth; no new auth surface introduced |
| V3 Session Management | No | Unchanged — reuses existing cookie-based Supabase session |
| V4 Access Control | **Yes** | `requireStaff(['leadership','it'])` gate (D-02) on every IT-room route, mirrored server + inline-per-page, matching the established "layout gate + per-page self-guard" doctrine already audited elsewhere in this codebase (25-06, 13-04 precedent, per UI-SPEC's own citation) |
| V5 Input Validation | N/A — read-only v1, zero forms/mutations | No user input accepted anywhere in this phase's surfaces |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Elevation of privilege via forgotten inline guard on one of the 5 IT-room pages | Elevation of Privilege | D-02's explicit requirement that EVERY page (not just the layout) carries its own `requireStaff(['leadership','it'])` call — verifiable by grepping all 5 page files for the guard call during code review, mirroring the audit approach already used for `anr` (T-30-06) |
| `it` role granted broader authority than intended via a copy-paste of `requireStaff(ALL_STAFF_ROLES)` instead of the scoped `['leadership','it']` array | Elevation of Privilege | Code review: confirm every IT-room guard call site uses the explicit 2-role array, never the default `ALL_STAFF_ROLES` |
| Information disclosure via the `.md` doc pages leaking a doc's raw prose about credential locations before the reader confirms role gating | Information Disclosure | Already mitigated by D-02's role gate being CHECKED before any `readObservabilityDoc()` call executes — the planner should ensure the guard runs before the file read, not after (fail closed, not fail open) |
| A future non-leadership `it` hire's account somehow also gaining `leadership`-only nav links via a stale/cached role check | Elevation of Privilege | Not a risk introduced by this phase — `getStaffRole()` reads `app_metadata` fresh on every request via `supabase.auth.getUser()`; no caching layer exists to go stale |

## Sources

### Primary (HIGH confidence)
- Direct file reads of this repository: `lib/admin/staff-role.ts`, `lib/admin/gate.ts`, `app/(admin)/layout.tsx`, `supabase/migrations/108_anr_staff_role.sql`, `app/api/health/route.ts`, `app/api/cron/daily-observability-check/route.ts`, `lib/observability/config.ts`, `next.config.mjs`, `lib/vault/pdf/fonts.ts` + `fonts.test.ts`, `components/nav/ArtistNav.tsx`, `docs/observability/VENDOR-DIRECTORY.md`, `docs/observability/RUNBOOK.md`, `package.json`
- `npm view react-markdown version` / `npm view remark-gfm version` / `npm ls react-markdown marked remark-gfm` / `npm ls next` — direct registry + local install verification
- `gsd-tools query package-legitimacy check --ecosystem npm react-markdown remark-gfm` — both `OK`

### Secondary (MEDIUM confidence)
- [nextjs.org — output config (outputFileTracingIncludes)](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) — fetched docs are versioned 16.3.1, newer than this project's installed 15.5.19; used to identify the key-format ambiguity in Pitfall 1, cross-checked against this repo's own working `next.config.mjs`
- WebSearch: "react-markdown v9 Next.js 15 App Router Server Component ESM require esm-only" — confirmed ESM-only nature and RSC compatibility
- WebSearch: "Next.js App Router usePathname active nav link vs useSelectedLayoutSegment nested layout" — confirmed `usePathname()` is the correct/simpler primitive for this shape vs. `useSelectedLayoutSegment()`

### Tertiary (LOW confidence)
- None — all claims above were either verified directly against this repository's files or cross-checked against official Next.js documentation / npm registry data.

## Metadata

**Confidence breakdown:**
- Standard stack (react-markdown/remark-gfm choice): HIGH — verified installed-package state, registry legitimacy, and direct comparison against the codebase's own anti-`dangerouslySetInnerHTML` convention
- Deployment risk / `outputFileTracingIncludes` fix: MEDIUM-HIGH — the *need* for the fix is HIGH confidence (proven precedent in this exact repo), but the *exact glob key syntax* is MEDIUM confidence due to a genuine documentation-version discrepancy discovered during research; mitigated with a mandatory build-verification step
- `checkHealth()` / digest reuse: HIGH — read the exact live source files; patterns are copy-adaptable, not speculative
- Active-nav highlighting: HIGH — directly matches an already-locked UI-SPEC decision plus an existing, proven in-repo precedent (`ArtistNav.tsx`)
- `it` StaffRole mechanics: HIGH — mechanically identical to the already-shipped `anr` precedent (migration 108), next migration number confirmed as 114

**Research date:** 2026-08-17
**Valid until:** 30 days (stable Next.js 15.x APIs; react-markdown/remark-gfm are mature, low-churn packages) — but re-verify the `outputFileTracingIncludes` key-format question specifically if Next.js is upgraded past 15.5.19 before this phase executes, since the docs-version discrepancy found during this research suggests the behavior may have changed between 15.x and 16.x.
