---
task: catalogue-withheld-empty-state-copy
date: 2026-11-23
mode: quick
status: complete
branch: fix/catalogue-withheld-copy
base: e057a543
---

# Two copy defects in the WITHHELD catalogue empty state

Found while running what the plan called the "owner browser UAT" for 50.5A. The UAT itself
**passed** — the state that renders locally is the genuine-empty one, reading "Nothing in here yet"
with correct apostrophes — but reading the adjacent branch turned up two defects in the copy that
renders when rows exist and are suppressed.

## Defect 1 — a literal escape in a JSX text node

`components/buyer/CatalogBrowserLight.tsx:710` contained `’` as six literal characters inside a
**JSX text node**. JSX text is not a JS string literal, so the escape is never interpreted and a
buyer reads `you’re`. Proven by compiling both forms rather than by inspection:

| source form | emitted string |
|---|---|
| real `’` | `"you’re looking"` (one escape, renders as the character) |
| literal `’` | `"you\\u2019re looking"` (escaped backslash, renders literally) |

The same line's `syncContactHref('What I’m looking for')` **is** a JS string literal, so it
resolved correctly, but it is normalised too so the file has one convention. The genuine-empty branch
below it already used the real character and was left alone.

**Enumerated rather than assumed:** a repo-wide sweep of every `.ts`/`.tsx` outside `node_modules`
found 9 raw matches for a literal `\uXXXX`, of which **8 are inside regex literals**
(`/[̀-ͯ]/g` and similar) where the escape is correct and intended. Exactly one was a JSX
text node. This is a single defect, not a pattern.

## Defect 2 — the CTA said twice, in two voices

`CATALOGUE_WITHHELD_BODY` ended with *"Tell us what you are looking for and we will come to you with
songs that fit."* and the JSX then appended a link saying the same thing again, so the paragraph
instructed the buyer twice. The constant now ends at *"...so every row names one exact song."* and
the link carries the CTA, matching how the genuine-empty branch flows its sentence into its link.

## What this does not prove

There is no jsdom in this repo, so no test can assert the rendered output. The evidence is the
absence of a literal escape in any JSX text node, the seam tests that decide **which** branch
renders, and the full validate gate. The withheld branch could not be observed locally because
`sync_listings` has no rows, and seeding fake listings for UAT was ruled out by the owner.

## Correction recorded

An earlier claim in this session that the broken string was "live in production for every buyer"
was unverified. The broken string sits on the withheld path, which renders only where listings exist
and are suppressed. Reachable in production, not necessarily rendering today.

## Verify

- `npm run typecheck:strict` — PASS
- `npm run lint` — PASS, zero warnings
- `npm test -- --runInBand` — 695 suites, 8941 tests, all pass (unchanged from base, so nothing
  depended on the old wording)
