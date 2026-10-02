---
phase: quick/261001-cmt
plan: 01
subsystem: marketing-artifact-build
tags: [tokenizer, state-machine, html, css, js, security, information-disclosure]

requires:
  - phase: quick/260930-ibp
    provides: "sanitize() pipeline, PROHIBITED_LITERALS verifier, manifest build"
  - phase: quick/261001-rlp
    provides: "head metadata (og:image/twitter:image/favicon/apple-touch-icon), PR #130"
provides:
  - "Exported, independently-tested comment tokenizer (stripHtmlComments / stripCssComments / stripJsComments / stripHtmlCssJsComments) in scripts/build-marketing-artifact.ts"
  - "sanitize() wired to the general strip; seven one-off comment strips retired"
  - "Regenerated assets/marketing/landing.html with zero developer comments"
  - "Permanent leak-closed and parse-proof test assertions over the real artifact"
affects: [marketing-artifact-build, public-marketing-page]

tech-stack:
  added: []
  patterns:
    - "Hand-written comment-syntax state machine (not regex) for HTML/CSS/JS, comment-state-tested-before-string-state"
    - "Exact-count assertion (throw on drift) as the file's own contract for comment volume, replacing bespoke anchored removals"

key-files:
  created: []
  modified:
    - scripts/build-marketing-artifact.ts
    - scripts/marketing-artifact.test.ts
    - assets/marketing/landing.html

key-decisions:
  - "Comment state is tested before string state throughout (56 quote characters live inside comments in the real input)"
  - "The general strip runs after every anchored removal in sanitize() and before rewriteAssetPaths (F-07: four anchors are themselves comments gating removal of real CSS/JS)"
  - "CSS/HTML comments delete outright; JS line comments end before their newline (ASI); JS block comments collapse to \\n (multiline) or a single space (single-line) -- D-03"
  - "Deleted D-05's VOICES_FALLBACK_COMMENT prose-edit along with its replaceExactly call -- the mechanism it described is already asserted directly by the onerror removeAllMatches call"
  - "Deleted all 15 now-orphaned module constants (13 from the seven retired strips + 2 VOICES_FALLBACK constants); typecheck:strict's noUnusedLocals confirms none were missed"

requirements-completed: [CMT-01, CMT-02, CMT-03, CMT-04, CMT-05, CMT-06, CMT-07]

duration: ~35min
completed: 2026-10-01
status: complete
---

# Quick Task 261001-cmt: Strip developer comments from the marketing artifact Summary

**A hand-written HTML/CSS/JS comment tokenizer now strips every developer comment from the
public marketing page in one general pass, retiring seven accumulated one-off anchored strips
(six named in the brief plus `PLACEHOLDER_MARKER`, which the brief missed) and shrinking the
artifact from 122,209 to 101,937 chars (125,172 to 102,079 bytes). Tasks 1 and 2 are complete and
committed; the plan's blocking browser-identity checkpoint (Task 3) is explicitly owner-run and
has not been executed by this session — see "What remains" below.**

## Performance

- **Duration:** ~35 min (two task commits, 18 min apart, plus investigation/verification time)
- **Tasks:** 2 of 2 automated tasks complete (Task 3 is a `checkpoint:human-verify`, owner-run)
- **Files modified:** 3 (`scripts/build-marketing-artifact.ts`, `scripts/marketing-artifact.test.ts`,
  `assets/marketing/landing.html`)

## Accomplishments

