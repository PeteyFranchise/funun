---
phase: 33-the-playbook-shell-it-team-monitoring-dashboard-read-only-v1
reviewed: 2026-08-18T02:10:58Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - __tests__/playbook-digest.test.ts
  - __tests__/playbook-docs-render.test.ts
  - __tests__/playbook-nav.test.ts
  - __tests__/playbook-read-doc.test.ts
  - __tests__/playbook-status-banner.test.tsx
  - __tests__/playbook-thresholds-panel.test.tsx
  - __tests__/staff-role-it.test.ts
  - app/(admin)/layout.tsx
  - app/(admin)/playbook/it/dashboard/page.tsx
  - app/(admin)/playbook/it/operating-rhythm/page.tsx
  - app/(admin)/playbook/it/runbook/page.tsx
  - app/(admin)/playbook/it/thresholds/page.tsx
  - app/(admin)/playbook/it/vendor-directory/page.tsx
  - app/(admin)/playbook/layout.tsx
  - app/(admin)/playbook/page.tsx
  - components/admin/StaffAdmin.tsx
  - components/admin/TeamDirectory.tsx
  - components/playbook/DigestPanel.tsx
  - components/playbook/ItRoomTopBar.tsx
  - components/playbook/MarkdownDoc.tsx
  - components/playbook/PlaybookNavLink.tsx
  - components/playbook/QuickLinks.tsx
  - components/playbook/Rail2.tsx
  - components/playbook/StatusBanner.tsx
  - components/playbook/ThresholdsPanel.tsx
  - components/playbook/VendorsGrid.tsx
  - lib/admin/gate.ts
  - lib/admin/staff-role.ts
  - lib/playbook/digest.ts
  - lib/playbook/markdown-components.tsx
  - lib/playbook/nav.ts
  - lib/playbook/read-doc.ts
  - next.config.mjs
  - package.json
  - supabase/migrations/114_it_staff_role.sql
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-08-18T02:10:58Z
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 33 ships a read-only internal "Playbook" admin surface with an IT-room
monitoring dashboard. The four focus areas held up well on the primary axes:

- **Access control (IT room):** All 5 IT-room pages call
  `requireStaffPage(['leadership','it'])` as the first statement, before any
  `readObservabilityDoc()` / `getDashboardHealth()` call. `requireStaffPage()`
  is fail-closed (redirects on no-session and on out-of-allowlist role). Good.
- **Secret/PII exposure:** The dashboard reads only the derived
  `status` string from the in-process health handler and passes a
  `'healthy'|'degraded'|'unknown'` scalar to client components. No vendor keys,
  tokens, or health-body internals reach the client bundle. VendorsGrid /
  QuickLinks contain only public dashboard URLs. `next.config.mjs` exposes only
  `SENTRY_DSN` (intentional, browser-delivered) and `VERCEL_ENV`.
- **Path traversal:** The page→file map (`DOC_PAGE_FILE`) is a fixed
  compile-time allowlist and no user input reaches `readObservabilityDoc()`
  today — but the reader itself has no containment guard (WR-03).
- **`it` role widening:** Type union, `ALL_STAFF_ROLES`, `getStaffRole`, and
  migration 114 CHECK are all internally consistent — but widening the *general*
  staff set silently grants `it` access to every all-staff admin page, which the
  migration's own invariant forbids (CR-01).

One blocker and three warnings below.

## Critical Issues

### CR-01: `it` role is over-granted access to all-staff admin surfaces (client/lead pipeline)

**File:** `lib/admin/staff-role.ts:27-29`, `app/(admin)/layout.tsx:27-28`, `supabase/migrations/114_it_staff_role.sql:31-34`
**Issue:**
Migration 114 states the invariant explicitly: *"'it' carries ONLY read access
to The Playbook's IT Team room ... it is never granted write/curation power
anywhere in the app."* The implementation breaks that invariant.

