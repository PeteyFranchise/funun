---
phase: quick/261001-rlp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/build-marketing-artifact.ts
  - scripts/marketing-artifact.test.ts
  - assets/marketing/landing.html
  - scripts/brand/generate-icons.mjs
  - public/favicon.ico
  - public/marketing/og.jpg
  - public/marketing/icon-180.png
  - public/marketing/icon-192.png
  - public/marketing/icon-512.png
autonomous: true
requirements: [RLP-01, RLP-02, RLP-03, RLP-04, RLP-05, RLP-06]
branch: rich-link-preview-and-favicon
pr_base: main

must_haves:
  truths:
    - "A link to www.funun.studio pasted into iMessage, Slack, X or LinkedIn renders a large image card carrying the owner's two lines, not a bare URL."
    - "https://www.funun.studio/favicon.ico returns the brand mark instead of 404, at 16, 32 and 48px."
    - "Every image and icon URL in the shipped head maps to a file that exists on disk, proven by a programmatic path-to-public/ mapping over the GENERATED artifact, not by reading the constants back to themselves."
    - "The OG image URL is absolute and its host comes from PRODUCTION_CANONICAL_URL, so the host is written once in this repo and the join cannot produce a doubled slash."
    - "The builder comment describes the code that now exists; the comment claiming no icon and no OG image exists is gone."
    - "The bench source is NOT re-frozen: FROZEN_SHA256 and FROZEN_LINE_COUNT are unchanged and re-proven by hashing, not assumed."
    - "The verifier was not weakened: all 17 PROHIBITED_LITERALS still count 0 and verify-marketing-artifact.ts is not in the staged set."
    - "scripts/brand/generate-icons.mjs reproduces the four committed icons byte-for-byte."
    - "Every step of CI's validate job passes locally before the PR opens."
  artifacts:
    - "scripts/build-marketing-artifact.ts (exported head-metadata constants, absoluteSiteUrl(), rewritten buildHeadMetadata(), corrected comment)"
    - "scripts/marketing-artifact.test.ts (unit tests over buildHeadMetadata() + on-disk resolution assertions over the real artifact)"
    - "assets/marketing/landing.html (regenerated; predicted 1890 -> 1897 lines, change confined to the head block)"
    - "scripts/brand/generate-icons.mjs (new, committed; the only producer of the four icon files)"
    - "public/favicon.ico, public/marketing/og.jpg, public/marketing/icon-{180,192,512}.png (new, committed)"
  key_links:
    - "build-marketing-artifact.ts:41 PRODUCTION_CANONICAL_URL -> absoluteSiteUrl() -> OG_IMAGE_URL -> the og:image and twitter:image content values (one host, one source)"
    - "build-marketing-artifact.ts:488 replaceExactly(TITLE_TAG, buildHeadMetadata()) -> the artifact head block (the ONLY writer of these tags)"
    - "build-marketing-artifact.ts:485 rewriteAssetPaths runs BEFORE :488 head injection -> head URLs never enter rewrittenAssetPaths -> never reach the manifest-allowlist gate at :537-544"
    - "verify-marketing-artifact.ts:66 ASSET_REFERENCE_RE requires /marketing/img/ or /marketing/fonts/ -> /marketing/og.jpg is out of scope -> no manifest registration required"
    - "middleware.ts:238 matcher already excludes favicon.ico and marketing/ -> both new URLs serve without an auth round-trip"
    - "middleware.ts:35 img-src 'self' -> governs <link rel=icon> fetches -> both icons are same-origin"
    - "scripts/brand/generate-icons.mjs:131-133 -> public/favicon.ico + the three PNGs (og.jpg is never touched by it)"
---

<objective>
Give the public marketing page at `/` a rich link preview and a favicon by adding the
image and icon tags that `buildHeadMetadata()` has been deliberately withholding, then
regenerate the committed artifact.

Purpose. Owner request 2026-10-01, with two copy refinements given during design:
*"I want specific messaging on the rich link preview… 'Funūn. For Artists, Producers,
Co-Writers, and their teams' somewhere in there as well"*, then *"Make the second line
read 'Make the song. Keep the record.'"* For the favicon: *"go with all six"* bars, and
*"make it look clear at every size."*

**The assets already exist on disk and are final. Do not redesign, regenerate or
re-crop them.** `public/marketing/og.jpg` cannot be reproduced headlessly (it needs
browser text rendering). The four icons CAN be reproduced — by the committed generator,
and only by it.

