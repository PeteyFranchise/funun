---
phase: quick/261001-cmt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/build-marketing-artifact.ts
  - scripts/marketing-artifact.test.ts
  - assets/marketing/landing.html
autonomous: false
requirements: [CMT-01, CMT-02, CMT-03, CMT-04, CMT-05, CMT-06, CMT-07]
branch: strip-artifact-comments
pr_base: rich-link-preview-and-favicon

must_haves:
  truths:
    - "The public marketing page carries zero developer comments: the internal source paths, the counsel/BD placeholder note, the invented-figure admission, the CSP-posture note and the internal planning filename are all gone."
    - "Adding a new decision note to the bench no longer requires a bespoke removal rule in the builder — the next one is stripped by the same pass as every other comment."
    - "Nothing but comments was deleted: the new artifact differs from the previous one ONLY by deleted spans, and every deleted span opens with //, /* or <!--."
    - "The surviving inline <script> still parses, proven by node --check with a positive control that proves the check can fail."
    - "The rendered page is unchanged: element count, body.textContent and the summed CSSOM rule count are identical before and after, with zero console errors."
    - "The six one-off comment strips named in the brief are retired, plus a seventh the brief did not name (PLACEHOLDER_MARKER, a pure CSS comment)."
    - "Every non-comment removal in sanitize() still runs — the ship-gate CSS, dev-guard script, bench toolbar, sign-in dialog, authdlg CSS, auth IIFE, shipexit button and ship-preview toggle are all still absent."
    - "The three art:'…' placeholder strings still ship by design, and so do the three art:'…' gradient strings."
    - "__CSP_NONCE_PLACEHOLDER__ appears exactly once; the head metadata PR #130 added is intact."
    - "scripts/verify-marketing-artifact.ts is byte-identical to its base-branch version — not weakened, not touched."
    - "private/bench/marketing.html is unchanged: FROZEN_SHA256 and FROZEN_LINE_COUNT re-proven by hashing, not assumed."
    - "Every step of CI's validate job passes locally before the PR opens."
  artifacts:
    - "scripts/build-marketing-artifact.ts (new exported comment tokenizer; seven retired strips and 14 dead constants deleted; header contract amended)"
    - "scripts/marketing-artifact.test.ts (tokenizer unit suite incl. the /\"/g trap; leak-closed and survival assertions over the real artifact; node --check with positive control)"
    - "assets/marketing/landing.html (regenerated; predicted 1897 -> 1827 lines, 122,209 -> 101,937 chars)"
  key_links:
    - "build-marketing-artifact.ts:535 (ASSET_V injection, last anchored pass) -> NEW strip call -> :541 rewriteAssetPaths: the strip must sit between these two, see D-02"
    - "build-marketing-artifact.ts:268 SHIP_GATE_BLOCK_START is itself a CSS comment that anchors removal of real CSS -> stripping before :482 would delete the anchor and ship the ship-gate rules (F-07)"
    - "build-marketing-artifact.ts:274/364/352 DEV_GUARD/SHIP_TOGGLE/AUTH_IIFE start anchors all begin with comment text -> same hazard, same ordering constraint"
    - "artifact:1080 <script nonce=...> is the ONLY script region at strip time -> stripJsComments operates on exactly one body -> scriptRegions===1 is the auditable scope claim"
    - "verify-marketing-artifact.ts:39 '.planning/' prefix ban -> does NOT catch the bare filename at artifact:1332 (F-03) -> new assertion lives in the test file, not the verifier"
---

<objective>
Strip developer comments from the generated marketing artifact with one general pass,
and retire the seven one-off comment strips that have accumulated in the builder.

Purpose: three problems, one cause. (1) ~200 developer comments reach a public page
with a different audience than the repo — internal source paths, an unresolved
counsel/BD note, an invented-figure admission, the page's own CSP posture, an internal
planning filename. (2) Every new decision note written into the bench fails the build
until someone adds another bespoke anchored strip; there are seven. (3) Nobody
maintains the generated file, so the comments serve no purpose where they land.

Output: an exported, independently-tested comment tokenizer in
`scripts/build-marketing-artifact.ts`; seven retired strips; a regenerated
`assets/marketing/landing.html` ~20,272 chars smaller; and a proof stack showing the
only thing that changed is comments.
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
</context>

<verified_findings>

