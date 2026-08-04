---
phase: 22-buyer-catalogue-light-ui
plan: 04
subsystem: ui
tags: [tailwind, css-custom-properties, buyer-portal, fnbl, dark-mode]

# Dependency graph
requires:
  - phase: 22-buyer-catalogue-light-ui
    provides: "FNBL_CSS token system (fnbl-theme.ts), the light .fnbl[data-theme] shell, and BuyerTopNav (22-03)"
provides:
  - "ShortlistPanel + shortlists page re-themed to light FNBL tokens"
  - "OrgRequestDashboard + requests list + request detail re-themed to light FNBL tokens, with stage/filter badges remapped to token families"
  - "RequestComposer + new-request page re-themed to light FNBL tokens"
affects: ["22-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tailwind arbitrary-value classes referencing FNBL custom properties (e.g. text-[color:var(--ink)], bg-[var(--wash)], border-[color:var(--line)]) instead of hardcoded Tailwind color utilities — keeps each file Tailwind-first while single-sourcing the palette in fnbl-theme.ts so the 22-03 dark toggle re-themes these surfaces for free"
    - "Status/stage badges mapped onto the --ok-*/--part-*/--req-* token families instead of raw amber/emerald/fuchsia Tailwind utilities"

key-files:
  created: []
  modified:
    - components/buyer/ShortlistPanel.tsx
    - "app/(buyer-portal)/buyers/shortlists/page.tsx"
    - components/buyer/OrgRequestDashboard.tsx
    - "app/(buyer-portal)/buyers/requests/page.tsx"
    - "app/(buyer-portal)/buyers/requests/[id]/page.tsx"
    - components/buyer/RequestComposer.tsx
    - "app/(buyer-portal)/buyers/requests/new/page.tsx"

key-decisions:
  - "Indigo-accent CTA/badge pills (e.g. 'Request license', 'New request', selected filter chips) use border-[color:var(--line)] bg-[var(--wash-2)] text-[color:var(--indigo)] hover:bg-[var(--wash)] — matching CatalogBrowserLight's own .lic/.chip idiom (border:var(--line); background:var(--wash); color:var(--indigo)) rather than inventing a new indigo-tinted surface"
  - "contract-stage badge uses border-[color:var(--line)] bg-[var(--wash)] text-[color:var(--fuchsia)] since FNBL_CSS has no dedicated --fuchsia-bg/--fuchsia-line token family — only the accent color changes, background/border stay neutral wash/line"
  - "terms_agreed-stage badge uses the same neutral wash/line surface with text-[color:var(--indigo)] for the same reason (no dedicated indigo-bg/indigo-line family exists in FNBL_CSS)"

patterns-established:
  - "Text hierarchy: primary -> var(--ink), secondary -> var(--ink-2), muted/labels -> var(--ink-3)"
  - "Card surfaces: bg-[var(--wash)] with border-[color:var(--line)]; raised/hover surfaces use --wash-2/--line-2"
  - "Form inputs: bg-white border-[color:var(--line-2)] with focus:border-[color:var(--indigo)]"
  - "Error text: text-[color:var(--req-fg)]"

requirements-completed: [retheme-surfaces, theme-light-buyer]

coverage:
  - id: D1
    description: "Org shortlist surface (ShortlistPanel + shortlists page) renders token-driven light classes; stale-entry badge uses the req token family"
    requirement: "retheme-surfaces"
    verification:
      - kind: other
        ref: "grep -c 'var(--' components/buyer/ShortlistPanel.tsx (11), grep -c 'var(--' app/(buyer-portal)/buyers/shortlists/page.tsx (3); npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual correctness (readable on white, clean dark-toggle flip) requires a human to view the rendered page — grep/tsc only prove token usage and type safety, not visual quality."
  - id: D2
    description: "Org request dashboard, requests list, and request detail render light with stage/filter badges remapped to ok/part/req/neutral token families; LICENSE_REQUEST_COLUMNS allowlist and org-scoped queries preserved"
    requirement: "retheme-surfaces"
    verification:
      - kind: other
        ref: "grep -c 'var(--' on all three files + grep -c 'LICENSE_REQUEST_COLUMNS' requests/page.tsx (>=1); npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual correctness of the stage-badge color mapping and dark-toggle behavior requires human eyes; automated grep only proves the allowlist/query gates and token references survived."
  - id: D3
    description: "Request composer and new-request page render light; validate()/handleSubmit()/POST body and authorizeRequestTarget gate preserved"
    requirement: "theme-light-buyer"
    verification:
      - kind: other
        ref: "grep -c 'var(--' on both files + grep -c 'authorizeRequestTarget' new/page.tsx (>=1); npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Form usability and dark-toggle behavior in a real browser requires human verification; grep/tsc only prove the security gate and token usage survived the edit."

duration: 20min
completed: 2026-08-04
status: complete
---

# Phase 22 Plan 04: Buyer Surfaces Re-theme (Shortlist, Requests, Composer) Summary

Re-themed the org shortlist, org request dashboard/list/detail, and the guided request composer
(plus their pages) from dark `bg-white/[0.03]` / `text-white` / `border-white/10` Tailwind
classes to Tailwind arbitrary-value classes referencing the FNBL custom properties established
in 22-03, so all seven surfaces read correctly on the light `.fnbl` shell and re-theme
automatically with the per-buyer dark toggle.

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-04
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- ShortlistPanel + shortlists page: card surfaces, text hierarchy, and the "No longer
  rights-ready" badge (remapped from amber to the `--req-*` family) are all token-driven.
- OrgRequestDashboard + requests list + request detail: `STAGE_STYLES` remapped to light token
  families (submitted → neutral wash/`--ink-3`, in_negotiation → `--part-*`, terms_agreed →
  `--indigo` on neutral wash, contract → `--fuchsia` on neutral wash, closed_won → `--ok-*`,
  closed_lost → muted `--ink-3`); `FILTER_CHIP_ON`/`OFF` remapped to a light selected/idle pair.
  `LICENSE_REQUEST_COLUMNS`, the `.eq('buyer_org_id', …)` scoping, and `notFound()` are
  byte-for-byte unchanged.
- RequestComposer + new-request page: `CHIP_ON`/`OFF` remapped to an indigo-accent
  selected/idle pair; inputs moved from `bg-black/20 border-white/15` to
  `bg-white border-[color:var(--line-2)]` with an indigo focus ring; the validation error uses
  the `--req-fg` token. `validate()`/`handleSubmit()`/the POST body and the
  `authorizeRequestTarget` gate are untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Re-theme the org shortlist surface** - `656cd79` (feat)
2. **Task 2: Re-theme the org request dashboard, list, and detail** - `ebb359e` (feat)
3. **Task 3: Re-theme the request composer + new-request page** - `d6f752a` (feat)

**Plan metadata:** commit created after this summary (docs: complete plan)

## Files Created/Modified
- `components/buyer/ShortlistPanel.tsx` - Token-driven light card surfaces, text hierarchy, and stale-entry badge on the req family
- `app/(buyer-portal)/buyers/shortlists/page.tsx` - Light heading/description classes
- `components/buyer/OrgRequestDashboard.tsx` - `STAGE_STYLES`/`FILTER_CHIP_*` remapped to token families; card/text classes token-driven
- `app/(buyer-portal)/buyers/requests/page.tsx` - Light heading + "New request" CTA; `LICENSE_REQUEST_COLUMNS` + query logic unchanged
- `app/(buyer-portal)/buyers/requests/[id]/page.tsx` - Light detail card + stage badge; org-scoped query + `notFound()` unchanged
- `components/buyer/RequestComposer.tsx` - `CHIP_ON`/`OFF`, inputs, labels, and error text token-driven; form logic unchanged
- `app/(buyer-portal)/buyers/requests/new/page.tsx` - Light heading/empty-state/link; `authorizeRequestTarget` gate unchanged

## Decisions Made
- Indigo-accent CTA/badge pills use `border-[color:var(--line)] bg-[var(--wash-2)] text-[color:var(--indigo)] hover:bg-[var(--wash)]`, matching CatalogBrowserLight's own `.lic`/`.chip` idiom rather than inventing a new indigo-tinted surface not present in FNBL_CSS.
- The `terms_agreed` and `contract` deal-stage badges use the neutral wash/line surface with only the accent text color changed (`--indigo` and `--fuchsia` respectively), since FNBL_CSS defines no dedicated indigo-bg/indigo-line or fuchsia-bg/fuchsia-line token families — only the `--ok-*`/`--part-*`/`--req-*` families have full bg/line/fg triples.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All seven buyer-portal surfaces named in `.planning/phases/22-buyer-catalogue-light-ui/` are now
token-driven and dark-toggle-reactive. `npx tsc --noEmit`, `npx next lint`, and `npx next build`
all pass clean; the build output confirms `/buyers/shortlists`, `/buyers/requests`,
`/buyers/requests/[id]`, `/buyers/requests/new`, and `/buyers/catalog` all compile. Remaining
verification is the plan's UAT step (human-verify: confirm each surface renders correctly light
AND flips cleanly with the 22-03 dark toggle) — no code blockers for 22-05.

---
*Phase: 22-buyer-catalogue-light-ui*
*Completed: 2026-08-04*

## Self-Check: PASSED

- FOUND: components/buyer/ShortlistPanel.tsx
- FOUND: app/(buyer-portal)/buyers/shortlists/page.tsx
- FOUND: components/buyer/OrgRequestDashboard.tsx
- FOUND: app/(buyer-portal)/buyers/requests/page.tsx
- FOUND: app/(buyer-portal)/buyers/requests/[id]/page.tsx
- FOUND: components/buyer/RequestComposer.tsx
- FOUND: app/(buyer-portal)/buyers/requests/new/page.tsx
- FOUND commit 656cd79 (Task 1: org shortlist re-theme)
- FOUND commit ebb359e (Task 2: org request dashboard/list/detail re-theme)
- FOUND commit d6f752a (Task 3: request composer + new-request page re-theme)