**This is not a re-freeze.** The three prior tasks on this pipeline (260930-sqv,
261001-hna, 261001-dsh) each moved `FROZEN_SHA256` because each edited the bench.
This one does not touch `private/bench/marketing.html`. The freeze constants stay where
they are and Task 1 re-proves that by hashing rather than asserting it.

Output: a corrected `buildHeadMetadata()`, a regenerated `assets/marketing/landing.html`,
six new committed brand files, new tests, and a PR against `main`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md

@scripts/build-marketing-artifact.ts
@scripts/verify-marketing-artifact.ts
@scripts/marketing-artifact.test.ts
@scripts/marketing-assets.ts
@scripts/brand/generate-icons.mjs
</context>

<verified_findings>

Every claim below was checked against source in this session, with the command that
checked it. This repo's standing rule is that a plan is only as true as its claims about
the code, and that a *named* result must be verified against an independent source.
Several of these answer open questions in the briefing. Read all of them before Task 1.

**V-1. The bench is already at the frozen revision and does not move.**
`shasum -a 256 private/bench/marketing.html` returns
`47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527`; `wc -l` returns
**2167**. `scripts/marketing-assets.ts:41` pins that same sha and `:43` pins
`FROZEN_LINE_COUNT = 2167`. `assets/marketing/manifest.json` records the same
`sourceSha256`, **50 assets, 7 fonts, nonceScriptCount 1**. The briefing's "no re-freeze
needed" is **confirmed, not assumed**.

**V-2. Baseline for the diff.** `assets/marketing/landing.html` is
sha256 `68c05c1ccf41877a74e48ab66f1bb27c8d6c7e2d6de370de3a793b0a73758b17`, **1890 lines**,
and the working tree is clean for every tracked file.

**V-3. The predicted artifact is 1897 lines, derived rather than guessed.**
`buildHeadMetadata()` (`:385-403`) returns an array joined with `\n` and
`replaceExactly` swaps it for the single-line `<title>` tag at `:488`. It emits **10**
entries today and will emit **17**, so the artifact gains exactly **7** lines:
1890 -> **1897**. `git diff --stat` should read **8 insertions, 1 deletion** (seven pure
adds plus the one changed `twitter:card` line). Anything else means the change escaped
the head block.

**V-4. ANSWER to briefing item 4: the manifest is NOT affected, for two independent
reasons, both measured.**
  - **Ordering.** `rewriteAssetPaths` runs at `:485`, head injection at `:488`. The new
    URLs are therefore injected *after* the rewrite pass, so they can never appear in
    `result.rewrittenAssetPaths` and can never reach the manifest-allowlist gate at
    `:537-544`.
  - **Scope.** Even ignoring order, neither regex matches. Run against the literal new
    head string, `ASSET_PATH_RE` (`build-marketing-artifact.ts:160`) returns `null` and
    the verifier's `ASSET_REFERENCE_RE` (`verify-marketing-artifact.ts:66`) returns
    `null` — both require an `img/` or `fonts/` segment, and `og.jpg` / `icon-180.png`
    have neither. `INLINE_EVENT_HANDLER_RE` (`:64`) also returns `null`.

  `npm run marketing:build` rewrites the manifest as `{...manifest, nonceScriptCount}`;
  `nonceScriptCount` stays `1` and already exists in the object, so key order and bytes
  are unchanged. **Predicted manifest diff: empty.** Task 2 proves it.

**V-5. Do NOT run `npm run marketing:assets` (build mode).** It rebuilds the manifest
from the HAR and rewrites `harCapturedAt`. Only `npm run marketing:assets:check` is in
scope. `private/bench/baseline/manifest.har` exists locally (39,267 bytes), so the check
will run.

**V-6. `new URL()` is the join that cannot produce `//marketing`.**
`new URL('/marketing/og.jpg', 'https://www.funun.studio/').href` returns
`https://www.funun.studio/marketing/og.jpg` — measured. String concatenation onto a
canonical that already ends in `/` is the trap the briefing names; this avoids it
structurally rather than by being careful.

