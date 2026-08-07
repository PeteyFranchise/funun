---
phase: 25-funun-team-accounts-ae
plan: 08
subsystem: team-console-theme
tags: [theme, admin, nextjs, tailwind, css-tokens, sidebar]

requires:
  - phase: 25-funun-team-accounts-ae (25-06)
    provides: "app/(admin)/layout.tsx shell (getStaffRole gate + role-aware sidebar), StaffAdmin.tsx, MyCompanies.tsx"
provides:
  - "lib/admin/theme.ts -- ADMIN_THEME_COOKIE + readAdminTheme (dark default)"
  - "components/admin/AdminThemeToggle.tsx -- per-member light/dark toggle, no reload"
  - "components/admin/console-theme.ts -- ADMIN_CONSOLE_CSS (.fncon dark base + light override)"
  - "app/(admin)/layout.tsx themed .fncon wrapper -- SSR data-theme, no flash"
affects: [25-09, 25-10]

tech-stack:
  added: []
  patterns:
    - "Team Console tokens are Tailwind arbitrary-value classes (text-[color:var(--ink)], bg-[color:var(--panel)]) exactly mirroring the buyer-portal retheme (22-03/22-04) convention -- no new CSS-in-JS library"
    - "One shared 'fncon-cta' scoped class carries the brand gradient CTA background (mirrors buyer components' 'background:var(--grad)' scoped-CSS convention over an unverified Tailwind bg-[image:] arbitrary syntax)"

key-files:
  created:
    - "lib/admin/theme.ts"
    - "components/admin/AdminThemeToggle.tsx"
    - "components/admin/console-theme.ts"
  modified:
    - "app/(admin)/layout.tsx"
    - "components/admin/StaffAdmin.tsx"
    - "components/admin/MyCompanies.tsx"
    - "app/(admin)/admin/team-members/page.tsx"
    - "app/(admin)/admin/my-client-partners/page.tsx"

key-decisions:
  - "Console token names (--ground/--panel/--panel-2/--ink/--ink-2/--ink-3/--border/--border-2/--indigo/--fuchsia/--grad/--green-*/--amber-*/--rose-*) are direct 1:1 lifts of the exact hex/rgba values already rendered today by bg-ink/card/card2/text-white/lav/lavdim/border-white-10/22 and FNBL_CSS's light overrides -- zero new colors invented, verified against tailwind.config.ts and fnbl-theme.ts"
  - "SignOutButton.tsx (shared with ArtistNav) left unmodified -- wrapped in a scoped '[&>button]:text-[color:var(--ink-3)]' Tailwind arbitrary-child-selector override inside the admin layout only, so the shared component needs no change and ArtistNav's dark theme is unaffected"
  - "team-members/page.tsx and my-client-partners/page.tsx h1 headline color tokenized (Rule 2) even though not in this plan's declared files_modified -- the plan's own must_haves truth requires these two routes to 'render correctly in both themes,' and the hardcoded text-white h1 was unreadable against a light .fncon ground"

requirements-completed: [TEAM-08]

