---
phase: 22-buyer-catalogue-light-ui
plan: 03
subsystem: buyer-portal-ui
tags: [theme, nav-reconciliation, buyer-portal, fnbl]
dependency-graph:
  requires: ["22-02"]
  provides: [nav-reconciliation, theme-light-buyer, dark-toggle]
  affects: ["22-04", "22-05"]
tech-stack:
  added: []
  patterns:
    - "Single-sourced .fnbl token CSS (FNBL_CSS) injected once by the layout, with a [data-theme=\"dark\"] attribute-selector override that wins by specificity regardless of injection order"
    - "Per-buyer theme persisted via a plain client-writable cookie, coerced server-side (readBuyerTheme: anything but literal 'dark' -> 'light')"
    - "Component-owns-its-own-CSS: BuyerTopNav ships its own scoped <style> for nav-only classes (.top/.navlink/brandmark) since it renders on every buyer-portal route, not just the catalogue"
key-files:
  created:
    - components/buyer/fnbl-theme.ts
    - lib/buyers/theme.ts
    - components/buyer/BuyerTopNav.tsx
    - components/buyer/ThemeToggle.tsx
  modified:
    - "app/(buyer-portal)/layout.tsx"
    - components/buyer/CatalogBrowserLight.tsx
    - "app/(buyer-portal)/buyers/catalog/page.tsx"
  deleted:
    - components/buyer/BuyerPortalNav.tsx
decisions:
  - "Dark ink family (--ink/--ink-2/--ink-3) uses lavender tones (lav #C7CBF7, lavdim #7c80b4, and a lower-opacity rgba(199,203,247,.55) for the third tier) rather than plain white for primary text, per the plan's explicit fallback instruction -- distinct from the artist dark theme's white-primary convention"
  - "--wash-2 (dark) derived as rgba(199,203,247,.10), following the same opacity-of-lav pattern already established by tailwind.config.ts's hair/hairstrong tokens, since neither the mockup nor tailwind.config.ts specifies a second raised-surface tier"
  - "BuyerTopNav carries its own scoped nav CSS (duplicated from CatalogBrowserLight's original .top/.navlink/brandmark rules) rather than folding those into FNBL_CSS -- FNBL_CSS stays tokens-only per the plan, and the nav renders on shortlists/requests pages where CatalogBrowserLight never mounts"
metrics:
  duration: 25min
  completed: 2026-08-04
status: complete
---

# Phase 22 Plan 03: Buyer UI Shell (Light Theme + Nav Reconciliation) Summary

Promoted the catalogue's light top-nav into a shared `BuyerTopNav`, retired the dark
`BuyerPortalNav` sidebar (Option A nav reconciliation), re-shelled the buyer-portal layout to
the light `.fnbl` system, and added a per-buyer dark-theme toggle that defaults to light and
persists via a server-read cookie with no flash.

## What Was Built

**`components/buyer/fnbl-theme.ts`** — `FNBL_CSS`: the single-sourced `.fnbl` base token block
(lifted verbatim from `CatalogBrowserLight`'s original CSS constant) plus the three shared base
rules (`.fnbl *`, `.fnbl .icn`, `.fnbl .gtext`), followed by a `.fnbl[data-theme="dark"]`
override that re-declares every custom-property name with Claude Design's dark buyer palette
(ported from `mockups/buyer-catalogue (dark v1).html` + `app.css`, falling back to
`tailwind.config.ts`'s artist dark tokens for anything the mockup didn't specify). The attribute
selector wins on specificity, so toggling `data-theme` alone re-themes every surface that
references the tokens.

**`lib/buyers/theme.ts`** — `BUYER_THEME_COOKIE = 'fnbl_theme'` and `readBuyerTheme()`, which
returns `'dark'` only for an explicit `'dark'` cookie value; every other input (including
`undefined`, `null`, garbage, or a tampered value) resolves to `'light'`.

**`components/buyer/BuyerTopNav.tsx`** — the shared top-nav, promoted from
`CatalogBrowserLight`'s `.top`/`.navlink`/brandmark idiom. Renders Browse (`/buyers/catalog`),
Shortlists (`/buyers/shortlists`), and Requests (`/buyers/requests`) as real `next/link`s, the
FUNŪN brandmark, the caller's company name + `BUYER_ROLE_LABELS[buyerRole]` tier (with
`· Org admin` when applicable — the same fields the retired sidebar showed), and mounts
`ThemeToggle`. Ships its own scoped nav-only CSS (`.top`/`.navlink`/`.brandmark`/`.org`/
`.themetoggle`) since it renders on every buyer-portal route, not just the catalogue.