**V-7. The icon generator is deterministic and the on-disk icons are its output.**
Hashed all four, ran `node scripts/brand/generate-icons.mjs`, hashed again: **byte-identical
on all four** (`cmp` IDENTICAL x4). Originals were backed up first and would have been
restored on any mismatch. This answers briefing item 6 ahead of time; Task 1 re-runs it
because parallel sessions make state stale.
  - `public/favicon.ico` 1,185 bytes, sha256 `9bb8d637…`
  - `public/marketing/icon-180.png` 2,151 bytes, sha256 `17127e69…`
  - `public/marketing/icon-192.png` 2,454 bytes, sha256 `4eeb063d…`
  - `public/marketing/icon-512.png` 10,425 bytes, sha256 `47e77668…`

**V-8. CORRECTION to the briefing's ICO description, verified independently of `file`.**
`file` prints `3 icons, 16x16 … 32x32` and truncates. Parsing the ICO directory
(6-byte header, then one 16-byte entry per image) returns **3 entries: 16x16 (192 B),
32x32 (382 B), 48x48 (557 B)**. The 48px entry is really there — `file`'s string is not
evidence either way, and the briefing's parenthetical "(+48)" is correct.
`generate-icons.mjs:131` confirms `icoSizes = [16, 32, 48]`.

**V-9. `public/marketing/og.jpg`: `JPEG image data, JFIF 1.01, baseline, 1200x630,
components 3`, 56,664 bytes.** Matches the briefing.

**V-10. Nothing in the app competes for `/favicon.ico`.** No `app/favicon.ico`,
`app/icon.*` or `app/apple-icon.*` exists (`ls` returns "No such file"), so Next's
file-convention handler is not in play and `public/favicon.ico` serves at the root.
`middleware.ts:238` already excludes `favicon.ico` **and** `marketing/` from the matcher
— that exclusion predates this task and was empirically verified on 2026-09-30 using
`/favicon.ico` as the negative control. Both new URLs serve with no auth round-trip.

**V-11. CSP allows both icon fetches.** `middleware.ts:35` sets
`img-src 'self' data: blob: https:`. `<link rel="icon">` fetches are governed by
`img-src`; both icons are same-origin. No CSP edit is needed and none is in scope.
(`og:image` is never fetched by the visitor's browser — only by remote scrapers — so CSP
is irrelevant to it.)

**V-12. `next.config.mjs` needs no change.** Its `outputFileTracingIncludes` entry for
`/marketing-document` exists because the route reads `landing.html` and `manifest.json`
through a `process.cwd()` path the tracer cannot see. `public/` is Next's static
directory, served by the platform's static layer, not traced into the serverless bundle
— which is why `/marketing/img/face-01.jpg` already returns 200 live.

**V-13. `generate-icons.mjs` has NO static gate, and that is a fact about the gate, not
about the file.** `npm run lint` passes `--ext .js,.jsx,.ts,.tsx` — `.mjs` is excluded.
`tsconfig.json` `include` is `["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`
— `.mjs` is excluded there too. Neither lint nor typecheck will ever look at this file.
Its only real gate is the determinism re-run in Task 1 plus the format assertions.
Do not read a green CI as coverage of it.

**V-14. The generator contains the literal `OWNER DECISION`. That is fine and must not be
"fixed".** `PROHIBITED_LITERALS` is enforced by `verify-marketing-artifact.ts` against
`assets/marketing/landing.html` only. A TypeScript/JS source comment never reaches the
artifact. `PROHIBITED_LITERALS.length === 17`, confirmed by importing it.

**V-15. The stale comment is `build-marketing-artifact.ts:386-390`**, five lines, inside
`buildHeadMetadata()` and above the `return`. It is the first thing a reader of that
function sees and it now contradicts the code below it.

</verified_findings>

<decisions>

| ID | Decision |
|----|----------|
| D-01 | `twitter:card` becomes `summary_large_image`. The small square card is the wrong frame for a 1200x630 image. |
| D-02 | `og:image` and `twitter:image` carry the **absolute** URL. Most scrapers do not resolve a relative `og:image` against the page URL; a relative value is the single most common way a card silently renders blank. |
| D-03 | That absolute URL is built with `new URL(path, PRODUCTION_CANONICAL_URL)`, so the host is written exactly once in this repo (V-6). No second hardcoded host. |
| D-04 | Icon `href`s stay root-relative (`/favicon.ico`, `/marketing/icon-180.png`). The browser resolves them against the served document; absolute URLs would buy nothing and add a second place for the host to drift. |
| D-05 | Exactly these seven additions, no more: `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:image`, `rel="icon"`, `rel="apple-touch-icon"`. No `og:image:type`, no `twitter:image:alt`, no web app manifest. The acceptance criterion is "exactly one each"; an unrequested extra makes that assertion a superset of what was asked for. |
| D-06 | `og:image:alt` is `Funūn. For Artists, Producers, Co-Writers and their teams. Make the song. Keep the record.` — the owner's two lines, describing what the card actually shows. No em dash (261001-dsh), no double quote (it sits inside a `content="…"` attribute). |
| D-07 | The stale comment is **rewritten**, not deleted. A reader needs to know why the OG URL is absolute and the icon URLs are not; that is the non-obvious part. |
| D-08 | `buildHeadMetadata` becomes an export so the head block is unit-testable directly, without regenerating a 1890-line artifact to find out whether one meta tag is right. |