coverage:
  - id: D1
    description: "readAdminTheme(value) returns 'light' | 'dark', defaults to 'dark', mirrors readBuyerTheme's shape"
    requirement: "TEAM-08"
    verification:
      - kind: other
        ref: "Manual code read -- readAdminTheme returns 'light' only on exact match, else 'dark' (strict allowlist, T-25-13); npx tsc --noEmit clean"
        status: pass
    human_judgment: false
  - id: D2
    description: "AdminThemeToggle flips ADMIN_THEME_COOKIE and the .fncon data-theme attribute on click, no reload"
    requirement: "TEAM-08"
    verification:
      - kind: other
        ref: "Manual code read -- toggle() sets document.cookie + querySelector('.fncon').setAttribute('data-theme', next), mirrors components/buyer/ThemeToggle.tsx line-for-line"
        status: pass
    human_judgment: true
    rationale: "No browser/DOM test harness in this repo (jest testEnvironment: node) -- the click-flip-no-reload behavior requires a live browser session, deferred to a dev-run/visual check per the plan's own <verification> section (Manual/visual bullet)."
  - id: D3
    description: "app/(admin)/layout.tsx reads the cookie server-side and stamps data-theme before first paint, injects ADMIN_CONSOLE_CSS once, mounts AdminThemeToggle -- 25-06 gate + role-aware sidebar unchanged"
    requirement: "TEAM-08"
    verification:
      - kind: other
        ref: "npx tsc --noEmit clean; npx eslint app/(admin)/layout.tsx clean; npm run build exit 0 (all /admin/* routes compiled); getStaffRole()/isLeadership conditional and every Link href are byte-identical to 25-06's shipped layout, only className values and the .fncon wrapper/style/toggle were added"
        status: pass
    human_judgment: false
  - id: D4
    description: "ADMIN_CONSOLE_CSS defines dark base + [data-theme=light] override for the same token names; both grounds legible with the brand gradient intact"
    requirement: "TEAM-08"
    verification:
      - kind: other
        ref: "Manual code read -- every dark-base custom property has a same-named light override; grad/indigo/fuchsia present in both blocks"
        status: pass
    human_judgment: true
    rationale: "Pixel-level contrast/legibility confirmation requires a live browser render -- deferred to the plan's Manual/visual verification bullet (dev run or 25-07-style checkpoint), consistent with 25-06's own deferral pattern."
  - id: D5
    description: "No hardcoded dark-only hex literals remain in StaffAdmin.tsx / MyCompanies.tsx"
    requirement: "TEAM-08"
    verification:
      - kind: other
        ref: "grep -nE 'text-white|bg-white|border-white|text-lav|bg-lav|border-lav|bg-grad\\b|text-rose-|border-amber-|bg-amber-|text-amber-|border-brandindigo|#[0-9a-fA-F]{3,6}' components/admin/StaffAdmin.tsx components/admin/MyCompanies.tsx -- empty output"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-08-07
status: complete
---

# Phase 25 Plan 08: Team Console Theme (Light/Dark) Summary

Ported the proven buyer-portal theme pattern (Phase 22 · 22-03) to the `/admin` shell: a
`fnadmin_theme` cookie, an `AdminThemeToggle`, and an `ADMIN_CONSOLE_CSS` token stylesheet
(dark default, light override) applied to the console shell plus the new Phase 25 surfaces
(`StaffAdmin`, `MyCompanies`, and their two page routes).

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 completed
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments

- `lib/admin/theme.ts` — `ADMIN_THEME_COOKIE = 'fnadmin_theme'` + `readAdminTheme()`, a strict
  allowlist returning `'light'` only on an exact match, else `'dark'` (the console default —
  the inverse of `readBuyerTheme`'s light default).
- `components/admin/AdminThemeToggle.tsx` — a client component mirroring
  `components/buyer/ThemeToggle.tsx` exactly: flips the cookie and the `.fncon` wrapper's
  `data-theme` attribute on click (instant, no reload), same sun/moon SVG + `aria-label`
  pattern, styled as a sidebar row (`Light mode` / `Dark mode` label) to sit alongside the
  existing nav links.
- `components/admin/console-theme.ts` — `ADMIN_CONSOLE_CSS`, a `.fncon`-scoped token block:
  dark base (`--ground`/`--panel`/`--panel-2`/`--ink`/`--ink-2`/`--ink-3`/`--border`/
  `--border-2`/`--indigo`/`--fuchsia`/`--grad`/`--green-*`/`--amber-*`/`--rose-*`) lifted 1:1
  from the exact hex/rgba values `tailwind.config.ts`'s `ink`/`card`/`card2`/`lav`/`lavdim`/
  `hair`/`hairstrong` already render today, plus a `.fncon[data-theme="light"]` override
  reusing the verified buyer-portal light palette (`FNBL_CSS`'s light token values) for
  cross-console brand consistency.
- `app/(admin)/layout.tsx` — reads `ADMIN_THEME_COOKIE` via `cookies()`, computes `theme`,
  wraps the existing shell in `<div className="fncon" data-theme={theme}>` with
  `<style>{ADMIN_CONSOLE_CSS}</style>` injected once (server-side, before first paint — no
  flash), and mounts `<AdminThemeToggle theme={theme} />` in the sidebar footer above
  `SignOutButton`. The 25-06 `getStaffRole()` gate and `isLeadership`-conditional sidebar links
  are byte-identical to the prior shipped layout — only `className` values (Tailwind
  arbitrary-value token references) and the new wrapper/style/toggle were added.
- `components/admin/StaffAdmin.tsx` and `components/admin/MyCompanies.tsx` — every hardcoded
  `text-white`/`border-white`/`bg-white`/`text-lav`/`text-lavdim`/`text-rose-400`/
  `border-amber-500`/`bg-amber-500`/`text-amber-300`/`border-brandindigo` literal replaced with
  the matching console token (`var(--ink)`, `var(--ink-2)`, `var(--ink-3)`, `var(--border)`,
  `var(--panel-2)`, `var(--rose-fg)`, `var(--amber-line)`/`var(--amber-bg)`/`var(--amber-fg)`,
  `var(--indigo)`). The `bg-grad` CTA button was swapped for a new `.fncon-cta` scoped class
  (`background:var(--grad)`) rather than an unverified `bg-[image:var(--grad)]` Tailwind
  arbitrary-value form, matching the buyer components' own scoped-CSS gradient convention.

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin theme cookie util + toggle** - `d6d1225` (feat)
2. **Task 2: Console token stylesheet + wire into the admin layout** - `ccd6ac2` (feat)
3. **Task 3: Tokenize StaffAdmin/MyCompanies for both themes** - `d20d5de` (feat)

## Files Created/Modified

- `lib/admin/theme.ts` - `ADMIN_THEME_COOKIE` + `readAdminTheme()`
- `components/admin/AdminThemeToggle.tsx` - per-member light/dark toggle
- `components/admin/console-theme.ts` - `ADMIN_CONSOLE_CSS` token stylesheet
- `app/(admin)/layout.tsx` - `.fncon` wrapper, SSR `data-theme`, injected CSS, toggle mount
- `components/admin/StaffAdmin.tsx` - tokenized colors, `fncon-cta` CTA button
- `components/admin/MyCompanies.tsx` - tokenized colors
- `app/(admin)/admin/team-members/page.tsx` - h1 tokenized (Rule 2, see Deviations)
- `app/(admin)/admin/my-client-partners/page.tsx` - h1 tokenized (Rule 2, see Deviations)

## Decisions Made

- Token names and values are direct 1:1 lifts from existing, already-rendered colors (dark:
  `tailwind.config.ts`'s `ink`/`card`/`card2`/`lav`/`lavdim`/`hair`/`hairstrong`; light: the
  verified `FNBL_CSS` light palette) — zero new colors invented, minimizing visual drift from
  today's console and maximizing brand consistency with the already-shipped buyer light theme.
- `SignOutButton.tsx` (shared with `components/nav/ArtistNav.tsx`) was left unmodified. Rather
  than editing a cross-context shared component (which would require the `.fncon` token scope
  to also be meaningful inside `ArtistNav`'s unrelated dark shell), the admin layout wraps the
  rendered button in a `div` using a Tailwind arbitrary-child-selector
  (`[&>button]:text-[color:var(--ink-3)] [&>button:hover]:text-[color:var(--ink)]`) so the
  "Sign out" link is legible in both Team Console themes without touching the shared file or
  affecting `ArtistNav`.
- The CTA gradient button in `StaffAdmin.tsx` uses a new `.fncon-cta` scoped class
  (`background:var(--grad)`) added to `ADMIN_CONSOLE_CSS`, rather than a `bg-grad` Tailwind
  utility (fixed to the dark-tuned brand hexes) or an unverified `bg-[image:var(--grad)]`
  arbitrary-value form — matching the exact scoped-CSS gradient pattern already proven across
  every buyer-portal component (`background:var(--grad)` inside a `<style>` block).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing functionality] Tokenized the two page-route h1 headlines**
- **Found during:** Task 3
- **Issue:** `app/(admin)/admin/team-members/page.tsx` and
  `app/(admin)/admin/my-client-partners/page.tsx` both render `<h1 className="text-2xl
  font-bold text-white">` — hardcoded white, invisible/illegible against a light `.fncon`
  ground. These two files are outside this plan's declared `files_modified` list (which names
  only `StaffAdmin.tsx`/`MyCompanies.tsx` for Task 3), but the plan's own `must_haves.truths`
  explicitly requires "`/admin/team-members` + StaffAdmin, `/admin/my-client-partners` +
  MyCompanies... render correctly in BOTH themes" — the page shell around each component is
  part of that surface.
- **Fix:** Replaced `text-white` with `text-[color:var(--ink)]` on both h1 elements. No other
  changes to either file.
- **Files modified:** `app/(admin)/admin/team-members/page.tsx`, `app/(admin)/admin/my-client-partners/page.tsx`
- **Commit:** `d20d5de`

## Verification Results

- `npx tsc --noEmit` — clean (run after each task and at the end).
- `npx eslint "app/(admin)/layout.tsx" components/admin/StaffAdmin.tsx components/admin/MyCompanies.tsx "app/(admin)/admin/team-members/page.tsx" "app/(admin)/admin/my-client-partners/page.tsx"` — clean, zero warnings.
- `npm run build` — exit 0; all `/admin/*` routes (including `/admin/team-members` and
  `/admin/my-client-partners`) compiled successfully.
- `grep -nE 'text-white|bg-white|border-white|text-lav|bg-lav|border-lav|bg-grad\b|text-rose-|border-amber-|bg-amber-|text-amber-|border-brandindigo|#[0-9a-fA-F]{3,6}' components/admin/StaffAdmin.tsx components/admin/MyCompanies.tsx` — empty output (no hardcoded dark-only literals remain).
- `npm test` — 127 suites / 1539 tests, all green (no regressions; this plan is UI/theming-only, no new pure-logic module warranted new test files).
- Manual/visual dev-run check of the toggle's instant no-reload flip and the SSR no-flash
  guarantee was **not** performed in this session (no live dev server session available) —
  deferred to the phase's standing checkpoint convention (mirrors 25-06's own deferral of live
  AE/BD navigation smoke to 25-07).

