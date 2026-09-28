# Quick Task 260927-qka: Neutralise the remaining lavender rgba washes - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Task Boundary

PR #118 (merged, `1728a221`) repainted the surface palette to neutral black and added
`__tests__/palette-single-source.test.ts`. That guard scans for five retired **hex**
literals. It does not scan for the **rgba spellings** of the same retired colour, so
38 lavender `rgba(199,203,247,α)` values across 15 files survived the repaint and are
now lavender-tinted washes sitting on a pure-black ground.

Finish the repaint and close the hole in the guard.

</domain>

<decisions>
## Implementation Decisions

### The inventory (measured on `1728a221`; re-measure before editing)

```
grep -rohE "rgba\(199, ?203, ?247, ?\.?[0-9.]+\)" --include=*.tsx --include=*.ts --include=*.css app components lib
```

| alpha | count | what it is |
|---|---|---|
| `.22` | 10 | **the locked `hairstrong` value** |
| `.05` | 10 | Rail2 hover wash (all in `components/playbook/Rail2.tsx`) |
| `.12` | 8 | **the locked `hair` value** |
| `.14` | 4 | |
| `.16` | 2 | |
| `.55` | 1 | `fnbl-theme.ts` `--ink-3` — **TEXT, not a wash** |
| `.28` | 1 | |
| `.18` | 1 | `PlaybackView.tsx:249` |
| `.10` | 1 | `fnbl-theme.ts` `--wash-2` |

38 occurrences, 15 files.

### Category A — the 18 that are the locked values (NO design judgement)

`.12` is old `hair`; `.22` is old `hairstrong`. These are not a design decision — they
are sites the hex-based worklist could not see. Apply the already-locked mapping:

- `rgba(199,203,247,.12)` → `rgba(255,255,255,.08)`
- `rgba(199,203,247,.22)` → `rgba(255,255,255,.16)`

Prefer a token or `var()` over a literal **where that is actually safe** (see the
self-cycle trap below). In `.tsx` arbitrary-value classes like
`bg-[rgba(199,203,247,.12)]` on a progress track, `bg-hair` is the right replacement;
for a `borderColor` style fallback, `var(--border, rgba(255,255,255,.08))`.

Known Category A sites (re-verify, line numbers shift):
`app/(artist)/earnings/page.tsx:158`, `app/(artist)/vault/[projectId]/readiness/page.tsx:199,216`,
`components/coach/RightsCoach.tsx:98`, `components/benchmarks/BenchmarkView.tsx:201`,
`components/playbook/AccessEditorMatrix.tsx:113`,
`components/admin/HealthRulesForm.tsx:137,301,305,338,350`,
`components/admin/console-theme.ts:25`, `components/selects-player/theme.ts:22,81`,
`components/buyer/fnbl-theme.ts:22`.

### ⚠️ The CSS custom-property self-cycle trap

`console-theme.ts`, `fnbl-theme.ts` and `selects-player/theme.ts` each redefine
custom properties **inside their own class scope**. Where the local name matches the
global name, `--border: var(--border)` is a self-reference — invalid at
computed-value time, and it fails silently in a way no test can see. PR #118 already
hit this with `--lav` in `selects-player/theme.ts` and used a literal there.

- `console-theme.ts` defines `--border` and `--border-2` → `--border` **must** use a
  literal. Use literals for both, so the block stays internally consistent.
- `selects-player/theme.ts` defines `--border` and `--border2` → same, use literals.
- `fnbl-theme.ts` defines `--line`, `--line-2`, `--wash-2`, `--ink-3` → different
  names from the globals, so `var(--border)` / `var(--border-strong)` are safe here.

If in doubt, use the literal. A silently-wrong `var()` is worse than a literal.

### Category B — the 20 other alphas (a mapping rule, derived not invented)