</decisions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Prove the preconditions, then add the image and icon tags to buildHeadMetadata()</name>
  <files>scripts/build-marketing-artifact.ts, scripts/marketing-artifact.test.ts</files>

  <behavior>
    - `absoluteSiteUrl('/marketing/og.jpg')` returns `https://www.funun.studio/marketing/og.jpg`.
    - The returned URL, with the `https://` scheme stripped, contains no `//` anywhere (the doubled-slash trap).
    - The returned URL starts with `PRODUCTION_CANONICAL_URL`, proving the host has one source and is not typed a second time.
    - `buildHeadMetadata()` returns a block containing exactly one each of `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:image`, `rel="icon"` and `rel="apple-touch-icon"`.
    - That block declares the large-image Twitter card type and contains no `<meta name="twitter:card" content="summary">`.
    - `og:image:width` is 1200 and `og:image:height` is 630, matching the real file (V-9).
    - Every local asset path the block references maps to an existing file under `public/`.
  </behavior>

  <action>
Step 1 — preconditions, in this order, before editing anything. Parallel sessions make
state stale, so re-measure rather than trusting V-1 through V-7.

  a. `shasum -a 256 private/bench/marketing.html` and `wc -l < private/bench/marketing.html`.
     Must be `47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527` and `2167`.
     **If either differs, STOP and report.** Someone re-edited the bench and this plan's
     "no re-freeze" premise is dead.
  b. Record `shasum -a 256 assets/marketing/landing.html` and `wc -l` (expect
     `68c05c1c…` / 1890) and `git status --short`.
  c. **Non-vacuity control.** Run `npm run marketing:build` with the builder **unchanged**,
     then `git diff --stat assets/marketing/`. It must be **empty**. This proves the
     committed artifact is already in sync with the bench, so any diff after step 3 is
     caused by your edit and nothing else. If it is not empty, STOP and report what moved.
  d. Hash the four icon files, run `node scripts/brand/generate-icons.mjs`, hash again.
     All four must be byte-identical (V-7). Also confirm `public/marketing/og.jpg` was
     untouched by that run — the generator writes only the ICO and the three PNGs
     (`generate-icons.mjs:131-133`). Report the before/after hashes either way.
  e. Confirm the five asset files are the expected formats by parsing, not by eye:
     `file` for the PNGs and the JPEG (expect 1200x630 for the JPEG), and read the ICO
     directory count and per-entry sizes from the header bytes (expect 3 entries:
     16, 32, 48 — V-8). `file` truncates its ICO description, so do not rely on its string.

Step 2 — add the head-metadata constants and the URL helper to
`scripts/build-marketing-artifact.ts`, immediately below `PRODUCTION_DESCRIPTION`
(currently ending at `:45`). Export all of them so the tests import the canonical values
rather than retyping predicates:

  - `OG_IMAGE_PATH` = the root-relative path to the card under `public/`.
  - `OG_IMAGE_WIDTH` = `'1200'`, `OG_IMAGE_HEIGHT` = `'630'` (D-05, matching V-9).
  - `OG_IMAGE_ALT` = the D-06 string, verbatim.
  - `FAVICON_PATH` = the root-relative `.ico` path.
  - `APPLE_TOUCH_ICON_PATH` = the root-relative 180px PNG path.
  - `TWITTER_CARD_TYPE` = the large-image card value (D-01).
  - `absoluteSiteUrl(path: string): string` — one line, `new URL(path, PRODUCTION_CANONICAL_URL).href`
    (D-03, V-6). Do not hand-join strings.
  - `OG_IMAGE_URL` = `absoluteSiteUrl(OG_IMAGE_PATH)`.
  - `HEAD_LOCAL_ASSET_PATHS: readonly string[]` = the three root-relative paths above, in
    a stable order. This is the list Task 2's on-disk resolution test walks.

