---
phase: quick/260927-pbc
plan: 01
subsystem: design-system
tags: [palette, tailwind, css-vars, guard-test]
dependency-graph:
  requires: []
  provides: [palette-single-source-guard, neutral-black-surface-palette]
  affects: [app/*, components/*]
tech-stack:
  added: []
  patterns: [drift-guard-boundary-test, css-custom-property-tokenization]
key-files:
  created:
    - __tests__/palette-single-source.test.ts
  modified:
    - tailwind.config.ts
    - app/globals.css
    - 30 further .tsx/.ts files under app/ and components/ (full list below)
decisions:
  - "Guard collects offenders at file:line granularity, not per-occurrence -- pre-fix count is 65 lines / 34 files, not the 79-occurrence estimate from planning (reconciled below, not a broken matcher)."
  - "components/admin/console-theme.ts's --border/--border-2 and components/buyer/fnbl-theme.ts's --line/--line-2 are left on the OLD rgba(199,203,247,.12/.22) values, per the plan's own residue call-out, not converted."
  - "components/selects-player/theme.ts's local --lav gets the literal #d4d4d8 instead of var(--lav) because the local name collides with the global var name -- a same-name var() reference is a CSS custom-property self-cycle."
metrics:
  duration: "~1h"
  completed: "2026-09-27"
status: complete
---

# Phase quick/260927-pbc Plan 01: Repaint surface palette to neutral black Summary

Repainted the Funūn surface palette from the indigo-undertone dark to neutral black across
both palette definitions (`tailwind.config.ts`, `app/globals.css`) and 32 files carrying
literal occurrences of the retired values, backed by a new drift guard
(`__tests__/palette-single-source.test.ts`) that was observed RED before the fix and RED
again mid-fix, proving it measures real drift rather than passing vacuously.

## Task 1 — Guard, observed RED pre-fix

**ACTUAL observed pre-fix counts (not the plan's ~79 estimate):**

- **65 offending `file:line` locations across 34 distinct files.**
- File walker found **1,527** source files under `app/`, `components/`, `lib/` (well above
  the >200 non-vacuity floor).
- Both parsers (tailwind.config.ts, app/globals.css) found exactly 7 keys each (non-vacuity
  passed).

**Reconciling 65 vs. the plan's ~79 estimate (investigated per hard constraint #2, not
assumed):** the plan's 79 was occurrence-based (`grep -o` count: 81 raw hex hits across
`app`+`components`+`lib`, minus 6 in the three allowlisted `lib/email` files = 75, plus 4
decimal-rgba sites = 79). The guard instead collects offenders at **`file:line` granularity**
(per the plan's own spec: "Collect offenders as `relative/path:line` strings"). Nine lines in
the pre-fix tree carry 2–5 hex hits each (`components/admin/console-theme.ts:25` has 5,
`components/buyer/fnbl-theme.ts:22` has 4, seven other lines have 2 each — 14 extra hits
total), which collapse onto a single offender line apiece: 75 hex occurrences → 61 distinct
hex-bearing lines, plus 4 distinct decimal-rgba lines = **65**. Cross-checked independently
with a standalone `grep -rnoiE` count (81 total hex hits, 78 file-level `grep -c` count, 34
distinct files) and a second independent Node script reproducing the guard's exact walk/match
logic — all three methods agree. The shortfall is fully explained by line-level dedup, not a
broken matcher; the guard's own line-based accounting is what actually shipped.

**Non-vacuity guaranteed:** both parser non-vacuity assertions (`toHaveLength(7)`) and the
walker file-count assertion (`toBeGreaterThan(200)`) are present in the guard and passed on
the unmodified tree, so a regex that silently stops matching, or a walk that returns zero
files, would fail loudly instead of producing a false-green guard.

Committed standalone and RED: `bd202e61` — `test(palette): add single-source guard -- RED, 65
violations pre-fix`.

## Task 2 — Half (a) observed failing mid-repaint, then recovering

Edited `tailwind.config.ts` alone first. Ran the guard's "agree" tests (half a) and observed
**all 7 fail** — expected values from `app/globals.css` (`#c7cbf7`, `#7c80b4`,
`rgba(199,203,247,.12)`, etc.) vs. received values from the now-updated `tailwind.config.ts`
(`#d4d4d8`, `#8b8b97`, `rgba(255,255,255,.08)`, etc.). This proves the guard's explicit name
map (`ink`↔`--bg`, `card2`↔`--card-2`, etc.) and normalization actually detect real drift, not
just a contrived failure.

Edited `app/globals.css` second, under its own var names. Half (a) passed again (7/7). The
gradient, money colours, nav-rail gradient, `brandindigo`/`brandfuchsia` and all
fonts/shadows/radii verified byte-identical in both files.

Committed: `d4b7d97a` — `feat(palette): repaint the two surface-palette definitions to
neutral black`.

## Task 3 — Literal-to-token conversion, full CI gate

Regenerated the offender worklist from the guard's own failure output (not the plan's line
numbers) and converted every remaining literal. **32 files** matched the worklist exactly
(31 git-tracked + `app/email-preview/page.tsx`, which is gitignored per its own header
comment — "LOCAL-ONLY preview... Not committed / not deployed" — so it was edited on disk to
keep the guard green but produces no commit).

### Conversion shapes used

- **`.tsx` arbitrary-value classes** → whole-class token swap: `bg-[#0E0D1E]` → `bg-card`,
  `border-[#1A1838]` → `border-card2`, `bg-[#0a0a0f]` → `bg-ink`.
- **Inline `style` objects** → CSS var form (`var(--bg)`, `var(--lav-dim)`, etc.) since a style
  object cannot carry a utility class (`app/email-preview/page.tsx`,
  `components/benchmarks/BenchmarkView.tsx`'s `dot` value, `components/profile/ActivityFeed.tsx`'s
  `other.stroke` value).
- **SVG `stroke` attributes** — this repo already has a `className="stroke-white/10"` Tailwind
  precedent (`app/(artist)/vault/[projectId]/page.tsx:80`), so `ContractLocker.tsx` (2 sites)
  and `app/selects/[token]/page.tsx` (1 site) were converted to `className="stroke-lav"` /
  `"stroke-lavdim"` instead of a raw `stroke="var(--lav-dim)"` attribute, for consistency with
  existing code rather than inventing a new pattern. **Minor deviation from the plan's literal
  "style object → var()" instruction**, since these are plain JSX attributes, not style
  objects; documented here rather than silently diverging.
- **The three CSS-in-TS theme modules** point local vars at the global ones per the plan:
  - `components/admin/console-theme.ts`: `--ground`→`var(--bg)`, `--panel`→`var(--card)`,
    `--panel-2`→`var(--card-2)`, `--ink-2`→`var(--lav)`, `--ink-3`→`var(--lav-dim)` (the 5
    named conversions). `--border`/`--border-2` are **left on the old
    `rgba(199,203,247,.12/.22)` values** — not part of the plan's named 5, and confirmed via
    grep to be part of the same out-of-scope lavender-hairline residue family (see below).
  - `components/buyer/fnbl-theme.ts`: `--page`→`var(--bg)`, `--ink`→`var(--lav)`,
    `--ink-2`→`var(--lav-dim)`, `--wash`→`var(--card-2)` (the 4 named conversions).
    `--ink-3`, `--wash-2`, `--line`, `--line-2` left untouched (same residue family, and/or
    non-locked alphas).
  - `components/selects-player/theme.ts`: `--panel`→`var(--card)`. `--lav` gets the **literal**
    `#d4d4d8` rather than `var(--lav)` — the local var is also named `--lav`, so
    `--lav: var(--lav);` inside `.selp{}` is a same-name self-reference, which CSS treats as
    invalid at computed-value time and silently falls back to the inherited value. No test can
    see a wrong fallback resolve, so the literal was used to avoid a fragile self-cycle. Left
    `--ground` (`#08070d`, not one of the 5 retired hexes), `--lavdim`/`--lavdim2` (different
    values, not retired), and `--border`/`--border2` (same residue family) untouched.
- **Two named exceptions held, per the plan:**
  - `app/global-error.tsx` — inline literal kept, now `#000000` (was `#0a0a0f`). It replaces
    the root layout and cannot rely on `globals.css` having loaded.
  - `app/(auth)/layout.tsx:13` — the only comment-embedded occurrence, reworded from
    "globals.css paints the body flat #0a0a0f" to "globals.css paints the body flat black",
    describing the ground without naming a hex.
- **Four decimal-rgba sites converted verbatim per `<scope_notes>`:**
  `app/(artist)/layout.tsx:147` and `app/w/[workspaceId]/layout.tsx:84`
  (`rgba(10,10,15,.72)`→`rgba(0,0,0,.72)`), `components/playbook/ItRoomTopBar.tsx:18`
  (`rgba(10,10,15,.82)`→`rgba(0,0,0,.82)`), `app/(auth)/layout.tsx:23`
  (`rgba(14,13,30,.86)`→`rgba(10,10,12,.86)`).

### Full list of converted files (32)

`app/(artist)/antenna/[opportunityId]/page.tsx`, `app/(artist)/layout.tsx`,
`app/(artist)/opportunities/page.tsx`, `app/(artist)/vault/[projectId]/pitch/page.tsx`,
`app/(auth)/layout.tsx`, `app/email-preview/page.tsx` (gitignored, no commit),
`app/global-error.tsx`, `app/selects/[token]/page.tsx`, `app/w/[workspaceId]/layout.tsx`,
`components/admin/BuyerOrgsAdmin.tsx`, `components/admin/ChecklistAdmin.tsx`,
`components/admin/CuratorAdmin.tsx`, `components/admin/MembersAdmin.tsx`,
`components/admin/console-theme.ts`, `components/antenna/ApplicationInbox.tsx`,
`components/antenna/OpportunityForm.tsx`, `components/benchmarks/BenchmarkView.tsx`,
`components/buyer/fnbl-theme.ts`, `components/contracts/ContractLocker.tsx`,
`components/launchpad/SlotGeneratePanel.tsx`, `components/launchpad/TipPanel.tsx`,
`components/playbook/ItRoomTopBar.tsx`, `components/profile/ActivityFeed.tsx`,
`components/selects-player/theme.ts`, `components/split-sheets/PartyPicker.tsx`,
`components/split-sheets/SplitApprovalView.tsx`, `components/split-sheets/SplitSheetBuilder.tsx`,
`components/tools/PitchCard.tsx`, `components/tools/PitchPlugForm.tsx`,
`components/vault/ExportPackPanel.tsx`, `components/vault/MetadataStudio.tsx`,
`components/vault/StemsUpload.tsx`, `components/vault/ToolSidePanel.tsx`.

Committed: `7e45c8ed` — `feat(palette): convert remaining surface literals to neutral-black
tokens`.

## Known, intentional residue (both carve-outs, verbatim, matching the PR body)

**1. `lib/email/artist*.ts` — the CONTEXT's explicit email carve-out.**
`lib/email/artistInvite.ts`, `lib/email/artistReopened.ts`, `lib/email/artistSpotOpened.ts`
keep the old palette. Email HTML cannot use Tailwind classes, inbox clients invert dark
backgrounds, and a pure-black email is a design decision nobody has made. This is the guard's
entire allowlist — exactly these three paths, nothing more.

**2. The `rgba(199,203,247,α)` lavender-hairline family, at any alpha, outside the two theme
files' 9 named conversions.** Confirmed present (grep-verified during this execution, not
assumed) in files the plan does **not** list for conversion:
`app/(artist)/earnings/page.tsx:158`, `app/(artist)/vault/[projectId]/readiness/page.tsx:199`
and `:216`, `components/playbook/AccessEditorMatrix.tsx:113`,
`components/admin/HealthRulesForm.tsx:137,301,305,338,350`, `components/coach/RightsCoach.tsx:98`,
`components/benchmarks/BenchmarkView.tsx:201` (a *different* line than the one converted in
Task 3), and `components/selects-player/theme.ts`'s own `--border`/`--border2` (line 22) and a
third site at line 81. Also present, left untouched inside the two theme files:
`console-theme.ts`'s `--border`/`--border-2` and `fnbl-theme.ts`'s `--ink-3`, `--wash-2`,
`--line`, `--line-2`. Over black these read as faint cool-grey; choosing the right neutral
alpha for each site (progress-bar fills, conic-gradient tracks, hover washes) is a design
pass, not a mechanical substitution — the CONTEXT locked only two exact alphas (.12/.22) and
did not authorize touching this family everywhere it appears. `components/selects-player/theme.ts:76`'s
`rgba(10,9,16,.6)` is near-ink but not a retired value and was also left alone.

## Deviations from Plan

### Auto-fixed / judgment calls (documented, not silent)

**1. Guard offender counting is per-line, not per-occurrence.** Not a bug — matches the
plan's explicit "Collect offenders as `relative/path:line` strings" instruction — but the
resulting count (65) differs from the plan's occurrence-based estimate (79). Reconciled and
verified independently above; not a sign of a broken matcher.

**2. SVG `stroke` attribute conversions use Tailwind `className` utilities, not `var()`
attributes.** `components/contracts/ContractLocker.tsx` (2 sites) and
`app/selects/[token]/page.tsx` (1 site) had a plain `stroke="#hex"` JSX attribute, not a style
object. Rather than write a new `stroke="var(--lav-dim)"` pattern with no precedent, converted
to `className="stroke-lav"` / `"stroke-lavdim"`, matching this repo's existing
`className="stroke-white/10"` usage (`app/(artist)/vault/[projectId]/page.tsx:80`).

**3. CSS custom-property self-reference avoided with a literal, not `var()`.**
`components/selects-player/theme.ts`'s local `--lav` var shares its name with the global
`--lav` var; writing `--lav: var(--lav);` would be a same-name self-cycle, invalid at
computed-value time per the CSS spec, silently falling back to the inherited value rather than
failing anything a test could see. Used the literal `#d4d4d8` instead. (Rule 1 — bug
avoidance: a naive `var()` conversion here would have been a latent, invisible defect.)

**4. `components/admin/console-theme.ts`'s `--border`/`--border-2` and
`components/buyer/fnbl-theme.ts`'s `--line`/`--line-2` deliberately NOT converted**, despite
carrying the exact locked hair/hairstrong rgba values (`.12`/`.22`). The plan's action text
names exactly 5 and 4 conversions per file respectively (ground/panel/panel-2/ink-2/ink-3 and
page/ink/ink-2/wash) — these two properties are not among them, and grep confirmed they are
part of the same 33-occurrence/16-file lavender-hairline residue family called out as
deliberately out of scope. Converting them would have gone beyond the plan's stated scope for
these two files.

No architectural changes (Rule 4) were needed.

## Verification Gate — every CI validate step, run at branch head

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | **PASS** — `PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.` |
| `npm run typecheck:strict` | **PASS** — clean, no output |
| `npm run lint` (`--max-warnings=0`) | **PASS** — 0 warnings, 0 errors (only an ESLint flat-config deprecation notice on stderr, no lint findings) |
| `npm test -- --runInBand` | **PASS** — 635 suites, 7,788 tests, all passed |
| `npm audit --omit=dev --audit-level=moderate` | **PASS** — `found 0 vulnerabilities` |
| `npm audit --audit-level=high` | **PASS** — `found 0 vulnerabilities` |

`npm run build` was **not run**, per the hard constraint (dev server live on :3000; build
clobbers `.next`; not part of CI's validate job).

`npx jest __tests__/palette-single-source.test.ts` — **11/11 passed** at branch head (both
non-vacuity assertions, all 7 "agree" assertions, the walker non-vacuity assertion, and the
zero-offenders assertion).

## Threat Flags

None. No trust boundary moved: no new network endpoint, auth path, file-access pattern, or
schema change. Matches the plan's own `<threat_model>` framing (presentational token values
only).

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Commits on `neutral-black-palette`

| SHA | Message |
|---|---|
| `bd202e61` | `test(palette): add single-source guard -- RED, 65 violations pre-fix` |
| `d4b7d97a` | `feat(palette): repaint the two surface-palette definitions to neutral black` |
| `7e45c8ed` | `feat(palette): convert remaining surface literals to neutral-black tokens` |

Branch not pushed; PR not opened — per hard constraints, the orchestrator handles both.

## Self-Check: PASSED

- `__tests__/palette-single-source.test.ts` — FOUND on disk.
- `bd202e61`, `d4b7d97a`, `7e45c8ed` — all FOUND in `git log --oneline --all`.
- `tailwind.config.ts` and `app/globals.css` diffs confirmed present against `main` (14
  insertions / 14 deletions each).
- Full guard suite (11/11) and full CI validate job (6/6 steps) reconfirmed green at branch
  head immediately before writing this summary.