## Known Stubs

None.

## Threat Flags

None new. This plan touches zero network endpoints, auth paths, or schema — it is a pure
CSS-token/styling pass over an already-gated shell and two already-audited components. T-25-13
(theme cookie tampering) is satisfied by `readAdminTheme`'s strict allowlist (`'light'` on
exact match only, else `'dark'`), matching the threat model's own mitigation plan exactly.

## User Setup Required

None — no external service configuration required. The Manual/visual verification bullet in
this plan's `<verification>` section (toggle flip, reload persistence, no-flash check) requires
a live dev-run session or the phase's post-push checkpoint; not performed in this execution
pass.

## Next Phase Readiness

- The Team Console shell now has a working, cookie-persisted, per-member light/dark theme with
  zero first-paint flash, satisfying provisional requirement TEAM-08.
- `ADMIN_CONSOLE_CSS`'s token set is available for 25-09 (leadership reassign control) and
  25-10 (Team Member Directory) to build on directly — no new token stylesheet needed for
  either follow-on plan.
- Legacy Phase 16 admin pages (buyer-orgs/members/deals/metrics/etc.) remain untouched and
  dark-only, as explicitly scoped out of this plan (mirrors the buyer-side 22-04 follow-on
  pattern) — a future retheme plan can migrate them onto the same `.fncon` tokens incrementally.
- REQUIREMENTS.md still has no Phase 25 section registering TEAM-08 (`requirements
  mark-complete` will need to be re-checked) — same pre-existing documentation gap noted at
  25-03/25-04/25-05/25-06 and Phases 16/22/28 in STATE.md; deferred to a future
  `/gsd-docs-update` pass, not fixed by this executor.

---
*Phase: 25-funun-team-accounts-ae*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: lib/admin/theme.ts
- FOUND: components/admin/AdminThemeToggle.tsx
- FOUND: components/admin/console-theme.ts
- FOUND: app/(admin)/layout.tsx
- FOUND: components/admin/StaffAdmin.tsx
- FOUND: components/admin/MyCompanies.tsx
- FOUND: app/(admin)/admin/team-members/page.tsx
- FOUND: app/(admin)/admin/my-client-partners/page.tsx
- FOUND commit d6d1225 (feat: admin theme cookie util + toggle)
- FOUND commit ccd6ac2 (feat: console token stylesheet + wire into admin layout)
- FOUND commit d20d5de (feat: tokenize StaffAdmin/MyCompanies for both themes)
