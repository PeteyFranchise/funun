# The marketing page's Selects example has drifted from the real player

**Captured:** 2026-10-05 · **Status:** PARKED. Leave the marketing page exactly as it is.
**Owner, 2026-10-05:** *"Leave the selects example on the marketing page as it is for now, and
just make a note to revisit this issue at some other time in the future."*

**Nothing in the marketing pipeline was changed.** No bench edit, no re-freeze. The page ships
today exactly as it did before this was noticed.

## What was found

`.selects` in `private/bench/marketing.html` (line ~439) hardcodes its own palette on purpose —
the block's own comment explains why: *"The player ships its OWN palette (theme.ts) and it is not
this page's… using the marketing tokens is what made it look like a different product. Third
divergence caught between the mock and the component; the component has won all three."*

**It has since lost a fourth.** Measured against `components/selects-player/theme.ts`:

| | Marketing mock | Real component |
|---|---|---|
| ground | `#08070d` | `#08070d` ✓ |
| panel | `#0E0D1E` | **`var(--card)`** |
| panel2 | `#151330` | `#151330` ✓ |
| text | `#C7CBF7` | **`#d4d4d8`** |
| border | `rgba(199,203,247,.12)` | **`rgba(255,255,255,.08)`** |
| border2 | `rgba(199,203,247,.22)` | **`rgba(255,255,255,.16)`** |
| — | absent | `panel3 #1c1940`, `lavdim2 #6a6d99` |

**Every mismatched value is from the retired indigo-tinted palette.** The component moved to
neutral surfaces and neutral hairlines; the marketing page still advertises the purple-tinted
version. **Owner has confirmed the component is the source of truth** — if this is ever
reconciled, the mock follows `theme.ts`, not the other way round.

Note `--spanel` and `--sgreen` are declared but **used zero times** in the bench, so two of those
mismatches are dead declarations rather than visible drift.

## Why nothing catches it

The palette guard scans only `.ts`/`.tsx` utility classes. The bench is gitignored. The artifact
is HTML. And this block is *deliberately exempt* from the page's own tokens. So it is invisible
to every check in the repo — which is why it has drifted four times.

## Also found, also parked

**The marketing page never fully converted to the neutral palette.** It declares `--lav:#d4d4d8`
(neutral) and then uses `rgba(199,203,247,…)` — retired lavender — in **18 places**, only 2 of
them inside `.selects`. They sit on pricing-card borders, the Team CTA hover, badge backgrounds,
section dividers, dashed outlines and gradient fades. **Ten of those lines are live in the shipped
artifact.** Same shape as the sixteen indigo literals found in the app on 2026-09-30: a correct
token system with hand-written literals underneath it that no guard can see.

Converting them is a **visible change** to the public page (purple-tinted hairlines become
neutral), not a correction — it needs the owner's eyes on a render first, which is why it was not
bundled with anything.

## A second-order effect worth knowing before any of this is picked up

`theme.ts` declares `--panel:var(--card)`. **The real Selects player's panel IS the app's card
token.** Gate 0 lifted `--card` from `#0a0a0c` to `#121214` on 2026-10-05, so the live player's
panels lift with it — including on share links already sent. That is a consequence of a decision
made about catalogue cards, and it lands whether or not this todo is ever actioned.

## If picked up, it is one re-freeze covering

1. resync the four drifted `.selects` values to `theme.ts` (and add the two missing, if used)
2. correct the block's comment — it currently cites *"a true lavender #C7CBF7"* as deliberate,
   which will cause the next person to "fix" it back
3. optionally, `--card` → `#121214` so the page stops diverging from the app
4. optionally, the 18 retired-lavender literals

**Must run on the main checkout** — `private/` is gitignored, so a worktree has no bench source.
Full re-freeze procedure applies: update `FROZEN_SHA256` and `FROZEN_LINE_COUNT` in
`scripts/marketing-assets.ts` → `npm run marketing:assets` → `build-marketing-artifact.ts` →
`verify-marketing-artifact.ts` → update `private/bench/baseline/FROZEN.sha256`.

## Related

- `components/selects-player/theme.ts` — the source of truth
- `.planning/design/phase-31-shareable-music-player.html` — the locked build reference the
  component was lifted from
- `.claude/skills/label-integrity-funun/`
