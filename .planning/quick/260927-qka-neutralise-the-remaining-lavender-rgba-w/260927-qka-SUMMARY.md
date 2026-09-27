---
phase: 260927-qka
plan: 01
subsystem: palette / theming
tags: [css, palette-guard, buyer-portal, admin-console, selects-player, playbook]
dependency-graph:
  requires: [PR-118 (1728a221) -- the neutral-black palette repaint and palette-single-source.test.ts]
  provides: [lavender-family guard test, 15 files with the remaining lavender rgba washes neutralised]
  affects: [buyer portal dark theme, admin console, Playbook Rail2, Selects player]
tech-stack:
  added: []
  patterns: [regex-based CSS-literal guard test with non-vacuity assertion, linear-fit alpha remapping for interpolated colour migrations]
key-files:
  created:
    - .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md
  modified:
    - __tests__/palette-single-source.test.ts
    - app/(artist)/earnings/page.tsx
    - app/(artist)/vault/[projectId]/readiness/page.tsx
    - components/admin/HealthRulesForm.tsx
    - components/admin/console-theme.ts
    - components/antenna/OpportunityCard.tsx
    - components/benchmarks/BenchmarkView.tsx
    - components/buyer/fnbl-theme.ts
    - components/coach/RightsCoach.tsx
    - components/playbook/AccessEditorMatrix.tsx
    - components/playbook/Rail2.tsx
    - components/profile/ProfileView.tsx
    - components/selects-player/theme.ts
    - components/vault/PlaybackView.tsx
    - components/vault/PublicPlaybackView.tsx
    - components/vault/VaultProjectCard.tsx
decisions:
  - "New guard scan lives in its own describe block (half c), not folded into the existing RETIRED_DECIMAL_PATTERNS/half-(b) test -- keeps the existing hex/decimal agreement test green throughout and makes the new scan's RED state independently legible."
  - "console-theme.ts (.fncon) and selects-player/theme.ts (.selp) both define --border/--border-2 (or --border2) in their own scope -- literals used for all four declarations plus two .selp usage sites, to avoid a silent self-cycle at computed-value time."
  - "fnbl-theme.ts's --line/--line-2 are distinct names from the CSS globals and the same block already resolves --ink:var(--lav) safely, so those two moved to var(--border)/var(--border-strong) instead of literals."
  - "OVERRIDE APPLIED (supersedes CONTEXT.md): fnbl-theme.ts's --ink-3 does NOT become var(--lav-dim). The same line already sets --ink-2:var(--lav-dim); pointing --ink-3 at the same token would collapse secondary and tertiary buyer-dark-theme text to one value. Used rgba(255,255,255,.44) instead (linear fit 0.8*.55-0.016 ~= .42, rounded up to stay visibly dimmer than --ink-2)."
metrics:
  duration: "~35 minutes"
  completed: "2026-09-27"
status: complete
---

# Phase 260927-qka Plan 01: Neutralise the remaining lavender rgba washes Summary

Closed a hex-only blind spot in `__tests__/palette-single-source.test.ts` that let 38
decimal-rgba spellings of retired hex `#c7cbf7` survive PR #118's neutral-black repaint
across 15 files, then applied the 38 locked neutral substitutions and ran the full CI
validate gate green.

## What was built

**Task 1 — extended guard, observed RED, recorded the count (commit `b4de7d3e`).**
Added `LAVENDER_FAMILY_PATTERN` (a case-insensitive regex anchored on `199,203,247,`
with tolerant whitespace) and a new `describe('no lavender rgba literal survives at
any alpha', ...)` block to `__tests__/palette-single-source.test.ts`, reusing the
existing `walk`/`SCAN_DIRS`/`ALLOWLIST` verbatim and carrying its own non-vacuity
assertion (`files.length > 200`). The existing `RETIRED_DECIMAL_PATTERNS` array and
half-(b) test were left untouched, by design, so the pre-existing hex/decimal
agreement stayed provably green while the new scan went red in isolation.

Ran the extended guard against the unmodified tree and observed:
- **1 failed, 12 passed, 13 total** (exactly the new test failed)
- **38 occurrences / 33 distinct lines / 15 files** — matching the plan's preflight
  prediction exactly, no shortfall
- Reconciliation: `components/buyer/fnbl-theme.ts:22` carries 4 occurrences
  (`--wash-2`, `--line`, `--line-2`, `--ink-3`), `components/admin/console-theme.ts:25`
  carries 2 (`--border`, `--border-2`), `components/selects-player/theme.ts:22`
  carries 2 (`--border`, `--border2`) — `38 − 8 + 3 = 33`.

Recorded the full offender list and reconciliation in
`260927-qka-PREFIX-VIOLATIONS.md`, committed alongside the guard.