Step 3 — rewrite `buildHeadMetadata()` (`:385-403`).

  - Change its signature to `export function buildHeadMetadata()` (D-08).
  - **Delete the five-line comment at `:386-390`** — the one asserting that no icon file
    exists anywhere in the repo and that no card image has been chosen, and deferring the
    question to a checkpoint. That checkpoint is resolved. Replace it with a comment that
    states (i) what now exists on disk and at what dimensions, (ii) that the card URL is
    absolute **because remote scrapers do not reliably resolve a relative one against the
    page URL** (D-02) — use the word `scrapers` so the reason is greppable, (iii) that the
    host is derived from `PRODUCTION_CANONICAL_URL` through `absoluteSiteUrl` so it is
    written once and the join cannot double the slash (D-03), and (iv) that the icon hrefs
    stay root-relative because the browser resolves them against the served document (D-04).
  - Emit the array in exactly this order, 17 entries, so the diff stays in contiguous hunks:
      1. `<title>` · 2. `description` · 3. `canonical`
      4. `<link rel="icon" href="/favicon.ico" sizes="any">`
      5. `<link rel="apple-touch-icon" href="/marketing/icon-180.png">`
      6. `og:type` · 7. `og:title` · 8. `og:description` · 9. `og:url`
      10. `og:image` (absolute) · 11. `og:image:width` · 12. `og:image:height` · 13. `og:image:alt`
      14. `twitter:card` (large-image value) · 15. `twitter:title` · 16. `twitter:description`
      17. `twitter:image` (absolute, same URL as 10)
  - Build every value from the constants added in step 2. Do not inline a literal URL,
    width, height or alt string into the template.

Step 4 — add a `describe('head metadata — rich link preview and icons')` block to
`scripts/marketing-artifact.test.ts`, placed after the existing `injectNoncePlaceholder`
describe and before the `verifyArtifact` describe. Import `buildHeadMetadata`,
`absoluteSiteUrl`, `OG_IMAGE_URL`, `OG_IMAGE_WIDTH`, `OG_IMAGE_HEIGHT`, `OG_IMAGE_ALT`,
`TWITTER_CARD_TYPE`, `HEAD_LOCAL_ASSET_PATHS` and `PRODUCTION_CANONICAL_URL` from
`./build-marketing-artifact`. Cover every bullet in `<behavior>`. Use
`countOccurrences` (already imported) for the exactly-one assertions so the predicate is
the one the rest of this suite uses. For the no-doubled-slash assertion, strip the
scheme first and assert the remainder has no `//` — asserting on the raw href would
match `https://` and pass vacuously.

Every new import must be used; `npm run lint` runs at `--max-warnings=0` and
`typecheck:strict` adds `noUnusedLocals`.

Do not touch `private/bench/marketing.html`, `scripts/verify-marketing-artifact.ts`,
`scripts/marketing-assets.ts`, `middleware.ts` or `next.config.mjs` (V-10 through V-13).
  </action>

  <verify>
    <automated>npx tsc --noEmit --noUnusedLocals --noUnusedParameters && npx jest scripts/marketing-artifact.test.ts --runInBand && ! grep -q 'omit <link rel="icon">' scripts/build-marketing-artifact.ts && grep -q 'scrapers' scripts/build-marketing-artifact.ts && test "$(shasum -a 256 private/bench/marketing.html | cut -c1-64)" = "47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527"</automated>
  </verify>

  <done>
    Preconditions a-e all reported with measured values. The unchanged-build control (1c)
    produced an empty diff. The four icons re-generated byte-identically. `buildHeadMetadata`
    is exported, emits 17 entries built from exported constants, and its comment describes
    the code that exists. The new test block passes. Typecheck is clean under strict flags.
    The bench hash is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regenerate the artifact and prove every head URL resolves to a real file</name>
  <files>assets/marketing/landing.html, scripts/marketing-artifact.test.ts</files>

  <action>
