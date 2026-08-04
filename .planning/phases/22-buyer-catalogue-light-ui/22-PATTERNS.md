# Phase 22: Buyer Catalogue & Light-Theme Buyer UI - Pattern Map

**Mapped:** 2026-08-04
**Files analyzed:** 9 (remaining work only — built slices 1/2a/2b excluded from "to build")
**Analogs found:** 9 / 9 (all are edits to existing files; no wholly-new roles)

## Scope note

Slices 1/2a/2b are **already built** (`components/buyer/CatalogBrowserLight.tsx`,
`lib/deals/catalog-sample.ts`, `app/(buyer-portal)/buyers/catalog/page.tsx`). This map
covers the **remaining** work: 2c (wire License send), 1.5 (live-data enrichment, GATED),
dark-theme toggle, re-theming other buyer surfaces, and top-nav reconciliation. All target
files already exist — every "new" file in this phase is an edit to a known file, so every
row below has an exact same-file analog (the file's own current pattern) plus a
cross-cutting analog for the specific new behavior.

## File Classification

| File to Modify | Role | Data Flow | Closest Analog (for the NEW behavior) | Match Quality |
|---|---|---|---|---|
| `components/buyer/CatalogBrowserLight.tsx` (`submitRequest`) | component (form submit handler) | request-response | `components/buyer/RequestComposer.tsx` `handleSubmit` (lines 66-98) | exact — same target route, same payload shape |
| `lib/deals/catalog-sample.ts` (`mapCardsToLightRows`) | transform/utility | transform | `lib/deals/catalog.ts` (`CatalogCard`, descriptor readers) | role-match — same module family, needs enrichment types |
| `lib/deals/catalog.ts` (enrich `CatalogCard`) — GATED | model/utility | CRUD (read) | itself, `CatalogFilter`/`buildCatalogFilter` (lines 80-154) | exact — same file, extend existing pattern |
| `lib/deals/catalog-query.ts` (`loadCatalogPage` — add artist/energy/length/mood/vocal/instruments to select + card) — GATED | service | CRUD (read), batch | itself, `PROJECT_COLUMNS`/card-building loop (lines 32-37, 130-155) | exact — same file, extend existing pattern |
| `app/api/buyer/catalog/route.ts` (add server-side pagination/sort params) — GATED | route | request-response | itself (lines 34-52) | exact — same file, extend existing pattern |
| `components/buyer/ShortlistPanel.tsx` (re-theme light) | component | request-response (client fetch DELETE) | `components/buyer/CatalogBrowserLight.tsx` CSS token block (`.fnbl` vars, lines 404) | role-match — same theme system, different component |
| `components/buyer/OrgRequestDashboard.tsx` (re-theme light) | component | request-response (read-only list) | `components/buyer/CatalogBrowserLight.tsx` table/row + badge patterns (`.thead/.trow`, `RightsBadge`, lines 107-114, 476-509) | role-match — table + status-badge pattern reused |
| `app/(buyer-portal)/layout.tsx` (light shell + dark-toggle wiring) | layout/provider | request-response (server component, session gate) | itself (lines 16-53) + artist dark tokens in `tailwind.config.ts` | exact for auth/session gate; new for theme provider |
| `components/buyer/BuyerPortalNav.tsx` (reconcile with catalogue's own top-nav, light theme, dark toggle control) | component (nav) | request-response | itself (lines 10-48) + `CatalogBrowserLight` `<header className="top">` (lines 209-219) | role-match — two competing nav patterns to reconcile |

## Pattern Assignments

### `components/buyer/CatalogBrowserLight.tsx` — wire `submitRequest` (slice 2c)

**Analog:** `components/buyer/RequestComposer.tsx` (`handleSubmit`, lines 66-98) +
`app/api/buyer/requests/route.ts` (Zod schema, lines 24-38; response shape, lines 191-214)

**Current demo stub to replace** (`CatalogBrowserLight.tsx` lines 186-191):
```typescript
function submitRequest(e: React.FormEvent) {
  e.preventDefault()
  const who = modalRow?.artist ?? 'the artist'
  setModalId(null)
  showToast(`License request sent to ${who}`)
}
```

**Real fetch pattern to copy** (`RequestComposer.tsx` lines 66-98):
```typescript
async function handleSubmit() {
  const validationError = validate()
  if (validationError) { setError(validationError); return }
  setSubmitting(true)
  setError(null)
  try {
    const res = await fetch('/api/buyer/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vault_project_id: project.id,
        track_ids: trackIds,
        usage_types: usageTypes,
        territories,
        term_months: Math.round(Number(termMonths)),
        exclusivity,
        budget_cents: Math.round(Number(budget) * 100),
        need_by: needBy.trim() === '' ? null : needBy,
        buyer_notes: notes.trim() === '' ? null : notes.trim(),
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: string }
    if (!res.ok || !json.data) {
      setError(json.error ?? 'Failed to submit request. Please check your entries and try again.')
      return
    }
    router.push(`/buyers/requests/${json.data.id}`)
  } finally {
    setSubmitting(false)
  }
}
```

**Payload mapping (modal form → `/api/buyer/requests` body):** the route's Zod schema
(`app/api/buyer/requests/route.ts` lines 24-38) is `.strict()` and requires
`vault_project_id`, `track_ids: string[]` (min 1), `usage_types` (enum, from
`USAGE_TYPE_VALUES`), `territories` (enum, from `TERRITORY_VALUES`), `term_months`
(int 1-1200), `exclusivity` (boolean), `budget_cents` (int ≥ 0), optional `need_by`
(`YYYY-MM-DD`), optional `buyer_notes`. The catalogue modal's free-text selects
(`Use type`, `Media`, `Term`, `Territory`, `Exclusivity`, `Offer`, `Message`) do **not**
map 1:1 to this vocabulary — `USE_TYPES`/`MEDIA`/`TERMS`/`TERRITORIES` in
`CatalogBrowserLight.tsx` (lines 59-62) are free display strings, while the route needs
`USAGE_TYPE_VALUES`/`TERRITORY_VALUES` enums from `lib/deals/schema.ts` and an integer
`term_months` + integer `budget_cents` (cents, not a `"$4,500"` string). The plan must
either (a) swap the modal's option lists to import the real enum values/labels from
`lib/deals/schema.ts` (same import as `RequestComposer.tsx` lines 5-12), or (b) add a
mapping layer. Recommend (a) — reuse `USAGE_TYPE_VALUES`/`USAGE_TYPE_LABELS`/
`TERRITORY_VALUES`/`TERRITORY_LABELS` directly so the two forms never drift. `track_ids`
also needs sourcing — the modal currently has no per-track checkbox; default to
`[modalRow.id]`-equivalent is wrong (row id is a project id in the light fixture, not a
track id) — needs a real track id once slice 1.5 data exists, or a track-select field
added to the modal.

**Error handling to copy:** on non-2xx, replace `showToast` success with an inline error
message state (`error` state pattern, `RequestComposer.tsx` line 51, rendered line 235),
not a toast — the existing toast should only fire on the 201 path.

**Response `data.id`** navigates to `/buyers/requests/${id}` in `RequestComposer.tsx`
(line 95); the catalogue modal instead shows the existing success toast + closes modal
(per CONTEXT — modal flow stays, only the network call becomes real) rather than
navigating away from browse.

---

### `lib/deals/catalog-sample.ts` / `lib/deals/catalog.ts` / `lib/deals/catalog-query.ts` — slice 1.5 (GATED)

**Do not implement until `.planning/deliberations/buyer-catalogue-inclusion-model.md`
resolves** (per CONTEXT.md). When unblocked:

**Analog for extending `CatalogCard`:** `lib/deals/catalog.ts` lines 226-237 — the
existing `CatalogCard` type is the single client-safe shape shared by the route and the
server-rendered page. Extend it in place (add `artist`, `energy`, `length`, `mood`,
`vocal`, `instruments`, tri-state `rights`), never a second parallel type — mirrors
`RightsBadge`'s `CatalogRights` in `CatalogBrowserLight.tsx` (line 20) which already
expects `'ok' | 'part' | 'req'`.

**Analog for sourcing the new fields:** `readDescriptors` usage in
`projectMatchesDescriptors` (`lib/deals/catalog.ts` lines 201-214) — `mood`/`energy`/
`vocal` already live in `tracks.metadata`'s descriptors object and are read via
`readDescriptors(t.metadata)` from `lib/metadata/schema.ts`. **No new migration is
needed for mood/energy/vocal** — derive from existing per-track descriptors,
aggregated to project level (e.g., first non-null across tracks, or a plurality/summary
rule — Claude's discretion per CONTEXT). `artist` — check `vault_projects`/
`user_profiles`/`artist_profiles` for an existing display-name column (likely
`user_profiles.display_name` or similar) rather than adding one; do NOT propose a
migration without first confirming no such column exists. `instruments` — check whether
`tracks.metadata` descriptors already carry an instruments field (used by
`MetadataStudio`); if not present, this is a genuine gap requiring either inference
(e.g., from track title/genre — weak) or a migration (human-gated, flag it rather than
silently adding a column). Aggregate `length` sums/uses `tracks[].duration` if that
column exists (check schema) — likely no new column needed.

**Tri-state rights (`ok`/`part`/`req`):** `isRightsReady` (`lib/deals/catalog.ts` lines
33-38) is currently **binary** (returns `boolean`). CONTEXT.md explicitly says "the real
definitions of Partial / Contact-required are undecided" — this is also gated on the
inclusion deliberation. Do not invent a three-way split; keep returning `'ok'` for
rights-ready projects (current fixture default, `catalog-sample.ts` line 42) until the
deliberation resolves.

**Analog for query pagination/filter extension:** `loadCatalogPage`
(`lib/deals/catalog-query.ts` lines 74-158) already has the full pattern for
server-side filtering (batched owner-visibility check lines 101-111, batched block-list
check line 112, batched pre-cleared-terms check lines 116-128, per-project stage3 +
rights-ready gate lines 140-141) — new filter dimensions (mood/energy/vocal/instruments)
slot in next to `projectMatchesKeyBpm`/`projectMatchesDescriptors` calls (lines 143-144)
using the same any-track-matches predicate style. `app/api/buyer/catalog/route.ts`
(lines 34-44) is the analog for accepting the new query params — extend
`buildCatalogFilter`'s `RawCatalogParams`/`CatalogFilter` (`lib/deals/catalog.ts` lines
80-102) with the new fields, following the same `typeof params.x === 'string' &&
X_VALUES.includes(...)` allowlist-validation pattern (lines 111-129) — never trust raw
query strings directly.

**Rows source flip:** once live rows carry the new fields,
`app/(buyer-portal)/buyers/catalog/page.tsx` line 40's fallback
(`liveRows.length > 0 ? liveRows : SAMPLE_CATALOG_ROWS`) can be tightened or the fixture
retired for the demo/empty-catalog case only.

---

### `components/buyer/ShortlistPanel.tsx` / `components/buyer/OrgRequestDashboard.tsx` — re-theme light

**Analog:** `components/buyer/CatalogBrowserLight.tsx` CSS token block (lines 403-404)
and component patterns throughout.

**Current dark styling to replace** (`ShortlistPanel.tsx` line 40, representative):
```typescript
<div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
```
Both files use the dark-shell utility classes (`border-white/10`, `bg-white/[0.03]`,
`text-white`, `text-white/50` etc.) throughout — every one of these needs a light
equivalent. `CatalogBrowserLight.tsx` does NOT use Tailwind utility classes for its
surface — it uses a scoped `<style>` block with CSS custom properties under `.fnbl`
(lines 403-572). Per CONTEXT.md ("Claude's Discretion: how the light theme is
delivered"), the two options are:
1. Wrap `ShortlistPanel`/`OrgRequestDashboard` output in the same `.fnbl` scope and
   reuse `CatalogBrowserLight`'s existing CSS vars/classes (`--wash`, `--line`, `--ink`,
   `.rights` badge classes at lines 502-506, `.chip` at line 463) — most consistent with
   the canonical light design, avoids a second design system.
2. Add light Tailwind utility variants (`bg-[#F1EDFE]`, `text-[#241A4D]` etc.) — closer
   to the rest of the codebase's Tailwind-first convention but duplicates the token
   values already defined in `CatalogBrowserLight.tsx`'s `CSS` string.
Recommend option 1 for visual fidelity — reuse `.fnbl` var names, e.g. swap
`border-white/10 bg-white/[0.03]` → an `.fnbl`-scoped class using `var(--line)`/
`var(--wash)`.

**Status-badge analog:** `OrgRequestDashboard.tsx`'s `STAGE_STYLES` map (lines 41-48,
dark-tinted borders/backgrounds per stage) is the same shape as `CatalogBrowserLight`'s
`RightsBadge` (lines 107-114) and its `.rights.ok/.part/.req` CSS (lines 502-506) — reuse
that 3-tone (ok/part/req-style) palette approach for stage pills, remapped to light
`--ok-fg/--ok-bg/--ok-line` etc. tokens already defined in the `.fnbl` CSS var block.

**Chip pattern for `ShortlistPanel`'s "No longer rights-ready" badge** (line 71-75):
maps directly to `.fnbl .rights.req` (amber/rose token family, lines 502-506).

---

### `app/(buyer-portal)/layout.tsx` + `components/buyer/BuyerPortalNav.tsx` — dark toggle + top-nav reconciliation

**Analog (auth/session gate — keep unchanged):** `app/(buyer-portal)/layout.tsx` itself,
lines 16-42 — the `getUser()` → `app_metadata.role === 'buyer'` → `buyer_members` row
check → redirect-to-`/buyers/access` chain is the exact pattern to preserve; do not
touch this gate when adding theme logic, only wrap the returned JSX.

**Dark-token source (for the toggle target):** `tailwind.config.ts` lines 10-21 — the
artist-side dark tokens (`ink: '#0a0a0f'`, `card: '#0E0D1E'`, `lav: '#C7CBF7'`,
`lavdim: '#7c80b4'`, `hair`/`hairstrong`, `grad` gradient) are the existing dark palette
already used by `BuyerPortalNav.tsx` today (`bg-ink`, `text-lavdim`, `border-white/10`
lines 20-24 of layout, `BuyerPortalNav.tsx` lines 20-23). These are exactly the "dark
buyer-portal tokens" CONTEXT.md refers to as the toggle target — no new dark palette
needed, just needs to become conditional rather than the unconditional default.

**Reconciliation problem to flag for the planner:** `app/(buyer-portal)/layout.tsx`
(lines 44-51) renders `<BuyerPortalNav>` as a persistent left sidebar (`w-56 shrink-0`)
for every route in the group, but `CatalogBrowserLight.tsx` renders its OWN top nav
header (lines 209-219, `<header className="top">` with Browse/Login/cart/burger) scoped
inside `.fnbl`. On `/buyers/catalog` today this means the sidebar nav AND the
catalogue's own top nav both render — CONTEXT.md's "reconciling the 16-03 portal shell
with the catalogue's own top-nav" names this exact double-nav problem. No existing file
resolves it; the planner must decide (Claude's discretion, CONTEXT.md line 71) one of:
(a) make `CatalogBrowserLight`'s header the canonical top-nav across all buyer-portal
pages and retire `BuyerPortalNav`'s sidebar, remapping its 3 links (Catalog/Shortlists/
Requests, lines 28-45) into the light header's nav slot; or (b) keep
`BuyerPortalNav` as sidebar and suppress/hide `CatalogBrowserLight`'s internal header
when rendered inside the portal shell (e.g. an `embedded` prop, similar to the existing
`isPublic` prop pattern at line 123 and the conditional Login link at line 212).
Given the sample public route is `isPublic` and unauthenticated (no sidebar), option
(a) — promote the catalogue header, add a dark-toggle control and the Shortlists/
Requests links into it, drop the sidebar for logged-in buyers — is more consistent
with "the light theme system as a platform convention" language in CONTEXT.md.

**Persist-per-buyer toggle:** no existing per-user preference-storage pattern was found
in `lib/buyers/`; closest analog is `buyer_members`/`buyer_orgs` row shape queried in
`layout.tsx` (lines 30-41) — a `theme_preference` column would need a migration
(human-gated) OR use a client-side-only persistence (localStorage / cookie) to avoid a
migration. Recommend cookie-based (readable server-side in the layout, matches the
Supabase-cookie-session convention already used for auth) over localStorage, since the
layout is a server component and needs the value on first render to avoid a flash.

## Shared Patterns

### Light-theme token source (already built — reuse verbatim)
**Source:** `components/buyer/CatalogBrowserLight.tsx` lines 403-404 (the `.fnbl` CSS
custom-property block)
**Apply to:** `ShortlistPanel.tsx`, `OrgRequestDashboard.tsx`, `BuyerPortalNav.tsx`,
`app/(buyer-portal)/layout.tsx` — every re-themed buyer surface should reference these
same var names (`--page`, `--ink`, `--wash`, `--line`, `--indigo`, `--fuchsia`, `--grad`,
`--ok-fg/bg/line`, `--part-fg/bg/line`, `--req-fg/bg/line`) rather than inventing new hex
values, so a future palette tweak stays single-sourced.

### Dark-theme token source (toggle target — already exists, currently default)
**Source:** `tailwind.config.ts` lines 10-21
**Apply to:** the dark-toggle variant of every re-themed surface, and unchanged for the
artist side.

### Structured POST request pattern (client component → API route)
**Source:** `components/buyer/RequestComposer.tsx` lines 66-98 (fetch + error state) +
`app/api/buyer/requests/route.ts` lines 24-38, 49-77 (Zod `.strict()` schema, auth via
`createApiClient()` + `buyer_members` membership check, service-role write via
`createServiceClient()`)
**Apply to:** `CatalogBrowserLight.tsx`'s `submitRequest` (slice 2c) — this is the ONLY
correct way to reach `license_requests`; do not add a second insert path.

### Server-side auth gate (buyer portal)
**Source:** `app/(buyer-portal)/layout.tsx` lines 16-42
**Apply to:** unchanged, wraps every buyer-portal page including the re-themed ones.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Dark-toggle persistence mechanism (cookie/localStorage read+write) | utility | event-driven | No existing per-buyer preference-storage pattern in `lib/buyers/`; needs a new small utility, informed by the Supabase-cookie-session convention as the closest sibling pattern (not a direct analog). |
| Real preview audio (playback source URL) | service / storage | streaming | Explicitly out of scope this phase (CONTEXT.md); `lib/storage/index.ts`'s signed-URL pattern (used for `track-audio` bucket) is the eventual analog when this is picked up, but no target file exists yet. |

## Metadata

**Analog search scope:** `components/buyer/`, `app/(buyer-portal)/`, `app/api/buyer/`,
`lib/deals/`, `tailwind.config.ts`
**Files scanned:** 12 (all read in full; largest was 572 lines, no file exceeded the
2,000-line large-file threshold)
**Pattern extraction date:** 2026-08-04