**Task 2 — applied the 38 substitutions across the 15 files (commit `c86eaeb0`).**
Followed the CONTEXT.md-locked mapping exactly, with the one explicit override applied
(see Decisions). Zero `rgba(199,203,247,...)` occurrences remain under `app/`,
`components/`, `lib/` outside the `lib/email` carve-out. The palette guard is green at
13/13 tests. `tailwind.config.ts` and `app/globals.css` are byte-identical to
`1728a221`. All five accent rgba families have identical occurrence counts before and
after, whole-tree: `52,211,153` (12/12), `245,158,11` (4/4), `244,63,94` (7/7),
`129,140,248` (30/30), `217,70,239` (38/38).

**Task 3 — full CI validate gate (this session; no PR opened, see below).**

## Per-file literal-vs-var() decisions actually taken

| File | Declaration | Decision | Why |
|---|---|---|---|
| `components/admin/console-theme.ts:25` | `--border`, `--border-2` | white literal (`.08`, `.16`) | `.fncon` defines both names in its own scope -- `var()` would self-cycle silently at computed-value time |
| `components/selects-player/theme.ts:22` | `--border`, `--border2` | white literal (`.08`, `.16`) | `.selp` defines both names in its own scope -- same self-cycle risk |
| `components/selects-player/theme.ts:76,81` | `.previewpill` / `.chip-funun` border usage sites | white literal (`.21`, `.16`) | consistency with the literal `--border`/`--border2` pair above -- no future reader has to re-derive which is safe |
| `components/buyer/fnbl-theme.ts:22` | `--line`, `--line-2` | `var(--border)`, `var(--border-strong)` | distinct names from the CSS globals; the same block already resolves `--ink:var(--lav)` and `--ink-2:var(--lav-dim)` today, positive evidence `var()` is safe here |
| `components/buyer/fnbl-theme.ts:22` | `--wash-2` | white literal `.10` | no global equivalent exists to point at |
| `components/buyer/fnbl-theme.ts:22` | `--ink-3` | white literal `.44` (`rgba(255,255,255,.44)`), NOT `var(--lav-dim)` | **override applied** -- see Decisions |

## Category A / B substitutions applied

- **Category A (18 sites)** — the locked `hair`/`hairstrong` values, reachable now via
  `bg-hair` token (4 sites), `var(--border-2, ...)` fallback swap (6 sites in
  `HealthRulesForm.tsx` + `AccessEditorMatrix.tsx`), and literals in the two
  self-cycling theme files (8 sites across `console-theme.ts` + `selects-player/theme.ts` line 22).
- **Category B rule 1 (α ≤ .10, hue-only swap)** — 10 identical `Rail2.tsx` hover washes
  kept at `.05`; `fnbl-theme.ts --wash-2` kept at `.10`. The linear fit was deliberately
  NOT applied here (it would drop `.05` to ~`.02`, making the hover state effectively
  invisible).
- **Category B rule 2 (linear fit `α' = 0.8α − 0.016`)** — `.14→.10` (OpportunityCard,
  PlaybackView scrub track, VaultProjectCard, selects-player `.mscrub`), `.16→.11`
  (ProfileView, PublicPlaybackView), `.18→.13` (PlaybackView waveform bar), `.28→.21`
  (selects-player `.previewpill`).
- **Category B rule 3 (the one judgement call)** — `fnbl-theme.ts --ink-3`, see above.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written for Tasks 1 and 2, with the one CONTEXT.md-superseding
override applied exactly as instructed (not a deviation I introduced; explicitly given
in the execution instructions as overriding CONTEXT.md's `--ink-3 → var(--lav-dim)`
decision).

### Task 3 deviation — no push, no PR opened

**The execution context I was spawned under explicitly states:** "Branch
`neutral-lavender-washes` — ALREADY created and checked out from origin/main at
`1728a221`. Do NOT create or switch branches. Do NOT push. Do NOT open a PR." This
directly overrides Task 3's instructions to push the branch and run `gh pr create`.
Per the standing rule that harness/orchestrator instructions in `execution_context`
govern, I ran the full six-step validate gate locally and STOPPED before the
push/PR step, per hard_constraint #8 ("Do the code work and the full gate, then STOP
and report"). I also did not attempt the Task 3 human-check (Vercel preview eyeball)
myself, per the same constraint — that step requires an actual PR/preview deployment
that does not exist yet.

**Both commits are on the local branch, ready to push:**
- `b4de7d3e` — test(palette): close the decimal-rgba blind spot
- `c86eaeb0` — fix(palette): neutralise the remaining lavender rgba washes

**PR body content, ready for whoever pushes and opens the PR** (all seven points the
plan requires):