Step 1 — extend the existing `describeIfArtifact('the real generated artifact')` block
(`scripts/marketing-artifact.test.ts:460`) with assertions over the GENERATED output.
These must read the artifact, not the constants, or they prove nothing (briefing item 2:
*"assert that programmatically by mapping the URL path back to `public/`, not by eye"*).

  - Slice the head metadata block out of `html`: from the start of the file to the index
    of the first `<style`. Every assertion below runs on that slice, so a stray match
    deeper in the 1890-line body cannot make a check pass.
  - Exactly one each, via `countOccurrences` on the slice: `og:image"`, `og:image:width`,
    `og:image:height`, `og:image:alt`, `twitter:image`, `rel="icon"`, `rel="apple-touch-icon"`.
    (Match `og:image"` with the closing quote for the first one, or the bare `og:image`
    count is 4, not 1 — the three sub-properties contain it as a prefix. Assert `og:image`
    as a prefix equals 4 as well, so the relationship is pinned rather than dodged.)
  - The card type is the large-image value, and `<meta name="twitter:card" content="summary">`
    does not appear anywhere in the artifact.
  - **The resolution test.** Extract, from the head slice: the `content="…"` value of every
    `<meta property="og:image">` and `<meta name="twitter:image">`, and the `href="…"` value
    of every `<link>` whose `rel` contains `icon` (this deliberately excludes
    `rel="canonical"`, whose href is the site root and not an asset). For each extracted
    URL: if it is absolute, assert it starts with `PRODUCTION_CANONICAL_URL` and strip that
    prefix; then `join('public', path)` and assert `existsSync` is true. `existsSync` and
    `join` are already imported at the top of this file. Assert the extracted set is
    non-empty first — an empty set would make the whole loop pass vacuously, which is the
    exact failure mode the old comment was avoiding.
  - Assert the extracted set equals `HEAD_LOCAL_ASSET_PATHS` after normalisation, so a
    constant that drifts from the emitted output fails loudly.

Step 2 — regenerate and run the pipeline gates:

  - `npm run marketing:build`
  - `npm run marketing:verify`
  - `npm run marketing:assets:check`
  - **Do NOT run `npm run marketing:assets`** (build mode) — V-5. It rewrites the manifest
    from the HAR and would move `harCapturedAt` for no reason.

Step 3 — measure and report all six briefing items. Report the numbers, do not
characterise them:

  1. The exactly-one counts above, from the generated file.
  2. The on-disk resolution result (which URLs, which `public/` paths, all present).
  3. `PROHIBITED_LITERALS` still 0 across all 17 — assert the LENGTH is 17 first, so a
     silently shortened list cannot print green. Import the array from the verifier rather
     than retyping it.
  4. `git diff --stat assets/marketing/manifest.json` — predicted **empty** (V-4). If it is
     not empty, report exactly which keys moved and why before continuing; do not
     accommodate it.
  5. `git diff --stat assets/marketing/landing.html` and `wc -l` — predicted **1897 lines,
     8 insertions, 1 deletion** (V-3). Then read `git diff assets/marketing/landing.html`
     and confirm every hunk sits above the first `<style` tag. A hunk anywhere else means
     the change escaped the head block.
  6. Re-hash `private/bench/marketing.html` one final time and confirm it still equals
     `47e284e9…` at 2167 lines — proving the regeneration did not write back to the bench.

If any measurement contradicts its prediction, report the discrepancy and stop. Do not
adjust the prediction to match the measurement.
  </action>

  <verify>
    <automated>npm run marketing:build && npm run marketing:verify && npm run marketing:assets:check && npx jest scripts/marketing-artifact.test.ts --runInBand && test "$(wc -l < assets/marketing/landing.html | tr -d ' ')" = "1897" && test -z "$(git diff --stat assets/marketing/manifest.json)" && test "$(shasum -a 256 private/bench/marketing.html | cut -c1-64)" = "47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527"</automated>
  </verify>

  <done>
    The artifact is 1897 lines, regenerated by the builder with no hand edits, and its diff
    against HEAD is 8 insertions / 1 deletion confined to the head block. `marketing:verify`
    passes with zero violations and `PROHIBITED_LITERALS.length` is still 17. Every image
    and icon URL in the head was extracted from the generated file and resolved to an
    existing file under `public/`. The manifest diff is empty. The bench is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full CI validate gate, exact staging, PR against main</name>
  <files>(no new file edits; git only)</files>

  <action>