- **Task 1 — the tokenizer.** Four pure, exported functions (`stripHtmlComments`,
  `stripCssComments`, `stripJsComments`, `stripHtmlCssJsComments`) implementing a hand-written
  state machine (code / single-quote / double-quote / template-with-nested-`${}`-substitutions /
  regex-with-character-class-tracking / line-comment / block-comment). Comment state is checked
  before string state throughout, so a quote character inside a comment is never read as opening
  a string — the real input carries 56 such quote characters. The regex-vs-division heuristic uses
  the previous significant token (`( , = : [ ! & | ? { } ; + - * % < > ~ ^` or a keyword like
  `return`/`typeof`, or nothing preceding) and is documented with its one known limit (`}` is
  genuinely ambiguous in real JS; this implementation treats it as regex-opening, matching the
  real input's zero occurrences where it would matter). 41 new unit tests (58 → 99) cover every
  named case from the plan's `<behavior>` list, including the `/"/g` regex-literal trap and its
  inverse (quotes inside comments).
- **Task 2 — wiring and regeneration.** `sanitize()` now calls the general strip exactly once,
  immediately after the `ASSET_V` + `IMAGE_ERROR_LISTENER` injection and before
  `rewriteAssetPaths` — the one ordering that is both safe (after every anchor that is itself a
  comment: `SHIP_GATE_BLOCK_START`, `DEV_GUARD_SCRIPT_START`, `SHIP_TOGGLE_SCRIPT_START`,
  `AUTH_IIFE_START`) and correct (before a comment naming an asset path could reach the manifest
  allowlist gate). The seven strips and their 15 orphaned constants are deleted. A new
  `EXPECTED_COMMENT_STRIP_COUNTS` constant asserts the exact tokenizer counts and throws a message
  telling the maintainer to bump one integer, not write another anchored removal. The header
  comment contract is amended to say a tokenizer now exists and why.
- **Regeneration matched every prediction exactly:** tokenizer counts 21 / 60 / 153 / 0 / 1 / 2
  (htmlComments / cssBlockComments / jsLineComments / jsBlockComments / scriptRegions /
  styleRegions); artifact size 1827 lines / 101,937 chars (char saving 20,272, matching the
  objective's stated figure exactly) / 102,079 bytes (byte saving 23,093). `marketing:build`,
  `marketing:verify`, and `marketing:assets:check` all exit 0.
- **Permanent test assertions added** to the real-artifact describe block: `node --check` on the
  extracted `<script>` body with a positive control (drop the final `}`, confirm it throws); the
  D-06 leak literals (the four internal source paths, `counsel/BD`, the invented `4-8 weeks`
  figure) plus the date-stamped-`.md` filename pattern the `.planning/` prefix ban misses (F-03a);
  an independent dumb-regex comment-free cross-check (zero `<!--` anywhere, zero `/*` in either
  `<style>` body, zero `/*`/`//` in the `<script>` body); survival of the nonce placeholder
  (exactly 1), all six `art:'` strings (3 with `&mdash;`), all four JS regex literals, and the
  manifest shape (50 assets, 7 fonts, `nonceScriptCount` 1).
- **Pure-deletion proof (offline, throwaway script, not committed).** A direct comparison of
  `stripHtmlCssJsComments(previousArtifact)` against the newly regenerated artifact diverges at
  exactly 4 locations, totaling 26 characters — all whitespace, all fully explained by F-06's
  documented ordering quirk: four of the seven retired anchors (`STEP_BADGE_DECISION`,
  `HERO_TABS_DECISION`, `REVERT_NOTE`, `VOICES_PLACEHOLDER`) had end-anchors that also consumed a
  trailing newline (or, for `VOICES_PLACEHOLDER`, the newline plus its 2-space indent) that the
  general strip deliberately does not consume. A secondary git-diff-hunk-based check (129 hunks)
  found zero deleted spans that fail to open with `//`, `/*`, or `<!--`.

## Task Commits

1. **Task 1: Build and unit-test the comment tokenizer** - `0e25e0cf` (test) — tokenizer + 41 new
   unit tests; `sanitize()` untouched at this point (confirmed via diff inspection).
2. **Task 2: Wire the strip into sanitize(), retire the seven strips, regenerate and prove** -
   `927eb457` (feat) — wiring, constant deletion, header amendment, regenerated artifact, 5 new
   permanent test assertions.

**Plan metadata:** not committed by this session — see "What remains" below.

## Files Created/Modified

- `scripts/build-marketing-artifact.ts` - adds the tokenizer primitives, `CommentStripCounts`
  type, `EXPECTED_COMMENT_STRIP_COUNTS` + `assertCommentStripCounts`; wires the strip into
  `sanitize()`; deletes 15 orphaned constants; amends the header contract; adds comment-strip
  counts to the CLI's final `console.log`.
- `scripts/marketing-artifact.test.ts` - 41 new unit tests for the tokenizer (Task 1) + 5 new
  permanent assertions over the real generated artifact (Task 2.8).
- `assets/marketing/landing.html` - regenerated: 1897→1827 lines, 122,209→101,937 chars,
  125,172→102,079 bytes.

## Decisions Made

- Followed the plan's D-01 through D-08 as written (naming, ordering, whitespace policy, exact-
  count assertion, D-05's VOICES_FALLBACK deletion, leak-assertion targets, D-07's region-split
  precedent, D-08's throw-not-guess contract). No deviations from the plan's own decisions.
- For the `}`-after-regex-opening limit (F-02's documented ambiguity), added `}` to the
  implementation's regex-preceding-character set per the plan's explicit instruction, with the
  limit documented in a comment above `stripJsComments` as directed.

## Deviations from Plan

None - plan executed exactly as written. (One clarification, not a deviation: F-08 estimated "14"
orphaned constants; the actual count was 15 — both `VOICES_FALLBACK_COMMENT_ORIGINAL` and
`VOICES_FALLBACK_COMMENT_UPDATED` became unused once D-05's `replaceExactly` call was deleted,
not only the `_UPDATED` one F-08 named. `typecheck:strict`'s `noUnusedLocals` is the actual
enforcement mechanism here, not the F-08 estimate, and it passes with zero unused locals.)

## Issues Encountered

The plan's literal ask for a "zero insertions" pure-deletion diff proof (2.7) needed one round of
diagnosis: a naive line-based `git diff` initially appeared to show ~126 "modified" lines and a
character-level two-pointer resync approach produced spurious false-positive "insertions" on
templated/repeated content (e.g. the roster array). Neither was a real defect — both were diffing-
methodology artifacts. The reliable proof ended up being a direct comparison of
`stripHtmlCssJsComments(oldArtifact)` against the new artifact, which isolated the true difference
to exactly 4 locations / 26 characters, all independently explained by the F-06-documented anchor-
newline-consumption asymmetry. Full reasoning is in this session's transcript; the throwaway
scripts used were written under the scratchpad and were never committed, per the plan's
instruction.

## User Setup Required

None - no external service configuration required.

## What remains (owner-run, by design)

**Task 3 — the blocking browser-identity checkpoint — was not executed by this session**, per
explicit instruction: "The plan's blocking browser checkpoint is MINE, not yours... Then STOP and
report." Everything up to it is done: the tokenizer, its unit tests, the seven retired strips, the
regenerated artifact, every static assertion in the plan's verification table, the `node --check`
proof, and the full CI validate-job gate (all six commands, all green — see below). The owner
still needs to:

1. Serve `before.html` (the previous committed artifact, `git show HEAD~1:...`, note: `HEAD` as of
   this summary is `927eb457`, so the previous artifact is at `0e25e0cf`'s parent,
   i.e. `git show 0e25e0cf^:assets/marketing/landing.html`) and `after.html` (the current
   `assets/marketing/landing.html`) side by side per the plan's Task 3 instructions.
2. Compare `document.querySelectorAll('*').length`, `document.body.textContent.length`, and the
   summed `cssRules.length` across both pages in a real browser — they must be identical.
3. Confirm zero Console errors on `after.html` and that the hero tabs / differentiator tabs look
   the same.

No PR has been opened and no push has been made, per instruction ("Do NOT push and do NOT open
the PR — the orchestrator does that").

## Full Verification Gate (run locally, all green)

```
npm run security:migrations:verify   → PASS
npm run typecheck:strict             → clean (0 errors; confirms no orphaned constants)
npm run lint                         → clean (--max-warnings=0)
npm test -- --runInBand              → 638 suites / 7958 tests passed
npm audit --omit=dev --audit-level=moderate → 0 vulnerabilities
npm audit --audit-level=high         → 0 vulnerabilities
```

`npm run build` was not run (dev server owns `.next`), per instruction.

## Task-specific verification (plan's own table)

| # | check | result |
|---|---|---|
| V-1 | bench sha256 / line count, before and after | `47e284e999ec…` / 2167, unchanged both times |
| V-2 | `FROZEN_SHA256` / `FROZEN_LINE_COUNT` in `marketing-assets.ts` | unchanged; file not staged |
| V-3 | `git diff --stat scripts/verify-marketing-artifact.ts` | empty |
| V-4 | tokenizer counts at the strip point | 21 / 60 / 153 / 0 / 1 / 2 — exact match |
| V-5 | artifact size | 1827 lines, 101,937 chars; 102,079 bytes (`wc -c`); byte saving 23,093 |
| V-6 | pure-deletion diff vs prior artifact | see "Issues Encountered" — isolated to 4 fully-explained whitespace locations (26 chars), 0 non-comment-opener deleted spans |
| V-7 | `node --check` on the stripped script + positive control | passes / positive control throws |
| V-8 | leak literals + date-`.md` pattern | all 0 (set length 6 asserted first) |
| V-9 | 17 `PROHIBITED_LITERALS` | all 0, `length === 17` asserted first |
| V-10 | `__CSP_NONCE_PLACEHOLDER__` | exactly 1 |
| V-11 | `art:'` strings | 6 total, 3 containing `&mdash;` |
| V-12 | JS regex literals `/&/g`, `/</g`, `/"/g`, `/\s+/` | all 4 present |
| V-13 | #130 head metadata in `headSlice` | all present (existing tests, still passing) |
| V-14 | manifest | 50 assets, 7 fonts, `nonceScriptCount` 1, byte-identical (no diff) |
| V-15 | `npm run marketing:verify` and `marketing:assets:check` | exit 0 |
| V-16 | browser identity (Task 3) | **not run — owner-run per instruction** |
| V-17 | staged set | exactly `scripts/build-marketing-artifact.ts`, `scripts/marketing-artifact.test.ts`, `assets/marketing/landing.html` across 2 commits; `manifest.json` unchanged so not staged; the five pre-existing untracked `.planning/` files remain untracked |

## Next Phase Readiness

Tasks 1 and 2 are complete, committed, and fully gated. The quick task is not yet mergeable: the
owner must run Task 3's browser-identity checkpoint, and the PR (base `rich-link-preview-and-
favicon`, per `pr_base` in the plan frontmatter) has not been opened — both explicitly reserved
for the orchestrator/owner. `STATE.md` has not been updated with a Quick Tasks Completed row by
this session, since the task is not fully resolved pending the owner's checkpoint.

---
*Quick task: 261001-cmt*
*Completed (Tasks 1-2 only): 2026-10-01*

## Self-Check: PASSED

- FOUND: `scripts/build-marketing-artifact.ts`
- FOUND: `scripts/marketing-artifact.test.ts`
- FOUND: `assets/marketing/landing.html`
- FOUND: commit `0e25e0cf` (Task 1)
- FOUND: commit `927eb457` (Task 2)

## Added Scope (2026-10-01): hero lede clarified as remote/online

**Owner decision 2026-10-01:** the hero's neon bar-style "Writer's Room" sign reads like a
physical venue someone walks into. Owner picked option B of two drafts to clarify the room is
remote and digital. The bench edit (`private/bench/marketing.html`) was already made before this
session started — two words added to the hero A lede, `online` and `from anywhere`:

> Funūn's **online** writing room. The first built for writing a topline together **from
> anywhere**, by multiplatinum, Grammy-winning and Grammy-nominated songwriters. See who's in the
> room and who's on each section; the split sheet fills in as you write.

This session's job was the re-freeze and regeneration only (no bench edit, no verifier edit):

1. Updated `FROZEN_SHA256` (`scripts/marketing-assets.ts:42`) from `47e284e9...` to
   `6dd84209fb41b87287b51a4c89a22a28204da4509fb3868821157ac704dd86f9`, and `FROZEN_LINE_COUNT`
   (`:43`) from 2167 to 2168.
2. `npm run marketing:assets` (build mode) rewrote `manifest.sourceSha256` to the new hash — 50
   assets, 7 fonts, unchanged shape.
3. `npx tsx scripts/build-marketing-artifact.ts` regenerated `assets/marketing/landing.html`
   (101,966 bytes, 1828 lines). Comment-strip counts matched `EXPECTED_COMMENT_STRIP_COUNTS`
   exactly (html=21, css=60, jsLine=153, jsBlock=0, scriptRegions=1, styleRegions=2) — confirming
   no new sanitizer strip was needed, as expected (no new `OWNER DECISION` comment was added to the
   bench for this change).
4. `npx tsx scripts/verify-marketing-artifact.ts` passed clean (`verify ok`).
5. Updated the gitignored local baseline `private/bench/baseline/FROZEN.sha256` to the new hash.

**Verification performed:**

- New lede text (`Fun&#363;n&rsquo;s online writing room`, `together from anywhere`) each occur
  exactly once in the artifact; the old lede opening
  (`Fun&#363;n&rsquo;s writing room. The first built`) is absent (0 occurrences).
- Reader-facing em dashes remain exactly 0: 19 raw `&mdash;`/`—` occurrences in the
  comment-stripped artifact, minus 16 `pro:`/`ipi:`/`pub:` credits-table placeholders, minus 3
  `art:'…'` art-direction strings = 0. Replicated 261001-dsh's exclusion methodology inline
  (no committed reusable helper existed for it — that task's em-dash check was an inline,
  uncommitted verification script, not a permanent test function — so this session's check was
  also inline and not committed, per the task's instruction to reuse rather than re-litigate the
  methodology).
- The comment-strip invariants from this branch's prior two commits still hold: 0 occurrences of
  `OWNER DECISION`, the four internal source paths (`lib/sync-library/agreement.ts`,
  `lib/deals/catalog-sample.ts`, `lib/tools/splitsheet.ts`,
  `components/selects-player/SelectsPlayer.tsx`), `counsel/BD`, `4-8 weeks`, and the
  date-stamped-`.md` filename pattern.
- All 17 `PROHIBITED_LITERALS` (imported from `verify-marketing-artifact.ts`, length-asserted at
  17) remain 0; `verifyArtifact()` returns 0 violations.
- `__CSP_NONCE_PLACEHOLDER__` occurs exactly once.
- PR #130's head metadata intact: `og:image`, `twitter:image`, `twitter:card` =
  `summary_large_image`, `rel="icon"`, `rel="apple-touch-icon"` all present.
- Manifest shape unchanged: 50 assets / 7 fonts / `nonceScriptCount` 1; only `sourceSha256`
  changed.
- `git diff --stat`: 3 files changed, 7 insertions(+), 6 deletions(-)
  (`assets/marketing/landing.html` +4/-3, `assets/marketing/manifest.json` +1/-1,
  `scripts/marketing-assets.ts` +2/-2). The `landing.html` diff is confined entirely to the
  `<p class="lede">` block (a 3-line paragraph became 4 lines due to text reflow, no other
  content touched); the `manifest.json` diff is confined to the `sourceSha256` line.

**Full Verification Gate (re-run for this scope item, all green):**

```
npm run security:migrations:verify   → PASS
npm run typecheck:strict             → clean (0 errors)
npm run lint                         → clean (--max-warnings=0)
npm test -- --runInBand              → 638 suites / 7958 tests passed
npm audit --omit=dev --audit-level=moderate → 0 vulnerabilities
npm audit --audit-level=high         → 0 vulnerabilities
```

**Commit:** `0bd54e44` (feat) — `scripts/marketing-assets.ts`, `assets/marketing/landing.html`,
`assets/marketing/manifest.json`. Atomic, separate from the two comment-strip commits
(`0e25e0cf`, `927eb457`). Not pushed; no PR opened, per constraints.

**No new sanitizer strip was needed** — confirmed via the matching `EXPECTED_COMMENT_STRIP_COUNTS`
and the clean `verify-marketing-artifact.ts` run, rather than assumed.