1. PR #118's guard (`__tests__/palette-single-source.test.ts`) scanned for five retired
   hex literals only. `rgba(199,203,247,α)` is the decimal spelling of retired hex
   `#c7cbf7` — one of the five — and a decimal rgba contains no `#`, so the hex scan
   was structurally blind to it. This PR closes that hole with a new, separate guard
   block.
2. Observed pre-fix count (from `260927-qka-PREFIX-VIOLATIONS.md`): **38 occurrences,
   33 distinct lines, 15 files.** Reconciliation: `fnbl-theme.ts:22` carries 4
   occurrences, `console-theme.ts:25` carries 2, `selects-player/theme.ts:22` carries
   2 — `38 − 8 + 3 = 33`.
3. 18 of the 38 sites (Category A) were already the locked `hair` (`.12` →
   `rgba(255,255,255,.08)`) / `hairstrong` (`.22` → `rgba(255,255,255,.16)`) values —
   not a new design decision, just sites the hex-based worklist couldn't see.
4. Category B mapping rule: `α' = 0.8α − 0.016`, rounded to two decimals, applied to
   mid-alpha borders/tracks (`.14→.10`, `.16→.11`, `.18→.13`, `.28→.21`). Deliberately
   NOT applied to the ten `Rail2.tsx` hover washes or `fnbl-theme.ts`'s `--wash-2`
   (both stayed at their original low alpha, hue swapped to white only) — the fit would
   have driven the Rail2 hover state to near-invisibility.
5. The one judgement call: `fnbl-theme.ts`'s `--ink-3` at `.55` is TEXT, not a wash. Set
   to `rgba(255,255,255,.44)` rather than `var(--lav-dim)` (CONTEXT.md's original call)
   because the same line already sets `--ink-2:var(--lav-dim)` — pointing `--ink-3` at
   the same token would have collapsed the buyer dark theme's secondary and tertiary
   text to one value. `.44` is the linear-fit result, rounded to stay visibly dimmer
   than `--ink-2`. **Flag the buyer portal for eyeballing on the Vercel preview.**
6. Self-cycle finding: `console-theme.ts` and `selects-player/theme.ts` both define
   `--border` (and a second border name) inside their own scope, so literals were used
   there instead of `var()` to avoid a silently-invalid self-reference at
   computed-value time — a failure mode no test in the suite could otherwise catch.
   `fnbl-theme.ts` uses distinct names (`--line`, `--line-2`) and could safely use
   `var(--border)` / `var(--border-strong)`.
7. Surfaces most changed, worth eyeballing on the Vercel preview: the buyer portal
   (`fnbl-theme`), the admin console (`console-theme`), the Playbook Rail2 hover
   states, and the Selects player.

## Verification Gate — all six steps, verbatim

```
$ npm run security:migrations:verify
PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege,
checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
> tsc --noEmit --noUnusedLocals --noUnusedParameters
(no output -- clean)

$ npm run lint
> ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0
(no lint errors/warnings -- only the ESLintRCWarning deprecation notice, unrelated to
this change and present on main)

$ npm test -- --runInBand
Test Suites: 635 passed, 635 total
Tests:       7790 passed, 7790 total
Snapshots:   0 total

$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities

$ npm audit --audit-level=high
found 0 vulnerabilities
```

`npm run build` was not run (forbidden — not part of validate, and a dev server is
live on :3000).

## Commits

- `b4de7d3e` — `test(palette): close the decimal-rgba blind spot for retired lavender #c7cbf7`
- `c86eaeb0` — `fix(palette): neutralise the remaining lavender rgba washes`

Both are local commits on `neutral-lavender-washes`, not pushed (per execution
context override).

## Self-Check: PASSED

All 15 modified source files, `__tests__/palette-single-source.test.ts`, and
`260927-qka-PREFIX-VIOLATIONS.md` confirmed present on disk. Both commit hashes
(`b4de7d3e`, `c86eaeb0`) confirmed present in `git log --oneline --all`.

## Known Stubs

None.

## Threat Flags

None — this change edits CSS colour literals and one test file only; no new trust
boundary, endpoint, or schema surface introduced. `T-qka-01` (buyer dark-theme
tertiary-text readability) and `T-qka-02` (self-referential custom property) from the
plan's threat register were both mitigated as designed (see per-file decision table
above) and remain flagged for the Task 3 human preview check that has not yet run.

## Outstanding for the human / next session

1. Push `neutral-lavender-washes` and open the PR against `main` with the body content
   above (all seven required points are drafted and ready to paste).
2. Once the PR is open and a Vercel preview exists, eyeball the four flagged surfaces
   (buyer portal dark mode — borders and tertiary text at the new `.44` alpha, admin
   console, Playbook Rail2 hover states, Selects player) against `main`, per the
   plan's `checkpoint:human-verify`.