Step 1 — run **every** step of CI's `validate` job (`.github/workflows/quality.yml`), in
order, with no substitutions. A weaker gate has already passed a real defect through six
consecutive waves in this repo:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Do **not** run `npm run build` — it is not part of the validate job and it clobbers
`.next` under the dev server running on :3000.

Note that `npm run lint` and `npm run typecheck:strict` will **not** look at
`scripts/brand/generate-icons.mjs` (V-13: `.mjs` is outside both the ESLint `--ext` list
and the tsconfig `include`). A green gate is not coverage of that file; Task 1's
determinism re-run is.

Step 2 — stage exactly these nine paths and nothing else. Never `git add -A`: five
pre-existing untracked files under `.planning/reviews/` and `.planning/todos/pending/`
must stay untracked.

```
git add scripts/build-marketing-artifact.ts \
        scripts/marketing-artifact.test.ts \
        scripts/brand/generate-icons.mjs \
        public/favicon.ico \
        public/marketing/og.jpg \
        public/marketing/icon-180.png \
        public/marketing/icon-192.png \
        public/marketing/icon-512.png \
        assets/marketing/landing.html
```

Add `assets/marketing/manifest.json` **only if** Task 2 step 3.4 found it changed
(predicted: it did not). Then run `git status --short` and confirm the five `.planning/`
files are still listed as untracked and that `scripts/verify-marketing-artifact.ts`,
`scripts/marketing-assets.ts`, `private/bench/**`, `middleware.ts` and `next.config.mjs`
appear nowhere in the staged set.

Step 3 — commit, push the branch, open a PR with `--base main` (`main` is protected;
never push it directly).

The PR body must contain, as prose a reviewer can act on:

  - The owner's two copy refinements, **quoted verbatim**: *"I want specific messaging on
    the rich link preview… 'Funūn. For Artists, Producers, Co-Writers, and their teams'
    somewhere in there as well"* and *"Make the second line read 'Make the song. Keep the
    record.'"*
  - What the card contains: black ground, brand radial glow, hairline frame, the six-bar
    waveform mark plus the `Funūn` wordmark, the headline, a gradient rule, the second
    line, and `funun.studio` bottom-right. All copy is the owner's.
  - What the icons contain: the full six-bar mark at every size.
  - **The pixel-snapping reason**, because it is the non-obvious engineering in this PR:
    at 16px, six bars plus five gaps share roughly 14px, so a fractional bar width puts
    every edge mid-pixel and antialiases the mark into a smear. Bar width, gap, height and
    position are forced to integers and the tile's corner radius is dropped below 48px —
    `fillRect` on integer coordinates does not antialias, `roundRect` does.
  - That `public/` serving was **verified live**, not assumed: `/marketing/img/face-01.jpg`
    returns 200 on the deployed site today, so `/marketing/og.jpg` and `/favicon.ico` will
    resolve once this deploys.
  - **Why the OG image URL is absolute** (D-02) and that its host is derived from
    `PRODUCTION_CANONICAL_URL` rather than typed a second time (D-03).
  - That the builder comment which claimed no icon and no card image existed anywhere in
    the repo has been corrected, not left contradicting the code it sits above.
  - That **OG images are cached hard by every platform** (Facebook, iMessage, Slack, X all
    cache per-URL for days or longer, and only some offer a manual re-scrape). So the card
    is worth checking right after deploy and before the link is shared widely — a wrong
    card is expensive to retract.
  - That the bench source was **not** re-frozen: `FROZEN_SHA256` stays `47e284e9…` and
    `FROZEN_LINE_COUNT` stays 2167, re-proven by hashing at the start and end of the work.
  - That the `art:` art-direction strings and roughly 200 developer comments still ship in
    the artifact. That is **out of scope here and already scoped separately** as
    `.planning/quick/261001-cmt-strip-developer-comments-from-artifact`.
  </action>

  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high && test "$(git status --short -- .planning/ | grep -c '^??')" = "5" && gh pr view --json baseRefName --jq '.baseRefName' | grep -qx main</automated>
  </verify>

  <done>
    All six validate steps pass locally. Exactly nine paths staged (ten if the manifest
    moved); the five `.planning/` files are still untracked; the verifier and the bench are
    not in the diff. A PR is open against `main` with a body covering every item above.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo → public internet | `PeteyFranchise/funun` is public and this artifact is the anonymous homepage. Anything committed here is readable immediately and permanently. |