**`components/buyer/ThemeToggle.tsx`** — a `'use client'` control seeded from the server-read
`theme` prop. On click it writes `BUYER_THEME_COOKIE` (`path=/`, 1-year max-age) so the next
server render picks it up, and sets `data-theme` directly on `document.querySelector('.fnbl')`
so the switch is instant on the current page without a reload.

**`app/(buyer-portal)/layout.tsx`** — re-shelled from the dark `bg-ink text-white` flex+sidebar
return to `<div className="fnbl" data-theme={theme}>` that injects `FNBL_CSS` once, mounts
`BuyerTopNav`, then renders `{children}`. The `theme` value comes from
`readBuyerTheme((await cookies()).get(BUYER_THEME_COOKIE)?.value)`. The
`getUser()` → `app_metadata.role === 'buyer'` → `buyer_members` row → redirect chain is
byte-for-byte unchanged — only the returned JSX changed.

**`components/buyer/CatalogBrowserLight.tsx`** — gained an `embedded?: boolean` prop (defaults
`false`). When `embedded`, the component renders neither its own `<header className="top">` nor
`FNBL_CSS` (the layout already provides both); it still injects its own remaining
catalogue-specific CSS (`.wrap`, `.tabs`, `.searchrow`, `.filters`, `.trow`, `.mini`, `.modal`,
…) since that styles the browse content regardless of embedding. The non-embedded branch (the
currently-unused `isPublic` path) stays fully self-contained, injecting `FNBL_CSS` + its own CSS
and drawing its own header exactly as before.

**`app/(buyer-portal)/buyers/catalog/page.tsx`** — now renders
`<CatalogBrowserLight rows={rows} embedded />`, eliminating the double-nav (the layout's
`BuyerTopNav` is the only top-nav on the catalogue page).

**`components/buyer/BuyerPortalNav.tsx`** — deleted. Grepped first to confirm the layout was
its only importer; no other reference existed.

## Deviations from Plan

None — plan executed as written. The dark-token value choices for `--ink`/`--ink-2`/`--ink-3`
and `--wash-2` (not literally spelled out in the plan beyond "lavender text" / "a raised --wash
from card2") were derived from the mockup's own lav/lavdim palette and the existing
hair/hairstrong opacity-of-lav pattern already established in `tailwind.config.ts` — recorded
above under Decisions, not a deviation from the plan's letter.

## Verification

- `npx tsc --noEmit` — clean, run after each task.
- `npx jest lib/deals/request-payload.test.ts` — 17/17 passed (22-02 wiring undisturbed).
- `npx next lint` — no warnings or errors.
- `npx next build` — succeeded; `/buyers/catalog`, `/buyers/access`, `/buyers/shortlists`,
  `/buyers/requests`, `/buyers/requests/[id]`, `/buyers/requests/new` all compile.
- Grep gates (per task, see PLAN.md `<verify>` blocks): `FNBL_CSS`/`data-theme="dark"`/
  `BUYER_THEME_COOKIE`/`readBuyerTheme` exports present; `BuyerTopNav` mounted with both
  `/buyers/shortlists` and `/buyers/requests` links; `ThemeToggle` is `'use client'` and
  references `BUYER_THEME_COOKIE`; the layout mounts `BuyerTopNav`, sets `data-theme`, keeps
  `buyer_members`, and has zero remaining `BuyerPortalNav` references; the catalog page passes
  `embedded`.

## Known Follow-on (not a stub introduced here)

Plan 22-04 (already drafted, `depends_on: ["22-03"]`) re-themes the remaining buyer surfaces —
`ShortlistPanel`, `OrgRequestDashboard`, `RequestComposer`, and their pages — which still carry
dark Tailwind classes (`text-white`, `border-white/10`, etc.) inherited from the old `bg-ink`
shell. Until 22-04 lands, those pages render inside the new light `.fnbl` wrapper but their own
content classes assume a dark background, so they read poorly (white-on-white) until re-themed.
This is the explicitly scoped boundary between 22-03 (shell + nav + theme foundation) and 22-04
(inner-surface re-theme), not an omission of this plan.

## Self-Check: PASSED

- FOUND: components/buyer/fnbl-theme.ts
- FOUND: lib/buyers/theme.ts
- FOUND: components/buyer/BuyerTopNav.tsx
- FOUND: components/buyer/ThemeToggle.tsx
- FOUND: app/(buyer-portal)/layout.tsx (modified)
- FOUND: components/buyer/CatalogBrowserLight.tsx (modified)
- FOUND: app/(buyer-portal)/buyers/catalog/page.tsx (modified)
- MISSING (expected — deleted by design): components/buyer/BuyerPortalNav.tsx
- FOUND commit 2e86b1e (Task 1: theme foundation)
- FOUND commit 6749c58 (Task 2: BuyerTopNav + ThemeToggle)
- FOUND commit 57d6bde (Task 3: layout re-shell + embedded catalogue + sidebar retirement)