`getStaffRole()` now returns `'it'`, and `'it'` is added to `ALL_STAFF_ROLES`.
The parent admin layout admits **any** non-null staff role
(`app/(admin)/layout.tsx:27-28`: `const role = getStaffRole(user); if (!role) redirect('/')`),
and the all-staff admin pages guard identically. Verified in-repo:

- `app/(admin)/admin/crate-requests/page.tsx:24-25` → `if (!role) redirect('/')`
- `app/(admin)/admin/selects/page.tsx:53-54` → `if (!role) redirect('/')`
- `app/(admin)/admin/my-client-partners/page.tsx:90-91` → `if (!role) redirect('/')`
- `app/(admin)/admin/artist-invites/page.tsx:23-24` → `if (!role) redirect('/')`
- `app/(admin)/admin/directory/page.tsx:21` → `if (getStaffRole(user) === null) redirect('/')`

Because these pages admit *any* recognized role, a new `it` user reaches the
Crate Requests demand inbox, the Selects cross-client pipeline, My Client
Partners, and Artist Invites — i.e. client-partner sales pipeline and lead data
— even though `it` is documented as monitoring-read-only. The admin sidebar
(`app/(admin)/layout.tsx:115-134`) also renders all of these links to every
staff role, so the surfaces are discoverable, not just reachable by URL.

This is an authorization over-grant: adding a role to the shared staff set is
not the same as scoping it to the IT room, and no page outside the IT room
excludes `it`.

**Fix:** Scope `it` to the IT room explicitly rather than folding it into the
general staff set. Minimal targeted guard on every non-IT admin page/route that
should exclude `it` (redirect it to its only room):

```ts
const role = getStaffRole(user)
if (!role) redirect('/')
if (role === 'it') redirect('/admin/playbook/it/dashboard')
```

Or, preferably, introduce an explicit allowlist for the general staff surfaces
(e.g. `requireStaff(['leadership','ae','bd','anr'])`) so `it` must be added
deliberately per-surface, and hide the AE/sales nav links from `it` in
`app/(admin)/layout.tsx`.

## Warnings

### WR-01: DigestPanel / ThresholdsPanel / StatusBanner reference undefined + non-theme-aware CSS tokens (`--hair`, `--card`, `--lav`, `--lavdim`)

**File:** `components/playbook/DigestPanel.tsx:13,27,30,32,38,42,44`; `components/playbook/ThresholdsPanel.tsx:39,51,53,55,63`; `components/playbook/StatusBanner.tsx:45,50,59`
**Issue:**
These three components were not migrated to the real `.fncon` token names that
their sibling components deliberately adopted. `lib/playbook/markdown-components.tsx:8-17`
and `components/playbook/VendorsGrid.tsx:1-11` both document the exact hazard:
the mockup aliases `--card/--hair/--card2/--lavdim` "are NOT declared anywhere
in this codebase ... using them literally would resolve to nothing and render
invisibly." VendorsGrid, QuickLinks, and the markdown map use
`--panel / --border / --ink-2 / --ink-3`. DigestPanel, ThresholdsPanel, and
StatusBanner still use the old aliases. Confirmed against the token sources:

- `.fncon` block (`components/admin/console-theme.ts:19,24`) defines
  `--panel/--panel-2/--ink/--ink-2/--ink-3/--border/...` but **not**
  `--hair/--card/--lav/--lavdim`.
- `app/globals.css:11,14` defines `--card` and `--lav` at `:root` only (and the
  dim token is named `--lav-dim`, not `--lavdim`); `--hair` and `--lavdim` are
  defined nowhere.

Result at runtime:
- `--hair` and `--lavdim` are undefined → invalid at computed-value time →
  borders fall back to `currentColor` and text falls back to inherited color
  (broken/near-invisible hairlines and captions).
- `--card` and `--lav` resolve only to the **`:root` dark values** and never
  pick up the `.fncon[data-theme="light"]` overrides, so in the admin console's
  light theme (toggle at `app/(admin)/layout.tsx:136`) the digest and thresholds
  cards render a dark `#0e0d1e` background with light-lavender `#c7cbf7` text —
  unreadable.