| artifact → remote link scrapers | Facebook, iMessage, Slack, X and LinkedIn fetch the head and cache the result per-URL, outside our control. |
| browser → `public/` static layer | `/favicon.ico` and `/marketing/*` are served without middleware (`middleware.ts:238`). |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rlp-01 | Information disclosure | `assets/marketing/landing.html` | high | mitigate | The new head text is owner-supplied marketing copy only. Task 2 step 3.3 re-asserts all 17 `PROHIBITED_LITERALS` at 0 **and** asserts the list length is 17 first, so a shortened list cannot print green. |
| T-rlp-02 | Tampering | head `og:image` / icon hrefs | high | mitigate | Pointing a meta tag at a file that does not exist is the exact failure the old comment was written to avoid, and platforms cache the broken result hard. Task 2 extracts every URL from the **generated** artifact, maps it back to `public/`, and asserts `existsSync` — with a non-empty-set guard so the loop cannot pass vacuously. |
| T-rlp-03 | Tampering | `scripts/verify-marketing-artifact.ts` | high | mitigate | Weakening the verifier to make new tags pass is explicitly prohibited. Task 3 step 2 confirms the file is absent from the staged set; V-4 shows no weakening is needed because neither verifier regex is in scope for these URLs. |
| T-rlp-04 | Spoofing | `OG_IMAGE_URL` host | medium | mitigate | A second hardcoded `www.funun.studio` could drift from the canonical and point scrapers at a host we do not control. D-03 derives it through `absoluteSiteUrl(path, PRODUCTION_CANONICAL_URL)`; Task 1 asserts the result starts with `PRODUCTION_CANONICAL_URL`. |
| T-rlp-05 | Denial of service | `<link rel="icon">` under CSP | low | accept | `middleware.ts:35` sets `img-src 'self'`, which governs icon-link fetches; both icons are same-origin (V-11). No CSP change needed and none is in scope. |
| T-rlp-06 | Tampering | `private/bench/marketing.html` | medium | mitigate | An accidental bench write would silently invalidate `FROZEN_SHA256` for the next task. Tasks 1 and 2 both hash the bench and the Task 3 staging list excludes `private/bench/**`. |
| T-rlp-SC | Tampering | npm/pip/cargo installs | high | accept | **No package-manager installs in this task.** `generate-icons.mjs` is dependency-free (`node:zlib`, `node:fs`, `node:path` only). `package.json` is unchanged, so there is nothing for a legitimacy gate to audit. `npm audit` still runs as part of the validate gate. |
</threat_model>

<verification>

Phase-level checks, all run in Task 2 and Task 3:

- Bench unchanged: sha256 `47e284e9…`, 2167 lines, at both the start and the end of the work.
- Unchanged-build control passes before any edit (Task 1 step 1c) — proving the later diff is caused by this change alone.
- `assets/marketing/landing.html` is 1897 lines, 8 insertions / 1 deletion, every hunk above the first `<style` tag.
- `assets/marketing/manifest.json` diff is empty.
- `npm run marketing:verify` reports zero violations, with `PROHIBITED_LITERALS.length === 17` asserted independently.
- Every head image/icon URL extracted from the generated artifact resolves to an existing file under `public/`, over a set asserted non-empty.
- `node scripts/brand/generate-icons.mjs` reproduces all four icons byte-for-byte.
- All six CI validate steps green. `npm run build` is NOT run.
- Exactly nine staged paths (ten only if the manifest moved); five `.planning/` files still untracked.

</verification>

<success_criteria>

- `buildHeadMetadata()` emits 17 entries including exactly one each of `og:image`,
  `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:image`, `rel="icon"` and
  `rel="apple-touch-icon"`, with the large-image Twitter card type.
- The OG image URL is absolute and its host comes from `PRODUCTION_CANONICAL_URL` with no
  doubled slash.
- The builder comment describes what exists and why, and the claim that no icon or card
  image exists is gone.
- Six new brand files and the regenerated artifact are committed; the bench, the verifier
  and the asset manifest are untouched.
- A PR is open against `main` whose body carries the owner's quoted refinements, the card
  and icon contents, the pixel-snapping reason, the verified-live `public/` serving note,
  the absolute-URL reason, the corrected-comment note, the OG-cache warning, and the
  pointer to the already-scoped comment-stripping task.

</success_criteria>

<output>
Create `.planning/quick/261001-rlp-rich-link-preview-and-favicon/261001-rlp-SUMMARY.md` when done.
</output>