The two locked conversions give two data points: `.12 → .08` and `.22 → .16`. A linear
fit through them is `α' = 0.8α − 0.016`. Do **not** apply that blindly — it sends the
Rail2 hover wash from `.05` to `.02`, which would make a hover state nearly invisible.

Policy, by what the value actually does:

1. **Low-alpha washes (`α ≤ .10`): keep the alpha, swap the hue to white.**
   At those alphas the hue contribution is imperceptible, and preserving the alpha
   preserves the interaction feedback. So `rgba(199,203,247,.05)` →
   `rgba(255,255,255,.05)`, `.10` → `rgba(255,255,255,.10)`.
   This covers all 10 `Rail2.tsx` hovers and `fnbl-theme.ts`'s `--wash-2`.
2. **Mid-alpha borders and tracks (`.14`, `.16`, `.18`, `.28`): use the linear fit,
   rounded to two decimals** — `.14 → .10`, `.16 → .11`, `.18 → .13`, `.28 → .21`.
   These sit between the two locked anchors, so the fit is interpolation, not
   extrapolation.
3. **`fnbl-theme.ts` `--ink-3` at `.55` is TEXT, not a wash.** Do not run it through
   the wash rule — white at `.55` on the buyer portal is a readability change, not a
   hue change. Set it to `var(--lav-dim)` (`#8b8b97`), the palette's existing
   tertiary-text token, which is what it was standing in for. **Call this out
   explicitly in the PR body as the one judgement call in the task.**

### Close the guard hole

Extend `__tests__/palette-single-source.test.ts` (do not create a second guard file)
with a scan that fails on **any** `rgba(199, ?203, ?247, …)` at **any alpha** under
`app/` and `components/`, `lib/email` allowlisted exactly as the hex scan is.

The existing guard's non-vacuity discipline applies to the new scan too: it must
assert it walked a realistic file count, not merely that it found no violations.

**Dry-run the new scan against the unmodified tree first and confirm it FAILS with
the full set (expect ~38 occurrences / 15 files at `file:line` granularity — record
what you actually observe, and investigate a large shortfall rather than accepting
it).** A guard that passes before the fix proves nothing.

Also re-run the existing hex scan and the two-file agreement halves — they must stay
green throughout; this task changes no palette definition.

### Out of scope

- No change to `tailwind.config.ts` or `app/globals.css`. The seven values are locked
  and already correct on `main`.
- `lib/email/*` stays on its own colours (inbox clients invert dark backgrounds).
- Nothing under `private/` or `docs/design/`.
- Accent rgba families — `rgba(52,211,153,…)`, `rgba(245,158,11,…)`,
  `rgba(244,63,94,…)`, `rgba(129,140,248,…)`, `rgba(217,70,239,…)` — are **accents**
  and must not be touched. Only the lavender `199,203,247` family moves.

</decisions>

<specifics>
## Specific Ideas

Branch `neutral-lavender-washes` is already created and checked out, forked fresh from
`origin/main` at `1728a221`.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Do **NOT** run `npm run build` (live dev server on :3000; also not part of validate).
`main` is protected — ship through a PR. Never `git add -A`.

**PR body must state:** that PR #118's guard had a hex-only blind spot and this closes
it; the 18 Category-A sites that were the locked values all along; the Category-B
mapping rule *and where it was deliberately not applied*; the `--ink-3` judgement
call; the observed pre-fix violation count; and that the buyer portal (`fnbl-theme`),
the admin console (`console-theme`), the Playbook Rail2 hovers and the Selects player
are the surfaces most changed and worth eyeballing on the Vercel preview.

</specifics>

<canonical_refs>
## Canonical References

- `__tests__/palette-single-source.test.ts` — the guard to extend (added in PR #118)
- `tailwind.config.ts`, `app/globals.css` — the locked palette; read-only here
- PR #118 / commit `1728a221` — the repaint this finishes
- `.claude/CLAUDE.md` — Verification Gate, branch protection, never `git add -A`

</canonical_refs>