**Fix:** Map to the live `.fncon` tokens exactly as the sibling components did:
`--hair → --border`, `--card → --panel`, `--lav → --ink-2`, `--lavdim → --ink-3`.
For the `DigestPanel` dot map, `lavdim: 'var(--lavdim)'` (line 13) should be
`'var(--ink-3)'`.

### WR-02: Dashboard App-Health tile fabricates "→ 503" for the `unknown` state

**File:** `app/(admin)/playbook/it/dashboard/page.tsx:27,43-49`
**Issue:**
`isHealthy = health === 'healthy'` collapses both `degraded` and `unknown` into
the same "not healthy" branch, so when `getDashboardHealth()` returns `'unknown'`
(health handler threw / body unparseable — `lib/playbook/digest.ts:28`) the tile
prints `Degraded` and `/api/health → 503`. That asserts a concrete 503 response
code for a check that was actually unreachable, contradicting D-07's
honest-surfaces principle and diverging from `StatusBanner`, which correctly
gives `unknown` its own "Health check unavailable — treat as degraded until
confirmed" copy (`components/playbook/StatusBanner.tsx:58-62`).

**Fix:** Branch the tile on all three states instead of a boolean, e.g.:

```tsx
const label = health === 'healthy' ? 'Healthy' : health === 'degraded' ? 'Degraded' : 'Unknown'
const detail = health === 'healthy' ? '→ 200' : health === 'degraded' ? '→ 503' : 'unreachable'
```

### WR-03: `readObservabilityDoc()` has no path-containment guard (latent arbitrary file read)

**File:** `lib/playbook/read-doc.ts:23-34`
**Issue:**
`path.join(DOCS_DIR, filename)` will happily escape `DOCS_DIR` if `filename`
contains `../` (e.g. `path.join(DOCS_DIR, '../../.env')`). Today every caller
passes a fixed `DOC_PAGE_FILE[...]` constant, so this is **not currently
exploitable** — but the function is an exported, reusable utility whose only
safety is caller discipline, and its doc comment advertises fail-fast safety
while doing nothing to constrain the path. Any future caller that forwards user
input turns this into arbitrary file read.

**Fix:** Enforce containment inside the reader — reject path separators / resolve
and verify the prefix:

```ts
if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
  throw new Error(`readObservabilityDoc(): illegal filename "${filename}"`)
}
const filePath = path.join(DOCS_DIR, filename)
if (!path.resolve(filePath).startsWith(path.resolve(DOCS_DIR) + path.sep)) {
  throw new Error('readObservabilityDoc(): path escapes docs/observability')
}
```

## Info

### IN-01: Hardcoded `text-white` in the two panels breaks the light theme

**File:** `components/playbook/DigestPanel.tsx:29,39`; `components/playbook/ThresholdsPanel.tsx:41`; `components/playbook/StatusBanner.tsx:42`
**Issue:** Same class of defect as WR-01 — `text-white` is a fixed color that
renders white-on-light in the console's light theme. VendorsGrid uses
`text-[color:var(--ink)]` for the theme-aware equivalent.
**Fix:** Replace `text-white` with `text-[color:var(--ink)]`.

### IN-02: StatusBanner healthy subtext hardcodes "3/3 uptime monitors up · no open incidents"

**File:** `components/playbook/StatusBanner.tsx:44-48`
**Issue:** The healthy banner states "3/3 uptime monitors up" and "no open
incidents" as fact, while the rest of the dashboard is explicit that there is
"No live per-route data in v1" (`app/(admin)/playbook/it/dashboard/page.tsx:100`)
and uptime is external. A fixed "3/3" can be stale/false and mildly contradicts
the v1 no-live-telemetry honesty stance. Noted as info since it is spec-locked
placeholder copy.
**Fix:** Prefer neutral phrasing that does not assert a live count (e.g.
"/api/health healthy · uptime tracked externally by Better Stack").

---

_Reviewed: 2026-08-18T02:10:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