Every number below was measured on **this** checkout (branch `strip-artifact-comments`,
HEAD `38e5b92d`, i.e. post-PR-#130), not carried over from the briefing. The briefing's
hazard table predates #130 and said so; this table replaces it.

## Baseline

| fact | value | how measured |
|---|---|---|
| bench source | present, sha256 `47e284e9…`, 2167 lines | `shasum -a 256` + `wc -l` — matches `FROZEN_SHA256` / `FROZEN_LINE_COUNT` exactly |
| HAR baseline | `private/bench/baseline/manifest.har` present (39,267 B) | `ls` |
| artifact | 1897 lines, **122,209 chars**, **125,172 bytes** | `String.length` vs `wc -c` |
| manifest | 50 assets, 7 fonts, nonceScriptCount 1, sha `47e284e9` | parsed |
| artifact regions | `<style>` 23–34, `<style>` 35–795, `<script nonce>` 1080–1893 | grep |
| `node --check` on the extracted script body (51,464 chars) | **passes today** | run |

## F-01 — Comment census of the CURRENT artifact

| syntax | spans | chars | internal newlines |
|---|---|---|---|
| HTML `<!-- -->` | 20 | 972 | 3 |
| CSS `/* */` | 56 | 9,666 | 81 |
| JS `//` | 141 (131 whole-line + 10 trailing) | 9,660 | 0 |
| JS `/* */` | **0** | 0 | 0 |
| **total** | **217** | **20,298** | **84** |

## F-02 — Tokenizer hazards, re-measured

| hazard | count | detail |
|---|---|---|
| JS regex literals | **4** | `/&/g`, `/</g`, `/"/g`, `/\s+/` — **all four immediately follow `(`** |
| JS division sites | **5** | **all five immediately follow `)`** |
| `}` / `]` / `return` / `typeof` followed by `/` | **0** | the genuinely ambiguous cases are absent |
| backticks in JS | **6 — every one inside a `//` comment** | zero real template literals |
| `${` in JS | 0 | |
| `\'` / `\"` in JS | 0 / 0 | must be synthetic test cases |
| `'` inside `//` comment tails | **20** | a naive stripper opens a string on `Writer's` |
| `"` inside `//` comment tails | **30** | same hazard, double-quote form |
| `'` / `"` inside CSS comments | **15 / 4** | same hazard in CSS |
| `//`, `/*`, `*/` inside a JS string | 0 / 0 / 0 | |
| `-->`, `<!--`, `</script` inside JS | 0 / 0 / 0 | the region split is safe here today |
| `url()` containing `//`, `/*` inside a CSS string | 0 / 0 | |
| `https://` in file / in JS | 4 / **0** | all four are in the head markup #130 added |

**The trap is `/"/g`** — a regex literal containing a double quote. A stripper tracking
only string state reads that `"` as a string opener and swallows the rest of the file.
**The second trap is the inverse and is far more prevalent**: 56 quote characters live
inside comments (20 `'`, 30 `"`, 6 backticks in JS; 15 `'`, 4 `"` in CSS). A stripper
that checks string state before comment state opens a phantom string on `Writer's`.

## F-03 — The leak sites, located (line numbers in the CURRENT artifact)

| line | region | what reaches the public page |
|---|---|---|
| 431 | CSS comment | an internal component source path (see D-06 for the literal set) |
| 1086–1087 | JS comment | the page's own CSP posture — **this one is ours**, injected by `IMAGE_ERROR_LISTENER` |
| 1331–1332 | JS comment | "representation is an open placeholder in …, to be decided with counsel/BD", one internal lib path, **and the bare planning filename `2026-09-25-crate-exclusivity-term-blocks-faq-answer.md`** |
| 1554 | JS comment | a second internal lib path |
| 1840 | JS comment | a third internal lib path |
| 1857 | JS comment | the admission that a draft carried an invented `4-8 weeks` figure |

**Correction to the brief (F-03a):** `.planning/` currently counts **0** in the
artifact, and so does the decision-note literal. The six existing strips do their job.
What actually leaks at 1332 is the bare, *unprefixed* filename — the verifier bans a
path **prefix** while an internal planning filename shipped beside it. That is a
label-integrity defect of the exact confirmed shape: the ban's name claims more than
the check carries. The new assertion must be a date-stamped-`.md` pattern, verified
to match exactly one line today and zero after.

**Correction to the brief (F-03b):** visible FAQ copy at line 1335 legitimately contains
the word *exclusivity*. The leak assertion must target the comment residue, never that word.

## F-04 — There are SEVEN comment strips, not six

The brief listed six. An eighth constant pair is also a pure comment strip:
`PLACEHOLDER_MARKER_COMMENT_START` / `_END` (builder :264–266, bench :785–787). All
seven were read in the bench source and confirmed to contain **nothing but a comment**:

| constants | builder lines | bench lines | kind | pure comment? |
|---|---|---|---|---|
| `PLACEHOLDER_MARKER_COMMENT_START/_END` | 264–266 | 785–787 | CSS | yes — **brief missed this one** |
| `PH_ART_COMMENT_START/_END` | 280–281 | 366–368 | CSS | yes |
| `DIFFERENTIATORS_OWNER_COMMENT` | 310–313 | 1088–1090 | HTML | yes |
| `STEP_BADGE_DECISION_COMMENT_START/_END` | 319–321 | 401–405 | CSS | yes (end anchor also eats one `\n`) |
| `HERO_TABS_DECISION_COMMENT_START/_END` | 328–331 | 706–712 | CSS | yes (end anchor also eats one `\n`) |
| `REVERT_NOTE_START/_END` | 333–335 | 1537–1542 | JS `//` ×6 | yes (end anchor also eats one `\n`) |
| `VOICES_PLACEHOLDER_COMMENT_START/_END` | 337–339 | 1391–1396 | JS `//` ×6 | yes (anchors include the 2-space indent and one `\n`) |

## F-05 — Expected tokenizer counts at the strip point

Current artifact census (F-01) **plus** the seven retired spans, which now survive to
the strip point:

| counter | expected |
|---|---|
| `htmlComments` | **21** (20 + DIFFERENTIATORS) |
| `cssBlockComments` | **60** (56 + PLACEHOLDER_MARKER + PH_ART + STEP_BADGE + HERO_TABS) |
| `jsLineComments` | **153** (141 + 6 REVERT_NOTE + 6 VOICES) |
| `jsBlockComments` | **0** |
| `scriptRegions` | **1** |
| `styleRegions` | **2** |

## F-06 — Predicted output size (tripwire, derived two ways)

Line delta = `+14 − 81 − 3`.
- **+14**: four retired anchors also consumed a trailing `\n` the general strip does not
  (STEP_BADGE +1, HERO_TABS +1, REVERT_NOTE +6, VOICES +6). The other three were
  byte-equivalent to the general strip and contribute 0.
- **−81 / −3**: internal newlines inside CSS / HTML comment spans, which collapse.
- JS line comments keep their `\n` by design (D-03), contributing 0.

| metric | before | **predicted after** |
|---|---|---|
| lines | 1897 | **1827** |
| chars | 122,209 | **101,937** (= 122,209 − 20,298 + 14 newlines + 12 chars of surviving VOICES indent) |
| bytes (`wc -c`) | 125,172 | measure and report — the saving will exceed the char saving, the comments are heavy in `─ ══ … —` |

A mismatch here is a **tripwire, not a number to adjust**: diagnose it before proceeding.

## F-07 — Ordering is load-bearing in the dangerous direction

Four `sanitize()` anchors are **themselves comments that gate removal of real content**:

- `SHIP_GATE_BLOCK_START` (:268) is a CSS comment anchoring the ship-gate rules
- `DEV_GUARD_SCRIPT_START` (:274) is `<script>\n// ─── Wrong-origin guard`
- `SHIP_TOGGLE_SCRIPT_START` (:364) is `<script>\n// Ship preview: …`
- `AUTH_IIFE_START` (:352) opens with three `//` lines

Stripping comments **before** these passes deletes their anchors and silently ships the
ship-gate CSS, the dev-guard script, the ship-preview toggle script and the auth IIFE.
This is the brief's "deleting a comment is not deleting content" hazard in its most
expensive direction. The strip runs **after every anchored pass**.

## F-08 — `noUnusedLocals` will fail unless 14 constants are deleted

`npm run typecheck:strict` adds `--noUnusedLocals`, and `npm run lint` runs at
`--max-warnings=0`. Retiring the seven strips orphans **13** module-level constants,
plus `VOICES_FALLBACK_COMMENT_UPDATED` (D-05) = **14**. Deleting them is mandatory.

## F-09 — `art:'…'` is 6 occurrences, not 3

Three are CSS gradient strings (`linear-gradient(135deg,#c0532f,#e8b84b)` and two more);
three are placeholder text carrying `&mdash;` (the two `Midjourney pending …` strings and
`SampleClear &mdash; one sample, two owners`). They are JS string literals, not comments,
and all six must still be present. Assert **both** numbers — 6 total and 3 containing
`&mdash;` — so a stripper that ate the quoted text cannot print green on a bare `art:` count.

## F-10 — `innerText` is not a safe identity gate on this page

`#heroB` / `#heroC` are `display:none` and the hero carousel auto-advances on a timer, so
`document.body.innerText` is timing- and layout-dependent and would flake across two page
loads for reasons unrelated to this change. `document.body.textContent` is the deterministic
form of the same claim and has **strictly larger** coverage (it includes the hidden slides).
The CSS-side proof is better served by the summed CSSOM rule count: browsers drop comments
when parsing CSS, so an identical `styleSheets[].cssRules.length` is a direct proof no CSS
rule was damaged. See Task 3.

## F-11 — The verifier is out of the staging allowlist

The constraints permit staging only `build-marketing-artifact.ts`,
`marketing-artifact.test.ts`, `landing.html` and `manifest.json`. So the new leak
assertions go in the **test file**, not `verify-marketing-artifact.ts`. That file stays
byte-identical — which is also the cleanest possible proof it was not weakened.

</verified_findings>

<decisions>

- **D-01 — Name the primitive for what it checks, not for what it implies.**
  `stripHtmlCssJsComments` (and `stripJsComments` / `stripCssComments` /
  `stripHtmlComments`). **Not** `stripComments` or `stripAllComments`: those assert
  "no comment remains", which nothing checks and which is false for syntaxes the
  tokenizer deliberately does not handle (comments inside an inline `style=""`
  attribute, inside `<svg><desc>`, or inside a non-JS `<script type="text/template">`
  body). The returned per-syntax counts plus `scriptRegions`/`styleRegions` are the
  auditable facts; the name describes the shape. Per `label-integrity-funun`: an
  asserted value wearing an authoritative name is the defect shape.

- **D-02 — The strip runs after the ASSET_V injection (:535) and before
  `rewriteAssetPaths` (:541).** After, because of F-07. Before `rewriteAssetPaths`,
  because an asset path merely *mentioned in prose* is not a request: with the strip
  after, a comment naming an off-manifest image would fail the manifest allowlist gate
  at :594 for no shipping reason.

- **D-03 — Whitespace policy: delete the comment span and nothing else.**
  - JS `//` span ends **before** its `\n`; the newline survives (ASI).
  - JS `/* */` containing a newline is replaced by a single `\n` (a multiline comment is
    a line terminator for ASI); without one, by a single space (so `a/*x*/b` ≠ `ab`).
  - CSS and HTML comment spans are deleted outright.
  - **No trailing-whitespace trimming**, even though 131 whole-line comments leave lines
    of bare indentation. Trimming would buy ~300 bytes and would break the Task 2 proof
    that every deleted span opens with a comment opener. The invariant is worth more.

- **D-04 — Assert exact counts (F-05) and throw on mismatch.** This is the file's own
  contract. It does mean a bench edit that adds a comment requires bumping one number —
  but that is one integer, not another bespoke `removeBetween`, and the thrown message
  must say exactly that.

- **D-05 — Delete `VOICES_FALLBACK_COMMENT_ORIGINAL` / `_UPDATED` and their
  `replaceExactly` call.** That pass rewrites prose describing the removed inline
  `onerror` mechanism. Once comments never ship, it edits text that is then deleted —
  and keeping a build-breaking tripwire on comment *wording* is precisely the
  bucket-under-a-leak pattern this task retires. The mechanism it guards is already
  asserted directly by `removeAllMatches(ONERROR_ATTR_RE, 2, …)`. Flag this in the PR
  body for the owner's eye; it is the one deletion the brief did not name.

- **D-06 — Leak assertions name the comment residue, never a word that also appears in
  visible copy.** Assert 0 for: the decision-note literal, the `.planning/` prefix, the
  four internal source paths, `counsel/BD`, the invented-figure phrase, and the
  date-stamped `.md` filename pattern `/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md/`. Never assert
  on *exclusivity* (F-03b).
  <!-- planner-discipline-allow: OWNER DECISION -->
  <!-- planner-discipline-allow: owner-approved -->
  <!-- planner-discipline-allow: .planning/ -->
  <!-- planner-discipline-allow: lib/sync-library/agreement.ts -->
  <!-- planner-discipline-allow: lib/deals/catalog-sample.ts -->
  <!-- planner-discipline-allow: lib/tools/splitsheet.ts -->
  <!-- planner-discipline-allow: components/selects-player/SelectsPlayer.tsx -->
  <!-- planner-discipline-allow: counsel/BD -->

- **D-07 — The injected `IMAGE_ERROR_LISTENER`'s own comments are stripped too, by
  design.** Their home is `build-marketing-artifact.ts`, where the constant lives and is
  read; the generated file is not maintained. The artifact test already proves the
  listener's *code* ships.

- **D-08 — The tokenizer throws on anything it cannot resolve**: an unterminated comment,
  string, template or regex; a `<script>`/`<style>` with no closing tag; or a `<script>`
  carrying a `type` attribute that is not `module` / `text/javascript` /
  `application/javascript` (a template script's body is not JS and must never be fed to
  the JS stripper). Throw rather than guess — the file's contract.

</decisions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build and unit-test the comment tokenizer (no pipeline wiring)</name>
  <files>scripts/marketing-artifact.test.ts, scripts/build-marketing-artifact.ts</files>

  <behavior>
Write the tests first. At minimum, each of these must be a named case:

JS stripper — the regex-literal traps (F-02):
  - `esc(/"/g)` — the double-quote regex survives and nothing after it is swallowed
  - `x(/'/g)` and ``x(/`/g)`` — same for the other two quote styles
  - `/[/]/g` — a `/` inside a regex character class does not close the regex
  - a regex after `,`, after `=`, after `:` and after `return`
  - `const q = (a + b) / c;` and `s/2` — division, NOT a regex (prev significant char
    is `)` or alphanumeric)

JS stripper — the comment-contents traps (the prevalent ones, F-02):
  - `// the Writer's Room alone` — an apostrophe inside a comment must not open a string
  - `// he said "no"` and `` // the `beta:` field `` — same for `"` and backtick
  - `// see /* not a block */` and `/* contains // not a line comment */`
  - `'a // b'`, `"a // b"`, `` `a // b` `` — `//` inside each quote style survives
  - `'a /* b'`, `"a /* b"`, `` `a /* b` `` — `/*` inside each quote style survives
  - `` `x ${ a /* c */ + b } y` `` — a template with `${}`; the comment inside the
    substitution is stripped, the literal text is not
  - `'it\'s'` and `"say \"hi\""` — escaped quotes do not terminate the string
  - `code(); // tail` keeps its `\n` (ASI); a comment on the last line with no trailing
    newline is handled
  - `/* one\ntwo */` collapses to `\n`; `a/*x*/b` becomes `a b`, never `ab`
  - an unterminated `/*`, `'` or regex throws

CSS stripper:
  - `content:'/* not a comment */'` survives
  - `url(data:image/svg+xml;base64,aa//bb)` survives
  - `/* a 'quoted' word */` — a quote inside a CSS comment does not open a string
  - `/* /* nested-looking */` ends at the first `*/`

HTML / region split:
  - `<!-- x -->` in markup is removed; `<!DOCTYPE html>` is not
  - `<script>var s='<!-- not a comment -->';</script>` — the markup stripper never sees
    inside a raw-text region
  - `<script>var s='a --> b';</script>` — a `-->` in JS does not terminate anything
  - `<SCRIPT>` / `<Style>` / `<script nonce="x">` are all recognised (casing, attributes)
  - `<script type="text/template">` throws (D-08); `<script type="module">` does not
  - an unclosed `<style>` throws
  - counts: a fixture with known comment counts returns exactly those counts
  - idempotence: `strip(strip(x)) === strip(x)` and the second call reports all-zero counts
  </behavior>

  <action>
Add to `scripts/marketing-artifact.test.ts` a new top-level describe block covering
every case in `<behavior>`, importing from `./build-marketing-artifact`. Build the
fixtures inline in the test file (small hand-built strings, the house style for the
other primitives) — do NOT add files under `__fixtures__/` and do NOT exercise the real
bench page.

Then add to `scripts/build-marketing-artifact.ts`, inside the existing
`── primitives ──` section (after `removeAllMatches`, before `── asset path rewrite ──`),
four pure exported functions and their result types. Names are fixed by D-01:

  - `stripHtmlComments(markup: string): { markup: string; comments: number }`
  - `stripCssComments(css: string): { css: string; blockComments: number }`
  - `stripJsComments(js: string): { js: string; lineComments: number; blockComments: number }`
  - `stripHtmlCssJsComments(html: string): { html: string; counts: CommentStripCounts }`

`CommentStripCounts` is an exported type with the six fields named in F-05:
`htmlComments`, `cssBlockComments`, `jsLineComments`, `jsBlockComments`, `scriptRegions`,
`styleRegions`. Name them for what they count — `jsLineComments` counts one span per
line, so six consecutive `//` lines are six, not one; say that in the type's doc comment
so no reader infers otherwise.

`stripHtmlCssJsComments` performs the region split: one left-to-right pass finding
`<script` / `<style` openers case-insensitively (matching the precedent and rationale at
`injectNoncePlaceholder`, builder :240-247, CodeQL js/bad-tag-filter), locating the end of
the open tag, then the matching case-insensitive close tag. Bodies route to the JS or CSS
stripper; everything outside routes to the HTML stripper. Enforce D-08's throw conditions.

`stripJsComments` is the state machine. States: code, single-quote string,
double-quote string, template literal (tracking `${}` nesting depth so a comment inside a
substitution is stripped while literal text is not), regex literal (tracking `[...]`
character-class depth so `/` inside a class does not close it), line comment, block
comment. **Comment state is tested before string state when in code** — that is what
makes an apostrophe inside a comment inert, and 56 such characters exist in the real
input. Backslash escapes the next character inside strings, templates and regexes.
Apply D-03's whitespace policy exactly.

Regex-vs-division is decided by the **previous significant token** — the last
non-whitespace, non-comment character already emitted. A `/` opens a regex when that
character is one of `( , = : [ ! & | ? { ; + - * % < > ~ ^` or when the preceding word is
one of `return typeof case in of new delete void do else yield await instanceof`, or when
nothing precedes it. Otherwise it is division. State the heuristic **and its limit** in a
comment above the function: a `}` is genuinely ambiguous (a block-closing `}` is followed
by a regex, an object-literal or function-expression `}` by division) and this
implementation treats it as regex-opening; the real input has zero such sites (F-02), and
the exact-count assertion in Task 2 is what catches it if one ever appears.

`stripCssComments` is a smaller machine: code, single-quote string, double-quote string,
unquoted `url(` token (terminated by `)`), comment. Same precedence rule.

Do NOT call any of these from `sanitize()` yet — that is Task 2.
  </action>

  <verify>
    <automated>npx jest scripts/marketing-artifact.test.ts --runInBand 2>&1 | tail -8</automated>
    <automated>npx jest scripts/marketing-artifact.test.ts --runInBand --listTests</automated>
  </verify>

  <done>
`npx jest scripts/marketing-artifact.test.ts --runInBand` passes, and the reported test
count is strictly greater than the pre-change count (record both numbers — `--listTests`
returning the file proves the bracketed-path trap noted in the Jest harness constraints is
not in play here). Every `<behavior>` case has its own named `it(...)`. `sanitize()` is
byte-identical to its base-branch version at this point; confirm with
`git diff scripts/build-marketing-artifact.ts | grep -c '^[-+].*sanitize'` reasoning, or
simply by reading the diff — the only additions are in the primitives section.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the strip into sanitize(), retire the seven strips, regenerate and prove</name>
  <files>scripts/build-marketing-artifact.ts, scripts/marketing-artifact.test.ts, assets/marketing/landing.html</files>

  <action>
**2.1 — Re-prove the bench before touching anything.**
`shasum -a 256 private/bench/marketing.html` must equal `FROZEN_SHA256`
(`47e284e999ec…`) and `wc -l` must equal 2167. Record both. This is a re-hash, not an
assumption; the bench must not change in this task and this is the before-reading of
the no-re-freeze claim.

**2.2 — Retire the seven strips (F-04).** Delete these seven calls from `sanitize()`:
the placeholder-marker comment, the ph-art explanatory comment, the differentiators
decision comment, the step-badge decision comment, the hero-tabs decision comment, the
pricing revert-note comment, and the voices placeholder comment. Then delete the 13
now-orphaned module constants, plus the `replaceExactly` call and both constants named
in D-05 — 14 constants in total (F-08). **Do not touch any other removal.** Every
non-comment pass stays: the ship-gate CSS block, the wrong-origin dev-guard script, the
bench toolbar div, the `.ph-art` CSS rule, the `.phnote` paragraph, the `.ph-art`
paragraphs, the `.flag` paragraphs, the sign-in dialog, the `authdlg` CSS, the auth
IIFE, the `data-authopen` attribute, the shipexit button, the ship-preview toggle
script, and all three `removeAllMatches` passes.

**2.3 — Insert the strip in the one correct place (D-02, F-07).** Immediately after the
`replaceExactly(… ASSET_V_DECLARATION + IMAGE_ERROR_LISTENER …)` call and immediately
before `rewriteAssetPaths`. Add a module constant holding the six expected counts from
F-05 and assert them exactly (D-04). The thrown message must name the counter, the
expected value, the actual value, and tell the maintainer that a deliberate new comment
in the bench is fixed by bumping **this one integer**, not by writing another anchored
removal. Add the composed counts to the CLI's final `console.log` line alongside the
byte count.

**2.4 — Amend the header contract (builder :2–25).** The contract currently says
"anchored string replacement only, no HTML parser, no DOM, no reserializer". That is now
partly untrue, and a contract that is quietly untrue is worse than one that is explicit.
Add a paragraph stating: a tokenizer now exists; it is confined to the three comment
syntaxes and reads no other grammar; it is pure, exported and unit-tested like the other
primitives; it still asserts exact counts and still throws rather than guessing; and it
exists because one-off anchored strips for comments were multiplying — seven of them —
turning each new bench note into a build break. Also record the ordering constraint from
F-07 in a comment at the call site, naming the four anchors that are themselves comments.

**2.5 — Regenerate.**
`npm run marketing:build`, then `npm run marketing:verify`, then
`npm run marketing:assets:check`. Record the builder's reported char count and the six
comment counts. Then `wc -l -c assets/marketing/landing.html`.

**2.6 — Check the F-06 prediction.** Expect **1827 lines** and **101,937 chars**. If
either differs, stop and diagnose before proceeding — the derivation is in F-06 and a
mismatch means the whitespace policy (D-03) or the retired-strip accounting is wrong, not
that the prediction needs editing. Report the byte saving in both units (chars and
`wc -c` bytes, which differ because the page is heavily multibyte).

**2.7 — The pure-deletion proof (one-time, the strongest evidence available offline).**
Write a throwaway script under the scratchpad (never committed) that reads
`git show HEAD:assets/marketing/landing.html` as *before* and the new file as *after*,
computes the minimal edit script between them, and asserts: zero insertions, zero
modifications, and **every deleted span, taken verbatim, begins with `//`, `/*` or
`<!--`**. Print the number of deleted spans and the total deleted length. A pure-deletion
diff whose every deleted span opens with a comment opener cannot change rendering under
D-03's whitespace policy. Report the span count and compare it to 217 + the retired
spans; explain any difference rather than waving at it.

**2.8 — Add the permanent assertions** to the `describeIfArtifact('the real generated
artifact')` block in `scripts/marketing-artifact.test.ts`:

  - *Parse proof*: extract the single `<script>` body, write it to `os.tmpdir()`, run
    `node --check` on it via `execFileSync`, assert exit 0. **With a positive control**:
    corrupt a copy (drop the final `}`), run `node --check` on that, and assert it
    throws. A parse check that cannot fail is not a check.
  - *Leak closed* (D-06): zero occurrences of each literal in the D-06 set, plus zero
    matches of `/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md/`. Assert the size of the literal set
    first so a silently shortened list cannot print green, mirroring the existing
    `PROHIBITED_LITERALS.length` guard.
  - *Comment-free*: zero `<!--` in the markup regions, zero `/*` in the `<style>` bodies,
    zero `//` and `/*` in the `<script>` body **as computed by the independent dumb
    regexes, not by the tokenizer** — the two implementations must agree, which is a real
    cross-check because their failure modes differ (the dumb regex is wrong in general
    but F-02 proves its preconditions hold for this input).
  - *Survival*: all 17 `PROHIBITED_LITERALS` still 0 with the length guard intact;
    `__CSP_NONCE_PLACEHOLDER__` exactly once; `art:'` exactly 6 with exactly 3 containing
    `&mdash;` (F-09); the four `/&/g`, `/</g`, `/"/g`, `/\s+/` regex literals each still
    present; `main{padding-top:44px}` and the body data attributes still present; the
    head still carries `og:image`, `twitter:image`, `twitter:card` =
    `summary_large_image`, `rel="icon"` and `rel="apple-touch-icon"` (reuse the existing
    `headSlice` so a body match cannot satisfy them).
  - *Manifest shape*: 50 assets, 7 fonts, `nonceScriptCount` 1.

**2.9 — No re-freeze, re-proven.** Re-hash `private/bench/marketing.html`; it must still
be `47e284e9…` / 2167 lines, and `FROZEN_SHA256` / `FROZEN_LINE_COUNT` must be unchanged
in `scripts/marketing-assets.ts`. Confirm `git status` shows `marketing-assets.ts`,
`verify-marketing-artifact.ts` and `private/` all unmodified, and that
`assets/marketing/manifest.json` is byte-identical (it should be — `nonceScriptCount`
stays 1). Stage only the files that actually changed, from the allowlist in the
constraints. Never `git add -A`; the five pre-existing untracked `.planning/reviews/` and
`.planning/todos/pending/` files stay untracked.
  </action>

  <verify>
    <automated>npm run marketing:build && npm run marketing:verify && npm run marketing:assets:check</automated>
    <automated>wc -l -c assets/marketing/landing.html</automated>
    <automated>shasum -a 256 private/bench/marketing.html | grep -q '^47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527 ' && echo "BENCH UNCHANGED"</automated>
    <automated>git diff --stat scripts/verify-marketing-artifact.ts scripts/marketing-assets.ts | wc -l</automated>
    <automated>npx jest scripts/marketing-artifact.test.ts --runInBand 2>&1 | tail -8</automated>
  </verify>

  <done>
`marketing:build`, `marketing:verify` and `marketing:assets:check` all exit 0. The
artifact is 1827 lines / 101,937 chars, or the deviation has been diagnosed and explained
rather than accepted. The six comment counts matched F-05 exactly (21 / 60 / 153 / 0 / 1 / 2).
The 2.7 diff proof reports zero insertions, zero modifications, and 100% of deleted spans
opening with a comment opener. `node --check` passes on the stripped script and its
positive control fails. All leak literals and the date-`.md` pattern count 0; all 17
`PROHIBITED_LITERALS` count 0 with the length guard intact; the nonce placeholder appears
exactly once; six `art:'` strings survive, three of them carrying `&mdash;`; all four JS
regex literals survive; the #130 head metadata is intact. `git diff --stat` on the
verifier and `marketing-assets.ts` prints nothing. The bench re-hashes to `47e284e9…` /
2167 lines.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
A regenerated `assets/marketing/landing.html` with every developer comment removed, the
seven one-off comment strips retired, and a tokenizer that makes the next bench note a
non-event. Machine proof so far: the diff is pure deletion and every deleted span is a
comment; the stripped script still parses under `node --check`; the leak literals, the
17 prohibited literals and the internal-filename pattern all count 0; the nonce
placeholder, the six `art:` strings, the four JS regexes and the #130 head metadata all
survive; the bench is unchanged.

What a machine cannot prove offline is that the **rendered page** is unchanged. That
needs a real browser, the same way the asset HAR did.
  </what-built>

  <how-to-verify>
Note on the gate: the brief asked for `document.body.innerText` identity. On this page
that would flake — `#heroB`/`#heroC` are `display:none` and the hero carousel
auto-advances on a timer, so `innerText` differs between two loads of the *same* file.
`textContent` is the deterministic form of the same claim and covers more (it includes
the hidden slides), and the summed CSSOM rule count is a sharper CSS proof than
`innerText` ever was: browsers drop comments when parsing CSS, so an identical rule count
proves no CSS rule was damaged. See F-10.

1. From the repo root, run this to stage both versions and serve them (port 4322 — the
   dev server owns 3000):

   ```
   D=/tmp/cmt && mkdir -p $D && \
   git show HEAD:assets/marketing/landing.html > $D/before.html && \
   cp assets/marketing/landing.html $D/after.html && \
   ln -sfn "$PWD/public/marketing" $D/marketing && \
   python3 -m http.server 4322 --directory $D
   ```

2. Open `http://127.0.0.1:4322/before.html`, open DevTools, and in the Console paste:

   ```
   JSON.stringify({el:document.querySelectorAll('*').length,txt:document.body.textContent.length,css:[...document.styleSheets].reduce((n,s)=>n+s.cssRules.length,0)})
   ```

   Copy the result. Then look at the Console tab and note any errors.

3. Open `http://127.0.0.1:4322/after.html`, paste the same line, copy the result, and
   note any Console errors.

4. The two JSON objects must be **identical — all three numbers, exactly equal, not
   close**. The `after` page must have **zero** Console errors. Scroll both pages top to
   bottom, click through the three hero tabs and the differentiator tabs, and confirm
   they look the same.

Then stop the server (Ctrl-C) and `rm -rf /tmp/cmt`.

Paste both JSON results back, plus whether the Console was clean.
  </how-to-verify>

  <resume-signal>Paste the two JSON objects and type "approved", or describe what differs.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo → public marketing page | `assets/marketing/landing.html` is served at `www.funun.studio/`. The repo is public, but this page has a different, non-technical audience; prose written for the bench was not written for it. |
| bench source → generated artifact | `sanitize()` is the only filter between a constantly-changing local file and a public page. |
| generated artifact → app CSP | the route handler substitutes a real nonce for `__CSP_NONCE_PLACEHOLDER__`; exactly one placeholder must survive. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-cmt-01 | Information disclosure | `assets/marketing/landing.html` | high | mitigate | This task's entire purpose. Task 2.8 asserts 0 for the decision-note literal, the `.planning/` prefix, the four internal source paths, the counsel/BD note, the invented-figure phrase, **and** the date-stamped `.md` filename pattern the existing prefix ban misses (F-03a), with a set-length guard so a shortened list cannot print green. |
| T-cmt-02 | Tampering | `sanitize()` non-comment removals | **critical** | mitigate | Conflating "delete a comment" with "delete content" would silently ship the ship-gate CSS, the dev-guard script, the ship-preview toggle and the auth IIFE, because four anchors are themselves comments (F-07). Mitigated by D-02's ordering constraint, by Task 2.2's explicit keep-list, and by the 17 `PROHIBITED_LITERALS` (which include `data-ship`, `shipexit`, `shipOn`, `shipOff`, `authdlg`, `data-authopen`) still counting 0. |
| T-cmt-03 | Denial of service | the single inline `<script>` | **critical** | mitigate | A tokenizer that mis-reads `/"/g` swallows the rest of the file and takes the whole page down. Mitigated three ways: the regex-literal state in `stripJsComments`, the named unit cases in Task 1, and `node --check` on the extracted body **with a positive control** in Task 2.8. |
| T-cmt-04 | Tampering | CSS rendering | high | mitigate | A mis-stripped CSS comment can swallow rules and leave the page unstyled without any literal check noticing. Mitigated by the dumb-regex cross-check (two implementations with different failure modes agreeing) and by the CSSOM `cssRules.length` identity in Task 3, which is the only check that observes what the browser actually parsed. |
| T-cmt-05 | Tampering | `scripts/verify-marketing-artifact.ts` | high | mitigate | Weakening the verifier to make the new output pass is prohibited. The file is outside the staging allowlist (F-11), so new assertions live in the test suite instead and `git diff --stat` on it must print nothing. |
| T-cmt-06 | Tampering | `private/bench/marketing.html` | medium | mitigate | An accidental bench write silently invalidates `FROZEN_SHA256` for the next task. Re-hashed at the start (2.1) and end (2.9) of Task 2; `private/` is never staged. |
| T-cmt-07 | Denial of service | CSP nonce substitution | high | mitigate | `__CSP_NONCE_PLACEHOLDER__` is an attribute value, not a comment. If the tokenizer ate it the script would be blocked by CSP in production while passing every offline check. Task 2.8 asserts it appears exactly once; the existing `sanitize()` script/nonce count equality check at :551-557 still runs unchanged. |
| T-cmt-08 | Repudiation | the exact-count assertion (D-04) | low | accept | A maintainer facing a thrown count can "fix" it by bumping the integer without reading what the new comment says. Accepted: the thrown message tells them to confirm intent first, and the alternative — a floor instead of an exact count — would silently tolerate drift, which this file's contract forbids. |
| T-cmt-SC | Tampering | npm/pip/cargo installs | high | accept | **No package-manager installs in this task.** No jsdom, no headless browser, no diff library — the tokenizer, the diff proof and `node --check` are all `node:` builtins, and the browser step is owner-run (Task 3), matching the precedent set when the asset HAR was captured. `package.json` is untouched, so there is nothing for a legitimacy gate to audit. `npm audit` still runs as part of the validate gate. |
</threat_model>

<verification>

## Full Verification Gate — every step CI's `validate` job runs, no substitutions

Per `.claude/CLAUDE.md`. Run all of these, in this order, and report each result:

```bash
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

`npm run build` is **not** part of this gate and must not be run — the dev server owns
`.next`. `typecheck:strict` is the type-safety check here, and it is the one that will
catch any of the 14 orphaned constants from F-08. `lint` runs at `--max-warnings=0`, so a
single warning fails.

## Task-specific checks

| # | check | expected |
|---|---|---|
| V-1 | bench sha256 / line count, before and after | `47e284e9…` / 2167, unchanged — no re-freeze |
| V-2 | `FROZEN_SHA256` / `FROZEN_LINE_COUNT` in `marketing-assets.ts` | unchanged; file not staged |
| V-3 | `git diff --stat scripts/verify-marketing-artifact.ts` | empty — verifier not weakened, not touched |
| V-4 | tokenizer counts at the strip point | 21 / 60 / 153 / 0 / 1 / 2 (F-05) |
| V-5 | artifact size | 1827 lines, 101,937 chars; `wc -c` byte saving reported |
| V-6 | pure-deletion diff vs `HEAD` | 0 insertions, 0 modifications, 100% of deleted spans open with `//`, `/*` or `<!--` |
| V-7 | `node --check` on the stripped script + positive control | passes / the control fails |
| V-8 | leak literals + date-`.md` pattern | all 0, set length asserted first |
| V-9 | 17 `PROHIBITED_LITERALS` | all 0, `length === 17` asserted first |
| V-10 | `__CSP_NONCE_PLACEHOLDER__` | exactly 1 |
| V-11 | `art:'` strings | 6 total, 3 containing `&mdash;` |
| V-12 | JS regex literals `/&/g`, `/</g`, `/"/g`, `/\s+/` | all 4 present |
| V-13 | #130 head metadata in `headSlice` | `og:image`, `twitter:image`, `twitter:card`=`summary_large_image`, `rel="icon"`, `rel="apple-touch-icon"` all present |
| V-14 | manifest | 50 assets, 7 fonts, `nonceScriptCount` 1, byte-identical |
| V-15 | `npm run marketing:verify` and `marketing:assets:check` | exit 0 |
| V-16 | browser identity (Task 3) | element count, `body.textContent.length` and summed `cssRules.length` identical before/after; zero console errors |
| V-17 | staged set | only `scripts/build-marketing-artifact.ts`, `scripts/marketing-artifact.test.ts`, `assets/marketing/landing.html` (+ `manifest.json` only if it changed). Five pre-existing untracked `.planning/` files remain untracked. |

</verification>

<success_criteria>

- The seven one-off comment strips are gone and the 14 orphaned constants with them; the
  builder has one general comment pass in their place.
- Every non-comment removal in `sanitize()` still runs, proven by the 17 prohibited
  literals still counting 0.
- The artifact carries zero developer comments and zero of the D-06 leak literals,
  including the internal planning filename the `.planning/` prefix ban never caught.
- The only difference from the previous artifact is deleted comment spans — proven by a
  pure-deletion diff, by `node --check` with a positive control, by two independent
  comment-detection implementations agreeing, and by an identical rendered DOM, text
  content and CSSOM rule count in a real browser.
- `__CSP_NONCE_PLACEHOLDER__` appears exactly once; the six `art:` strings, the four JS
  regex literals and the #130 head metadata all still ship.
- The bench is unchanged and re-hashed to prove it; the verifier is byte-identical.
- The full validate gate is green, every step run, nothing substituted.

</success_criteria>

<output>

Create `.planning/quick/261001-cmt-strip-developer-comments-from-artifact/261001-cmt-SUMMARY.md`
and append a STATE.md row when done.

Open the PR with `--base rich-link-preview-and-favicon`. Do **not** rebase onto `main`
and do **not** merge #130 — both branches regenerate the artifact and would conflict.

The PR body must cover, in plain language:

1. **The owner decision (2026-10-01), stated plainly** — the public page carries ~200
   developer comments, nobody maintains the generated file so they serve no purpose
   there, and each new note in the bench forces another bespoke removal rule.
2. **The three problems and the one cause** — it leaks; the bespoke strips multiply
   (seven of them, a bucket under a leak); nobody maintains the output.
3. **What actually leaked**, with the correction that `.planning/` and the decision-note
   literal already counted 0 — the real residue was the bare, unprefixed planning
   filename at line 1332, which the verifier's prefix ban was never going to catch. Name
   that as a label-integrity miss, not a typo.
4. **The seven retired strips** (six from the brief plus `PLACEHOLDER_MARKER`, which the
   brief missed), and the explicit list of what was *not* touched.
5. **The tokenizer and the `/"/g` trap specifically** — a regex literal containing a
   double quote, which a string-only stripper reads as a quote and uses to swallow the
   rest of the file. Mention the inverse trap too: 56 quote characters live inside
   comments in the real input, so comment state must be tested before string state.
   State the regex-vs-division heuristic and its `}` limit.
6. **Why the ordering is load-bearing** — four `sanitize()` anchors are themselves
   comments that gate removal of real code and CSS.
7. **The proof the output is still correct** — pure-deletion diff, `node --check` with a
   positive control, two independent comment detectors agreeing, and the browser check
   showing identical element count, `textContent` and CSSOM rule count with zero console
   errors. Say why `textContent` replaced `innerText`: the hero carousel auto-advances
   and two slides are `display:none`, so `innerText` is not deterministic on this page.
8. **The leak-closed assertions** and that all 17 prohibited literals still count 0.
9. **The byte saving** — before/after lines, chars and `wc -c` bytes.
10. **That the three `art:` placeholder strings still ship by design** (plus the three
    gradient strings — six `art:` strings in total). They are JS string literals, not
    comments, and were never in scope.
11. **D-05 flagged for the owner's eye**: the `VOICES_FALLBACK_COMMENT` replace was
    deleted as well. It rewrote prose that no longer ships, and keeping a build-breaking
    tripwire on comment wording would reintroduce the pattern this PR retires.
12. **No re-freeze** — the bench did not change; `FROZEN_SHA256` / `FROZEN_LINE_COUNT`
    confirmed by re-hashing.

</output>
