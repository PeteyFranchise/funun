# Phase 22: Buyer Catalogue & Light-Theme Buyer UI - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning
**Source:** owner direction + Claude Design hi-fi handoff; partially built (slices 1/2a/2b) on `feat/buyer-catalogue-light`

<domain>
## Phase Boundary

Recreate the buyer **Browse Catalogue** pixel-faithfully from Claude Design's hi-fi
handoff, and establish the **light-theme buyer UI** as a platform convention (buyer
side = light/white, artist side = dark). This is a redesign of Phase 16's basic
catalogue (16-05) into the real, designed buyer browse surface, plus the buyer-side
light theme the rest of the buyer portal will adopt.

**In scope:** the light Browse Catalogue (faithful layout, working filter/search/sort,
audio player, License request flow), the light theme system, a dark-theme toggle for
logged-in buyers, wiring the License request into the real deals pipeline, live-data
wiring (gated on the inclusion deliberation), and re-theming the other buyer surfaces
(request composer/dashboard, shortlists, org dashboard) to light + reconciling the
16-03 portal shell with the catalogue's own top-nav.

**Out of scope / deferred:** the buyer-catalogue **inclusion model** — which Sound Vault
songs reach the catalogue, by what process (see deliberation). Real preview audio
(needs preview URLs). Logo adoption is a small parallel decision.
</domain>

<decisions>
## Implementation Decisions

### Theme
- **Buyer side = LIGHT/white; artist side = DARK.** A deliberate split so the two sides
  of the platform read as distinct (owner, 2026-08-03).
- **Light is the default** — public browse AND the logged-in default. Logged-in buyers get
  an **option to toggle to dark** (owner). Both of Claude Design's buyer themes are used:
  the light tokens as default, the dark buyer-portal tokens as the toggle.

### Design source (canonical)
- Claude Design hi-fi handoff: `mockups/buyer-catalogue.html` + `mockups/buyer-catalogue (dark v1).html`
  + `app.css` + `FUNUN Buyer Catalogue - Mobile & States.html` + `FUNUN Logo Exploration.html`
  (external, at `~/Desktop/Fununbuyerbrowse/`). Recreate faithfully, not ship-as-is.
- In-repo canonical light design is now `components/buyer/CatalogBrowserLight.tsx` — Claude
  Design's CSS ported scoped under `.fnbl` so it never leaks into the dark app shell.
- Light tokens: `--page #FFFFFF`, `--ink #241A4D`, lavender washes `--wash #F1EDFE`,
  gradient `#6D5AE0 → #B22BC9`, Inter. Tri-state rights: **Rights ready** (green `#0B7A57`),
  **Partial** (amber `#8A5B04`), **Contact required** (rose `#A62742`).

### Rights + inclusion
- The catalogue shows a **tri-state rights badge** (Rights ready / Partial / Contact required).
  The live model only computes binary rights-ready today; the real definitions of Partial /
  Contact-required are undecided — see the inclusion deliberation.
- **Catalogue inclusion model is DEFERRED** — which Sound Vault songs reach buyers, and by what
  workflow, is an open decision. Do NOT wire live catalogue data (slice 1.5) until it resolves.
  Canonical: `.planning/deliberations/buyer-catalogue-inclusion-model.md`.

### Already built (slices 1/2a/2b — on `feat/buyer-catalogue-light`)
- **Slice 1** — faithful light Browse Catalogue: top nav, tab bar, search + All scope, filter
  pills, results table (cover · versions · genres · dynamics glyph · energy · length · tri-state
  rights · License), real album art (`public/buyer-catalogue/`), Inter.
- **Slice 2a** — working browse: filter dropdowns open + multi-select + narrow results,
  search (title+artist), Sort-by, active chips + remove/clear-all, live count + "N filters
  active", empty state. Client-side over `rows`.
- **Slice 2b** — experience: sticky audio player (simulated playhead — no preview audio yet)
  + License request modal (structured form → success toast).
- Renders a representative fixture (`lib/deals/catalog-sample.ts`) because the live query lacks
  artist/energy/length/mood/vocal/instruments/tri-state-rights.

### Claude's Discretion
- How the light theme is delivered (scoped `<style>` vs CSS module vs Tailwind layer) and the
  dark-toggle mechanism.
- Component decomposition; how the catalogue's top-nav reconciles with the 16-03 portal shell.
- Whether the built slices are formalized as completed plans or re-planned.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design
- `~/Desktop/Fununbuyerbrowse/mockups/buyer-catalogue.html` — the light Browse Catalogue (source).
- `~/Desktop/Fununbuyerbrowse/mockups/buyer-catalogue (dark v1).html` — the dark buyer portal (toggle target).
- `~/Desktop/Fununbuyerbrowse/FUNUN Buyer Catalogue - Mobile & States.html` — mobile + states.
- `~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html` — 5 wordmark options (logo decision).
- `components/buyer/CatalogBrowserLight.tsx` — the in-repo ported light design (canonical).

### Existing buyer-portal code to build on / re-theme (Phase 16)
- `app/(buyer-portal)/buyers/catalog/page.tsx` + `lib/deals/catalog.ts` + `lib/deals/catalog-query.ts`
  + `app/api/buyer/catalog/route.ts` — catalogue data/query/API (16-05).
- `components/buyer/RequestComposer.tsx` + `app/api/buyer/requests/route.ts` — the real request pipeline (16-06).
- `components/buyer/ShortlistPanel.tsx` (16-05), `components/buyer/OrgRequestDashboard.tsx` (16-06).
- `app/(buyer-portal)/layout.tsx` + `components/buyer/BuyerPortalNav.tsx` — the portal shell (16-03).

### Deferred decision
- `.planning/deliberations/buyer-catalogue-inclusion-model.md` — gates live-data wiring.
</canonical_refs>

<specifics>
## Specific Ideas
- Slice 2c: wire License **Send** → `POST /api/buyer/requests` (16-06) with the real project id + auth,
  so a request actually creates a deal (replacing the demo toast).
- Slice 1.5: enrich the catalog query (artist, energy, aggregate length, mood, vocal, instruments,
  tri-state rights) + move filtering/pagination server-side via `/api/buyer/catalog`. GATED on the
  inclusion deliberation.
- Dark toggle: port Claude Design's dark buyer-portal tokens as a second theme; persist per-buyer.
- Re-theme the other buyer surfaces light + reconcile the catalogue top-nav with the 16-03 shell.
- Real preview audio (needs preview URLs / storage) — replaces the simulated playhead.
</specifics>

<deferred>
## Deferred Ideas
- The catalogue **inclusion model** (auto vs opt-in, curation, Partial/Contact definitions, the
  `catalog_listing` data model) — separate deliberation; blocks slice 1.5.
- Logo adoption (pick one of the 5 wordmark explorations) — small parallel decision.
- Similarity Search / Playlists tabs (present in the design as tabs, not yet built).
</deferred>

---

*Phase: 22-buyer-catalogue-light-ui*
*Context gathered: 2026-08-04 — owner direction + Claude Design handoff + built slices 1/2a/2b*
