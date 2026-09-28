# Quick Task 260927-pbc: Repaint surface palette to neutral black - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Task Boundary

Repaint the Funūn surface palette to neutral black, make the palette single-sourced,
and add a guard so the two definitions cannot drift apart again.

Owner decision 2026-09-27. This is not a new direction: the Writer's Room bench
(`private/bench/index.html:23`, `body[data-ground="neutral"]`) already defines the
neutral-black ground and has it selected as that bench's default (`index.html:1092`).
The shipped app is the only surface still carrying the indigo undertone.

</domain>

<decisions>
## Implementation Decisions

### The seven value changes (LOCKED — copied from the bench, not approximated)

| token | from | to |
|---|---|---|
| `ink` | `#0a0a0f` | `#000000` |
| `card` | `#0E0D1E` | `#0a0a0c` |
| `card2` | `#1A1838` | `#161618` |
| `lav` | `#C7CBF7` | `#d4d4d8` |
| `lavdim` | `#7c80b4` | `#8b8b97` |
| `hair` | `rgba(199,203,247,.12)` | `rgba(255,255,255,.08)` |
| `hairstrong` | `rgba(199,203,247,.22)` | `rgba(255,255,255,.16)` |

Two palettes that merely *look* alike drift on the next edit. These values are copied
from the bench verbatim. Do not round, re-derive, or "improve" them.

### Do NOT change

`grad` (`linear-gradient(105deg,#818CF8,#D946EF)`), `grad-money`, `nav-rail`,
`brandindigo`, `brandfuchsia`, `money`, `money2`, `emerald`, `rose`, `amber`,
`shadow-cta`, `rounded-card`, fonts. The accents are what keep the product reading as
Funūn once the ground goes neutral — only the ground and the neutral text move.

### Two definitions exist today; both must change to the same values

1. **`tailwind.config.ts`** — the `colors` block. Feeds every `bg-card` /
   `border-hair` / `text-lavdim` utility. ~2,145 such usages across `app/` +
   `components/`; they all update for free.
2. **`app/globals.css:10-25`** — CSS custom properties consumed by hand-written CSS.
   **The names differ from the Tailwind ones**: `--bg` ↔ `ink`, `--card-2` ↔ `card2`,
   `--lav-dim` ↔ `lavdim`, `--border` ↔ `hair`, `--border-strong` ↔ `hairstrong`.
   Map them carefully. Do not rename anything in this task.

### Literal hexes → tokens

81 occurrences across 34 files. Regenerate the list before editing (line numbers and
counts shift):

```
grep -rliE "#0a0a0f|#0E0D1E|#1A1838|#C7CBF7|#7c80b4" --include=*.tsx --include=*.ts --include=*.css app components lib
```

- In `.tsx`: use the Tailwind token class (`bg-card`, `bg-card2`, `text-lav`,
  `text-lavdim`, `border-hair`, `border-hairstrong`, `bg-ink`).
- In `.css`: use `var(--card)` etc.
- Where a hex sits inside an arbitrary-value class like `bg-[#0E0D1E]`, replace the
  **whole class** with `bg-card`. Do not leave `bg-[var(--card)]`.

### Deliberate exclusions

- `lib/email/artistInvite.ts`, `lib/email/artistReopened.ts`,
  `lib/email/artistSpotOpened.ts`. These build email HTML: they cannot use Tailwind
  classes, inbox clients render and sometimes invert dark backgrounds, and a
  pure-black email is a separate design decision nobody has made. **Leave them on the
  current hexes** and record it in the PR body as a known, intentional inconsistency
  for a later decision.
- Anything under `private/` (gitignored bench) and `docs/design/` (historical design
  records). Do not touch either.

### The guard

Add `__tests__/palette-single-source.test.ts` following the boundary-test pattern this
repo already uses — `__tests__/member-api-boundary.test.ts` and
`__tests__/placements-client-server-boundary.test.ts` both `readFileSync` a protected
file and assert on its source.

(a) Read `tailwind.config.ts` and `app/globals.css`; assert the seven shared values
    agree between them, accounting for the differing property names and hex case.
(b) Scan `.tsx` / `.ts` / `.css` under `app/` and `components/`; fail on any literal
    occurrence of the five retired hexes, with `lib/email` allowlisted.

**Dry-run part (b) against the current tree FIRST and confirm it FAILS with the full
set before the fix.** A guard that passes before the fix proves nothing. Record the
pre-fix failure count for the PR body.

Keep the allowlist honest: if it needs a long exclusion list to go green, the matcher
is wrong, not the code.

### Tests that may pin the old palette

Grep the test suite for the retired hexes and for asserted colour strings before
editing, and update any test that pins the old palette **in the same commit** or the
suite will fail. `components/catalogue/TimedTrackPlayer.test.tsx` matched a palette
grep — check what it actually asserts before assuming.

</decisions>

<specifics>
## Specific Ideas

Branch is already created and checked out: `neutral-black-palette`, forked fresh from
`origin/main` at `9f840129`.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs,
not a subset:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Do **NOT** run `npm run build` — a dev server is live on :3000 and build clobbers
`.next`. `main` is protected: ship through a PR, never by pushing `main`. Never
`git add -A`.

**PR body must state:** the seven value changes; that accents and the gradient are
untouched; the pre-fix guard failure count; the `lib/email` carve-out; and — clearly —
that this is a **global visual change to every authenticated screen**, including the
sign-in and sign-up pages merged in PR #105, which are the first thing a new member
sees and should be eyeballed on the Vercel preview before merge.

</specifics>

<canonical_refs>
## Canonical References

- `private/bench/index.html:23` — `body[data-ground="neutral"]`, the source of the seven values (gitignored bench; read-only for this task)
- `private/bench/index.html:1092` — the ground toggle showing `neutral` selected as default
- `tailwind.config.ts` — palette definition 1
- `app/globals.css:10-25` — palette definition 2
- `__tests__/member-api-boundary.test.ts`, `__tests__/placements-client-server-boundary.test.ts` — the guard pattern to follow
- `.claude/CLAUDE.md` — Verification Gate, repo visibility, branch protection

</canonical_refs>
