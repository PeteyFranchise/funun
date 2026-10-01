---
phase: quick/261001-hna
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/marketing-assets.ts
  - scripts/build-marketing-artifact.ts
  - assets/marketing/landing.html
  - assets/marketing/manifest.json
  - private/bench/baseline/FROZEN.sha256
autonomous: true
requirements: [HNA-01, HNA-02]
branch: hero-named-tabs-and-funun-copy

must_haves:
  truths:
    - "The hero carousel control on the shipped marketing artifact reads three product names — The Writer's Room, Sound Vault, The Crate — in a pill tablist, not three anonymous bars."
    - "The active tab is marked with aria-selected (correct for role=tab), and the dwell animation runs as a 2px underline beneath it."
    - "The two remaining aria-current usages (nav link styling, scrollspy) are untouched — exactly 2 occurrences survive in the artifact."
    - "The Writer's Room and Sound Vault hero ledes both name Funūn and classify the product, matching the Crate lede's existing shape."
    - "No internal decision commentary reaches the public artifact."
    - "The artifact is regenerable from the current bench source with no hand edits."
    - "Every step of CI's validate job passes locally before the PR opens."
  artifacts:
    - scripts/marketing-assets.ts (FROZEN_SHA256 + FROZEN_LINE_COUNT advanced to the named-tabs bench revision)
    - scripts/build-marketing-artifact.ts (third anchored owner-comment strip, same shape as its two neighbours)
    - assets/marketing/landing.html (regenerated, carrying the tablist and both new ledes)
    - assets/marketing/manifest.json (sourceSha256 advanced by scripts/marketing-assets.ts)
    - private/bench/baseline/FROZEN.sha256 (gitignored local baseline kept honest)
  key_links:
    - "scripts/marketing-assets.ts FROZEN_SHA256 -> build-marketing-artifact.ts:504 frozen-source gate (refuses any other revision)"
    - "scripts/marketing-assets.ts FROZEN_SHA256 -> build-marketing-artifact.ts:510 manifest.sourceSha256 equality gate (the step the obvious order of operations fails on)"
    - "scripts/marketing-assets.ts:334 -> assets/marketing/manifest.json sourceSha256 (the ONLY writer of that field)"
    - "bench comment at private/bench/marketing.html:706 -> verify-marketing-artifact.ts:38 PROHIBITED_LITERALS -> scripts/marketing-artifact.test.ts:466 verifyArtifact(...) == []"
    - "section data-nav attribute -> build-marketing-artifact.ts sanitize() (no anchor touches the carousel) -> artifact tab labels"
---

<objective>
Ship two owner-approved hero changes to the public marketing page at `/` as ONE re-freeze:
(1) the carousel control becomes a named-tab pill list — **The Writer's Room · Sound Vault ·
The Crate** — instead of three anonymous 26×3px bars plus the word "Carousel"; (2) the Writer's
Room and Sound Vault hero ledes are rewritten to name Funūn and classify the product, matching
the shape the Crate lede already had.

Purpose. The old control named the *mechanic* in our jargon and told a visitor nothing: not that
there were three rooms, not which one they were on, not that the bars were clickable. Owner:
*"rather than this saying carousel with the three lines there, is there a more intuitive button
that lets you know that there are other slides?"* Four treatments were rendered on the bench; the
owner chose named tabs. Separately, two of the three ledes described a feature and never said
Funūn. Owner: *"can we also add copy about Funūn, in the sound vault and writer's room slide as
well, similar to the crate copy."* Owner picked variants W1 and S2 from four drafts.

Output: regenerated `assets/marketing/landing.html` + `assets/marketing/manifest.json`, two
`scripts/` source changes that make the pipeline accept and correctly sanitize the new bench
revision, and a PR against protected `main`.

**Both bench edits are already done.** `private/bench/marketing.html` is gitignored, hand-edited,
and browser-verified by the owner at 1440px and 375px. This plan is the re-freeze, the sanitizer
strip, and the gate. Do not re-edit the bench — any edit invalidates the sha this plan pins.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md

@scripts/marketing-assets.ts
@scripts/build-marketing-artifact.ts
@scripts/verify-marketing-artifact.ts
@scripts/marketing-artifact.test.ts
</context>

<verified_findings>

Every claim below was checked against source in this session, with the command that checked it.
Four corrections to the briefing are marked. Read this before Task 1.

**V-1 — The bench edit is real and on disk; the briefing's freeze values are exact.**
`shasum -a 256 private/bench/marketing.html` →
`366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78`; `wc -l` → **2167**. Both match
the briefing. The current constants at `scripts/marketing-assets.ts:41-43` still name the previous
revision (`eecfb67d…a58b294`, 2151), and `assets/marketing/manifest.json` still records
`sourceSha256: eecfb67d…a58b294`, 50 assets / 7 fonts / `nonceScriptCount: 1`.
`private/bench/baseline/FROZEN.sha256` still records `eecfb67d…` as well.

**V-2 — CORRECTION: the decision comment is 7 lines, not 8.**
It spans `private/bench/marketing.html:706-712`. This is not pedantry — it is the cross-check that
makes the predicted artifact diff in V-7 trustworthy. Bench grew +16 lines; the strip removes 7;
net +9, which is exactly what the independent per-region count arrives at.

**V-3 — BLOCKER confirmed: the new comment carries a banned literal.** Line 706 opens
`/* Named tabs, not anonymous bars.` followed by the phrase `verify-marketing-artifact.ts:38`
lists in `PROHIBITED_LITERALS`. CSS comments are not stripped wholesale — the adjacent
`/* ^ !important is load-bearing` comment two lines above survives verbatim into the current
artifact. So a straight regeneration ships internal commentary to a public page,
`npm run marketing:verify` exits 1, and `scripts/marketing-artifact.test.ts:466`
(`expect(verifyArtifact(html, manifest)).toEqual([])`) fails.

There are **five** occurrences of that banned phrase in the bench (lines 401, 706, 1017, 1088,
1154). Four are already handled: 401 by `STEP_BADGE_DECISION_COMMENT_*`, 1088 by
`DIFFERENTIATORS_OWNER_COMMENT`, 1017 and 1154 by `FLAG_PARAGRAPH_RE`. **Only 706 is unhandled.**

Both anchors for 706 were confirmed to occur **exactly once** (`grep -c` = 1 each), which is what
`removeBetween`'s `assertOccurrences(…, 1, …)` requires. The end line has exactly three leading
spaces and no trailing whitespace (checked with `cat -ve`).

**V-4 — No pipeline script anchors on anything the bench edit touched.**
`grep -n 'slidenote\|cdot\|cdots\|Slide ' scripts/build-marketing-artifact.ts
scripts/verify-marketing-artifact.ts scripts/marketing-artifact.test.ts scripts/marketing-assets.ts`
returns **zero matches**. Beyond that, all 28 single-occurrence sanitizer start anchors were
re-checked against the new bench source and every one still occurs exactly once. (Three constants
report other counts — `SCRIPT_CLOSE` 3, `DIV_CLOSE` 84, `VOICES_FALLBACK_COMMENT_UPDATED` 0 — all
three are expected: the first two are `removeBetween` *end* anchors, which the helper deliberately
does not require to be unique, and the third is a replacement value, not a source anchor.)
**Conclusion: the only pipeline change this re-freeze needs is the freeze constants plus one strip.**

**V-5 — The bench carousel change is in the state the briefing describes.**
`slidenote` → 0 occurrences. `hover to pause` → 0. Three `data-nav` attributes at lines 932, 957,
974 carrying `The Writer’s Room` / `Sound Vault` / `The Crate`. Exactly three `aria-current`
occurrences remain and all three are out of scope and correct: line 562
(`.navlinks a[aria-current="true"]` — a current *link*), line 1952 (the scrollspy
`a.setAttribute('aria-current', …)`), and line 712, which is the *prose inside the comment this
plan strips*. So the artifact will carry exactly **2**, not 3. Do not "fix" either survivor.

**NOTE on the apostrophe:** `data-nav="The Writer’s Room"` uses U+2019 (a curly apostrophe), not
`'`. Any grep must use the curly form or it silently matches nothing — a green check that proves
nothing, which this repo has been bitten by before.

**V-6 — CORRECTION: the brand name is HTML-entity-encoded in the two NEW ledes.**
The bench writes `Fun&#363;n`, not `Funūn`, at lines 945 and 963. The pre-existing Crate lede
(line 977) uses the literal UTF-8 `Funūn`. Both render identically and the sanitizer performs no
entity transformation (the current artifact carries 7 `Fun&#363;n` and 18 literal `Funūn`), so
this is a harmless pre-existing inconsistency in the bench — **but a grep written against the
literal form will find nothing.** Assert on the entity form for heroA/heroB.

**V-7 — CORRECTION: the new-claim audit, done rather than assumed.** The briefing asks for the
*"the split sheet fills in as you write"* claim to be checked, not trusted. It is corroborated on
the same page at `private/bench/marketing.html:1720`, the How-it-works ladder step 4: *"Every
section knows who wrote it. By the time the song is finished the split sheet already reflects what
actually happened."* Two further page elements say the same thing in weaker form (the FAQ at 1520,
the Contract Locker card at 1559). The claim is consistent with what the page already promises and
with what Phase 37.1 actually built. **It is not a new promise.** The Grammy / "first built for"
claims survive verbatim — diffed word-for-word against the old ledes below.

**V-8 — Exact old → new copy, for the absence assertions.**

  heroA (artifact:869-871, 3 lines) was: `The first room built for writing a topline together
  &mdash; by multiplatinum, / Grammy-winning and Grammy-nominated songwriters. See who&rsquo;s in
  the room and who&rsquo;s / on each section.`
  heroA (bench:945-947, 3 lines) now: `Fun&#363;n&rsquo;s writing room &mdash; the first built for
  writing a topline / together, by multiplatinum, Grammy-winning and Grammy-nominated songwriters.
  See who&rsquo;s / in the room and who&rsquo;s on each section; the split sheet fills in as you
  write.`

  heroB (artifact:884-885, 2 lines) was: `Masters, stems, artwork, credits, metadata and documents
  live together, and a readiness score / shows what&rsquo;s done and what still needs doing before
  release day.`
  heroB (bench:963-965, 3 lines) now: `The Sound Vault is where everything a release needs lives on
  Fun&#363;n: / masters, stems, artwork, credits, metadata and documents, together. A readiness
  score shows / what&rsquo;s left before release day.`

**V-9 — Predicted artifact diff, computed two independent ways that agree.**
Per-region count against the current artifact: carousel CSS −9/+17, `.slidenote` CSS rule −2,
`.slidenote` span markup −1, three `<section>` lines −3/+3, heroA lede −3/+3, heroB lede −2/+3,
JS `forEach` −2/+4, JS active-tab query −1/+1, JS `innerHTML` builder −1/+2. Totals **−24 / +33,
net +9**. Independently: bench +16 lines minus the 7-line strip = **+9**. The two agree, so the
hard invariant to check is `wc -l assets/marketing/landing.html` = **1890** (from 1881).
`git diff --numstat` may report slightly different raw counts if the unified-diff algorithm pairs
lines differently inside a hunk — the line total is the reliable gate, the numstat is the report.

**V-10 — CI's validate job is exactly the six commands in CLAUDE.md.** Read from
`.github/workflows/quality.yml:23-31`. `npm run marketing:verify` is **not** a CI step — the
pipeline is covered in CI only through `scripts/marketing-artifact.test.ts`, which loads the
*committed* artifact off disk and asserts zero verifier violations. Run `marketing:verify`
manually anyway; it reports every violation at once rather than one jest failure.

**V-11 — There are no per-strip unit tests, and that is the existing convention.**
`grep -n 'DIFFERENTIATORS\|STEP_BADGE\|sanitize(' scripts/marketing-artifact.test.ts` finds no
test for either existing strip. The coverage is the committed-artifact assertion. Add no new test;
match the precedent.

**V-12 — Local `/` will NOT show this page, and that is expected.** `middleware.ts:178-180` says
so in a comment, and `lib/marketing/rootRewrite.ts` is `pathname === '/' && !hasUser`. With
`NEXT_PUBLIC_VAULT_DEMO=true` the demo early-return fires before `getUser()`, so localhost `/`
goes to `/signin`. This is pre-existing and documented — **do not chase it**, and do not treat a
redirect as a failure of this change. Production serves the artifact to anonymous visitors at `/`.

**V-13 — Working tree and branch.** On `hero-named-tabs-and-funun-copy`, otherwise clean except
**five** pre-existing untracked files under `.planning/reviews/` (3) and `.planning/todos/pending/`
(2). They are earlier work and must not be staged. PR #126 is open on a different branch and
touches no file here — not a dependency. The stale worktree at `.claude/worktrees/zen-yalow-0b7a42/`
is out of scope.

</verified_findings>

<tasks>

<!-- Literals this plan negative-greps against the ARTIFACT that also appear in task prose. -->
<!-- They are discussed here about `assets/marketing/landing.html`; no task writes any of them -->
<!-- into a file that is then gated, so the echo risk the discipline rule guards does not apply. -->
<!-- planner-discipline-allow: OWNER DECISION -->
<!-- planner-discipline-allow: slidenote -->
<!-- planner-discipline-allow: .planning/ -->

<task type="auto">
  <name>Task 1: Advance the freeze and add the third anchored comment strip</name>
  <files>scripts/marketing-assets.ts, scripts/build-marketing-artifact.ts</files>
  <action>
Two edits that must land together — either alone leaves the pipeline broken.

**1a. `scripts/marketing-assets.ts`, lines 41-43.** Replace the frozen baseline values:
  - `FROZEN_SHA256` (string literal on line 42): the current `eecfb67d…a58b294` becomes
    `366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78`
  - `FROZEN_LINE_COUNT` (line 43): `2151` becomes `2167`

Change nothing else in this file — `PRODUCTION_FONT_FILES`, the path constants and every exported
function stay as they are.

**1b. `scripts/build-marketing-artifact.ts`.** Add an anchored removal for the decision comment
now sitting above the `.cdots` rule. **This is the third one-off strip in this file** and it must
read as a sibling of the two already there, not as a new mechanism.

Declare two anchor constants immediately after the existing `STEP_BADGE_DECISION_COMMENT_END` at
line 283, so all three owner-comment strips sit in one block and the pattern is visible. Name them
for the control — e.g. `HERO_TABS_DECISION_COMMENT_START` and `HERO_TABS_DECISION_COMMENT_END`.
Their values must be lifted byte-for-byte from the frozen source:

  - start anchor — the full first line of the comment, opening with the two characters that begin
    a CSS comment, then ` Named tabs, not anonymous bars. ` then the banned phrase, then
    ` 2026-09-30: three 3px bars`. No trailing newline.
<!-- planner-discipline-allow: OWNER DECISION -->
    The banned phrase is the literal `OWNER DECISION`. Read line 706 of the bench and copy it
    exactly rather than retyping it — a retyped predicate is how false greens happen here.
  - end anchor — three leading spaces, then
    `is the correct state attribute for a tab (aria-current was wrong here). */`, then a single
    `\n`. Claim the newline so the removal leaves no blank line between the `!important` comment
    above and the `.cdots` rule below.

Both anchors were confirmed to occur exactly once in the frozen source. Write a two-line comment
above the constants recording *why*: the owner's rationale belongs in the bench, but the artifact
ships to a public page and `verify-marketing-artifact.ts` bans that literal from it.

Then add one call inside `sanitize()`, placed immediately after the existing
`STEP_BADGE_DECISION_COMMENT_*` `removeBetween` that ends at line 430, passing the two new anchors
and a descriptive label (the label is what surfaces in the thrown error if an anchor ever stops
matching). Use `removeBetween`, not `removeExactly` — the block is multi-line, and anchoring both
ends is how every other multi-line strip in this file works.

**Scope discipline, three hard NOs.**
  - Do not touch `scripts/verify-marketing-artifact.ts`. Do not add to or remove from
    `PROHIBITED_LITERALS`. The verifier is doing its job; weakening it to pass is the one move
    this task must not make.
  - Do not edit `private/bench/marketing.html` to dodge the check. Any edit invalidates the sha
    1a just pinned.
  - **Do not generalise.** A wholesale CSS-comment stripper would be the obvious third-time
    refactor and it is wrong here: this file's stated design is anchored string replacement with
    exact-count assertions and no parser, and a regex comment-eater would silently remove the
    load-bearing explanatory comments the artifact is *supposed* to carry (`/* ^ !important is
    load-bearing …`, `/* three product names do not fit a 375px viewport … */`). One more anchored
    entry, consistent with its neighbours. **Record in the SUMMARY** that this is the third
    instance and that a general rule may be warranted later — as a note for a future todo, not as
    work done here.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json && echo TSC_OK</automated>
    <automated>grep -c '366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78' scripts/marketing-assets.ts | grep -qx 1 && grep -c 'FROZEN_LINE_COUNT = 2167' scripts/marketing-assets.ts | grep -qx 1 && grep -c 'eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294' scripts/marketing-assets.ts | grep -qx 0 && echo FREEZE_OK</automated>
    <automated>grep -c 'HERO_TABS_DECISION_COMMENT_START' scripts/build-marketing-artifact.ts | grep -qx 2 && grep -c 'HERO_TABS_DECISION_COMMENT_END' scripts/build-marketing-artifact.ts | grep -qx 2 && echo ANCHORS_DECLARED_AND_USED</automated>
    <automated>git diff --numstat -- scripts/verify-marketing-artifact.ts | wc -l | grep -qx 0 && echo VERIFIER_UNTOUCHED</automated>
    <automated>shasum -a 256 private/bench/marketing.html | grep -q '^366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78' && wc -l < private/bench/marketing.html | tr -d ' ' | grep -qx 2167 && echo BENCH_UNTOUCHED</automated>
  </verify>
  <done>
`scripts/marketing-assets.ts` carries the new sha and 2167, with no trace of the old sha.
`scripts/build-marketing-artifact.ts` declares the two new anchor constants beside their two
siblings and calls `removeBetween` with them inside `sanitize()`. TypeScript compiles.
`verify-marketing-artifact.ts` is unmodified and the bench source still hashes to the pinned value.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regenerate the manifest and artifact, and prove the OUTPUT carries both changes</name>
  <files>assets/marketing/manifest.json, assets/marketing/landing.html, private/bench/baseline/FROZEN.sha256</files>
  <action>
Run the pipeline in exactly this order. Step 1 is the one an obvious reading omits: the artifact
build does **not** write `manifest.sourceSha256` — it only *refuses to run* when the manifest and
the constant disagree (`scripts/build-marketing-artifact.ts:510`). The sole writer of that field is
`scripts/marketing-assets.ts:334`, reached by its build mode.

1. `npm run marketing:assets` — build mode, no `--check`. Re-verifies the frozen source, re-parses
   `private/bench/baseline/manifest.har`, reconciles the browser-observed asset set against the
   static candidate set, re-copies the manifest-listed files into `public/marketing/`, and writes
   `assets/marketing/manifest.json`.
2. `npx tsx scripts/build-marketing-artifact.ts` (equivalently `npm run marketing:build`) —
   regenerates `assets/marketing/landing.html` and rewrites `nonceScriptCount` into the manifest.
3. `npx tsx scripts/verify-marketing-artifact.ts` (equivalently `npm run marketing:verify`) — must
   print `verify ok` and exit 0.
4. Update `private/bench/baseline/FROZEN.sha256` (gitignored) so the local baseline stays honest.
   Preserve the existing two-column `<sha>  marketing.html` format — regenerate it rather than
   hand-typing, e.g. run `shasum -a 256 marketing.html` from inside `private/bench/` so the
   recorded filename column stays bare.

Then prove the artifact carries both changes. **The freeze proves the INPUT, not the OUTPUT** — a
regenerated artifact that silently dropped an edit would still pass every freeze check. The
automated block below is the proof; read what each assertion is for:

  - the carousel control is a pill container with text tabs — `.cdots` carries
    `border-radius:999px`, `max-width:calc(100vw - 28px)` and a border; `.cdot` carries
    `padding:7px 14px` and `font-weight:600`; the active-state selector keys off `aria-selected`
  - the old bar geometry is gone — zero occurrences of the 26-by-3-pixel width/height pair
  - the old hint span is gone — zero occurrences of its class name and zero of its visible text
  - all three `data-nav` values are present. **Use the curly apostrophe (U+2019)** in the Writer's
    Room grep; the straight `'` matches nothing (V-5)
  - `aria-current` survives exactly **twice** — the nav-link rule and the scrollspy. Not zero: a
    zero here would mean the task over-reached into two correct, out-of-scope usages
  - both new ledes present (entity form `Fun&#363;n`, per V-6) and both old ledes absent
  - **zero** occurrences of every entry in `PROHIBITED_LITERALS`, checked as a set rather than
    cherry-picked — the loop below reads the array out of the verifier source so it cannot drift
    from it
  - manifest shape unchanged: 50 assets / 7 fonts / `nonceScriptCount` 1, `sourceSha256` advanced

**Report the real diff.** Run `git diff --numstat -- assets/marketing/landing.html
assets/marketing/manifest.json` and record the actual numbers in the SUMMARY. Prediction from V-9,
to be checked rather than assumed: landing.html ≈ **33 insertions / 24 deletions**, manifest.json
**1 / 1** (the `sourceSha256` line only — `harCapturedAt` re-reads the same unchanged HAR and the
asset arrays rebuild identically). The hard invariant, derived two independent ways, is that
`wc -l assets/marketing/landing.html` is **1890** (up from 1881). If the numstat differs from the
prediction but the line total is 1890 and every assertion below passes, say so and move on — the
unified-diff algorithm pairs lines its own way. **If the line total is not 1890, stop.**

**STOP conditions — halt and report rather than pressing on:**
  - `wc -l` on the artifact is not 1890
  - the landing.html diff touches any line outside the carousel CSS block, the `.slidenote` rule,
    the three `<section class="slide">` lines, the `.slidenote` span, the two ledes, and the three
    carousel-JS regions (the `forEach` that sets tab state, the active-tab query, the `innerHTML`
    builder). In particular any other `<script`, `<div`, `<section`, `<body`, or any other
    `function`/`const` inside the surviving script
  - the manifest diff touches more than the `sourceSha256` line
  - asset count ≠ 50, font count ≠ 7, or `nonceScriptCount` ≠ 1
  - `git status` shows modified files under `public/marketing/` (the re-copy writes identical
    bytes, so any diff there is a real change in the source assets)
  - the build throws an `assertOccurrences` error naming any anchor other than the two added in
    Task 1 — that would mean an unrelated sanitizer anchor drifted, which V-4 says should not
    happen and which must be understood, not worked around

**Do not run `npm run build`** — it is not in CI's validate job and it clobbers `.next` under the
owner's live dev server on :3000.
  </action>
  <verify>
    <automated>npx tsx scripts/verify-marketing-artifact.ts</automated>
    <automated>wc -l < assets/marketing/landing.html | tr -d ' ' | grep -qx 1890 && echo LINE_TOTAL_1890</automated>
    <automated>grep -q 'border-radius:999px;padding:4px}' assets/marketing/landing.html && grep -q 'max-width:calc(100vw - 28px)' assets/marketing/landing.html && grep -q 'padding:7px 14px' assets/marketing/landing.html && grep -q 'font-weight:600;letter-spacing:.01em' assets/marketing/landing.html && grep -q '\.cdot\[aria-selected="true"\]{color:#fff' assets/marketing/landing.html && echo TABLIST_LANDED</automated>
    <automated>grep -c 'width:26px;height:3px' assets/marketing/landing.html | grep -qx 0 && echo OLD_BARS_GONE</automated>
    <automated>grep -c 'slidenote' assets/marketing/landing.html | grep -qx 0 && grep -c 'hover to pause' assets/marketing/landing.html | grep -qx 0 && echo HINT_SPAN_GONE</automated>
    <automated>grep -cF 'data-nav="The Writer’s Room"' assets/marketing/landing.html | grep -qx 1 && grep -cF 'data-nav="Sound Vault"' assets/marketing/landing.html | grep -qx 1 && grep -cF 'data-nav="The Crate"' assets/marketing/landing.html | grep -qx 1 && echo DATA_NAV_ALL_THREE</automated>
    <automated>grep -c 'aria-current' assets/marketing/landing.html | grep -qx 2 && grep -c 'cdot\[aria-current' assets/marketing/landing.html | grep -qx 0 && echo ARIA_CURRENT_SCOPED_CORRECTLY</automated>
    <automated>grep -cF 'Fun&#363;n&rsquo;s writing room &mdash; the first built for writing a topline' assets/marketing/landing.html | grep -qx 1 && grep -cF 'the split sheet fills in as you write.' assets/marketing/landing.html | grep -qx 1 && grep -cF 'The Sound Vault is where everything a release needs lives on Fun&#363;n:' assets/marketing/landing.html | grep -qx 1 && echo NEW_LEDES_PRESENT</automated>
    <automated>grep -cF 'The first room built for writing a topline together &mdash; by multiplatinum,' assets/marketing/landing.html | grep -qx 0 && grep -cF 'Masters, stems, artwork, credits, metadata and documents live together, and a readiness score' assets/marketing/landing.html | grep -qx 0 && echo OLD_LEDES_GONE</automated>
    <automated>npx tsx -e "import {PROHIBITED_LITERALS} from './scripts/verify-marketing-artifact'; import {readFileSync} from 'node:fs'; const h=readFileSync('assets/marketing/landing.html','utf8'); const bad=PROHIBITED_LITERALS.filter(l=>h.includes(l)); if(bad.length) throw new Error('prohibited literal(s) shipped: '+bad.join(', ')); console.log('NO_PROHIBITED_LITERALS ('+PROHIBITED_LITERALS.length+' checked)')"</automated>
    <automated>node -e "const m=require('./assets/marketing/manifest.json');if(m.assets.length!==50||m.fonts.length!==7||m.nonceScriptCount!==1)throw new Error('manifest shape drifted: assets='+m.assets.length+' fonts='+m.fonts.length+' nonce='+m.nonceScriptCount);if(m.sourceSha256!=='366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78')throw new Error('sourceSha256 not advanced');console.log('MANIFEST_OK')"</automated>
    <automated>git diff --numstat -- assets/marketing/landing.html assets/marketing/manifest.json; git status --porcelain -- public/marketing | wc -l | grep -qx 0 && echo PUBLIC_ASSETS_UNCHANGED</automated>
    <human-check>Already done and not to be repeated as a gate: the owner verified both changes in a browser on the bench at 1440px and 375px — three tabs with the right names, role="tab" inside role="tablist", the state attribute tracking the visible slide, clicking a tab jumps to that slide, tablist 257px wide at 375px with no horizontal page scroll. What is NOT yet seen is the *shipped artifact* rendering. Local `http://localhost:3000/` will redirect to /signin under demo mode and that is expected (V-12) — do not chase it. Confirm instead on the PR's Vercel preview URL at `/` while signed out; if that also redirects, demo mode is on there too, in which case the byte assertions above are the evidence and the owner confirms on www.funun.studio after merge. Do not run `npm run build`.</human-check>
  </verify>
  <done>
`verify-marketing-artifact.ts` prints `verify ok`. The artifact is 1890 lines. Its carousel control
is a pill tablist with all three `data-nav` product names, keyed on `aria-selected`; the 26×3px bar
geometry and the old hint span are gone; `aria-current` survives exactly twice, both out of scope.
Both new ledes are present in entity form and both old ledes are absent. Zero occurrences of every
`PROHIBITED_LITERALS` entry, checked against the array itself rather than a hand-copied subset.
Manifest reports 50 / 7 / 1 with the advanced `sourceSha256`. `public/marketing/` is unchanged.
`private/bench/baseline/FROZEN.sha256` records the new sha. The measured `git diff --numstat` is
recorded for the SUMMARY.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full verification gate, scoped commit, PR</name>
  <files>(no source changes — gate, stage and ship the work from Tasks 1-2)</files>
  <action>
**Run every step CI's `validate` job runs** (`.github/workflows/quality.yml:23-31`, confirmed in
V-10). Not a subset — a weaker gate has already passed a real defect through six consecutive waves
in this repo:

    npm run security:migrations:verify
    npm run typecheck:strict
    npm run lint
    npm test -- --runInBand
    npm audit --omit=dev --audit-level=moderate
    npm audit --audit-level=high

Two notes. `npm run typecheck:strict` is not `tsc --noEmit` — it adds `noUnusedLocals` /
`noUnusedParameters`, which is exactly what catches an anchor constant declared in Task 1b but
never wired into `sanitize()`. `npm run lint` runs `--max-warnings=0`, so any warning fails.
**Do not substitute `npm run build`** — not in validate, and it clobbers `.next` under the live
dev server.

Two suites carry this change: `scripts/marketing-artifact.test.ts` (note the path — it lives
beside the scripts, **not** under `__tests__/`; its `the real generated artifact` block at lines
457-492 loads the committed artifact off disk and asserts `verifyArtifact(...)` returns zero
violations, the loudest failure on a bad re-freeze) and `__tests__/marketing-root-route.test.ts`.
Both run under plain `npm test`; no filter. If either fails, stop and report — do not adjust a
test to match the artifact.

**Stage explicitly. Never `git add -A`.** Stage exactly:

    git add scripts/marketing-assets.ts scripts/build-marketing-artifact.ts \
            assets/marketing/landing.html assets/marketing/manifest.json

plus this plan directory and the SUMMARY. `private/bench/` is gitignored and will not stage. The
five pre-existing untracked files under `.planning/reviews/` and `.planning/todos/pending/` stay
untracked. The stale worktree at `.claude/worktrees/zen-yalow-0b7a42/` is out of scope — do not
edit or stage it. Run `git status --porcelain` before committing and confirm nothing unexpected
is staged.

Commit, push `hero-named-tabs-and-funun-copy` (already created off origin/main — do not create
another branch), and open a PR against `main` (protected — never push `main` directly). PR #126
is open on a different branch, touches no file here, and is **not** a dependency: do not merge it,
rebase onto it, or reference it.

**The PR body must state all of the following.** It is a live change to the public page served at
`/` on www.funun.studio to anonymous visitors (`lib/marketing/rootRewrite.ts`: `pathname === '/'
&& !hasUser`) — lead with that.

  1. **Change 1, with the owner's words.** The control was three 26×3px bars plus the word
     "Carousel". Quote the owner: *"rather than this saying carousel with the three lines there,
     is there a more intuitive button that lets you know that there are other slides?"* Four
     treatments were rendered on the bench; the owner chose named tabs. The three slides are three
     named products, so the control now lists them — The Writer's Room · Sound Vault · The Crate —
     in a pill tablist, with the existing gradient dwell-progress animation moved to a 2px
     underline on the active tab.
  2. **The a11y correction.** State plainly that the state attribute moved from `aria-current` to
     `aria-selected`, that this is the **correct** attribute for `role="tab"` inside a
     `role="tablist"` (the buttons already carried both roles), and that the two surviving
     `aria-current` usages — the nav-link rule and the scrollspy — are correct uses for a current
     *link* and were deliberately left alone. Frame it as a correction, not a rename.
  3. **The mobile size step.** Three product names do not fit a 375px viewport at full size, so a
     `@media(max-width:430px)` rule reduces font size, padding and gap. Owner-verified in a
     browser: 257px wide at 375px, no horizontal page scroll.
  4. **Change 2, with the owner's words.** Quote: *"can we also add copy about Funūn, in the sound
     vault and writer's room slide as well, similar to the crate copy."* The Crate lede already
     named the brand and classified the product; the other two described a feature and never said
     Funūn. Owner picked variants W1 and S2 from four drafts. State that the Grammy and "first
     built for" claims were preserved **verbatim** — they are the owner's, not ours to reword.
  5. **The one new claim, and why it is not a new promise.** *"the split sheet fills in as you
     write"* is already asserted on the same page by the How-it-works ladder, step 4: "Every
     section knows who wrote it. By the time the song is finished the split sheet already reflects
     what actually happened." Say that this was checked against the page rather than assumed —
     this is a rights product and an overclaim is a money bug.
  6. **The deliberate re-freeze.** Old sha `eecfb67d…a58b294` / 2151 lines → new
     `366e6e93…b810fc78` / 2167 lines. The constants, `manifest.sourceSha256`, and the local
     gitignored `FROZEN.sha256` all now name the same bench revision. This is a pinned freeze
     moved on purpose, not drift.
  7. **The third anchored strip, and why the verifier was not weakened.** The new bench comment
     carries a literal `PROHIBITED_LITERALS` bans, and CSS comments are not stripped wholesale.
     The fix is one more anchored `removeBetween` in the sanitizer, matching its two existing
     siblings. State explicitly that the verifier was **not** weakened and the bench was **not**
     edited to dodge the check, and note that this is the third one-off strip — a general rule may
     be warranted later, but a generic CSS-comment stripper would violate the sanitizer's stated
     design (anchored replacement, exact-count assertions, no parser) and would eat the
     load-bearing explanatory comments the artifact is supposed to keep.
  8. **The measured artifact diff line count** from Task 2, and the artifact's new total line
     count (1890). If the numstat differed from the predicted 33/24, say so.
  </action>
  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high && echo FULL_GATE_GREEN</automated>
    <automated>git status --porcelain | grep -E '^[AM]' | grep -vE 'scripts/(marketing-assets|build-marketing-artifact)\.ts|assets/marketing/(landing\.html|manifest\.json)|\.planning/quick/261001-hna' | wc -l | grep -qx 0 && echo STAGING_SCOPED</automated>
    <automated>git status --porcelain | grep -c '^?? \.planning/\(reviews\|todos\)' | grep -qx 5 && echo PREEXISTING_UNTRACKED_PRESERVED</automated>
    <automated>git rev-parse --abbrev-ref HEAD | grep -qx 'hero-named-tabs-and-funun-copy' && echo ON_EXPECTED_BRANCH</automated>
  </verify>
  <done>
All six validate-job commands pass locally, in order, with no substitutions. Only the four
source/artifact files plus this plan directory are staged; the five pre-existing untracked
planning files remain untracked and the stale worktree is untouched. The branch is pushed and a PR
is open against `main` whose body covers all eight required points, including the live-public-page
flag, the owner quotes, the aria-selected correction, and the measured diff.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo → public internet | `assets/marketing/landing.html` is served at `/` on www.funun.studio to anonymous visitors, and `PeteyFranchise/funun` is itself a public repository. Anything that reaches either is permanent. |
| bench source → shipped artifact | `private/bench/marketing.html` is a working surface full of internal notes, placeholders and bench chrome. The sanitizer is the only thing standing between it and the public page. |
| marketing copy → prospective artists | A hero lede is a promise. In a rights product, a claim the software does not keep is a money bug, not a copy bug. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-hna-01 | Information Disclosure | the owner's decision comment at `private/bench/marketing.html:706` | high | mitigate | Task 1b strips it with an anchored `removeBetween`; Task 2 asserts zero occurrences of **every** `PROHIBITED_LITERALS` entry by importing the array itself rather than hand-copying a subset; `verify-marketing-artifact.ts` and `scripts/marketing-artifact.test.ts:466` enforce it independently in CI. |
| T-hna-02 | Tampering | `assets/marketing/landing.html` regenerated from an unverified input | high | mitigate | `build-marketing-artifact.ts:504` refuses any revision whose sha256/line-count differs from the frozen constants, and line 510 additionally refuses a manifest that disagrees. Both constants move in Task 1 before anything is regenerated; Task 1's verify re-hashes the bench to prove it was not edited. |
| T-hna-03 | Tampering | silent content drift during regeneration (markup or script moved, not just the intended regions) | medium | mitigate | Task 2 gates on an exact artifact line total (1890) derived two independent ways, enumerates the only regions allowed to change, requires reporting `git diff --numstat`, and asserts manifest shape numerically. The freeze proves the input, so the output is checked separately. |
| T-hna-04 | Tampering | over-reach into the two correct, out-of-scope `aria-current` usages (nav-link rule, scrollspy) | medium | mitigate | Task 2 asserts `aria-current` survives **exactly twice** — a zero would be a silent regression of nav-link highlighting and scrollspy, which no other check in this repo would catch. |
| T-hna-05 | Information Disclosure | unrelated pre-existing untracked planning files, or the stale worktree, swept into a public commit | medium | mitigate | Task 3 forbids `git add -A`, enumerates exact pathspecs, asserts the five pre-existing untracked files are still untracked after staging, and names the worktree as out of scope. |
| T-hna-06 | Repudiation | shipping a marketing claim the product does not keep | medium | mitigate | V-7 corroborates the one new claim against `private/bench/marketing.html:1720` on the same page; Task 3 requires the PR to state that this was checked rather than assumed. The Grammy / "first built for" claims were preserved verbatim and diffed word-for-word (V-8). |
| T-hna-07 | Tampering | weakening `PROHIBITED_LITERALS`, or editing the bench, to make the gate pass | high | mitigate | Task 1's action states three hard NOs and its verify asserts `verify-marketing-artifact.ts` has a zero-line diff and the bench still hashes to the pinned value. |

No package-manager installs are performed by this plan, so no package legitimacy gate applies.
</threat_model>

<verification>
1. `npx tsx scripts/verify-marketing-artifact.ts` exits 0 with `verify ok`.
2. `scripts/marketing-artifact.test.ts` and `__tests__/marketing-root-route.test.ts` pass inside
   the full `npm test -- --runInBand` run.
3. All six CI validate-job commands pass locally, in order, with no substitutions.
4. The regenerated artifact is 1890 lines, carries the named-tab pill control and both new ledes,
   and carries no internal decision commentary.
5. `aria-current` survives exactly twice; neither survivor is inside a `.cdot` selector.
6. The artifact diff is confined to the enumerated regions, and its actual line counts are
   reported rather than assumed.
7. `private/bench/marketing.html` and `scripts/verify-marketing-artifact.ts` are unmodified.
</verification>

<success_criteria>
- The hero carousel control on the page served at `/` reads three product names in a pill tablist,
  with the dwell animation as a 2px underline under the active tab.
- The active tab is marked `aria-selected`; the two out-of-scope `aria-current` usages are intact.
- The Writer's Room and Sound Vault ledes both name Funūn and classify the product; the Grammy and
  "first built for" claims survive verbatim.
- `assets/marketing/landing.html` is fully regenerable from the current bench source — no hand
  edits anywhere in the artifact or the manifest.
- The freeze constants, `manifest.sourceSha256`, and the local `FROZEN.sha256` all name the same
  bench revision.
- No internal commentary reached the public artifact, and the verifier was not weakened.
- A PR is open against `main` covering all eight required points, flagging that this is a live
  change to a public page.
</success_criteria>

<output>
Create `.planning/quick/261001-hna-hero-named-tabs-and-funun-copy/261001-hna-SUMMARY.md` when done.

Record in it: the measured `git diff --numstat` counts for `landing.html` and `manifest.json` and
the artifact's final line count; whether the prediction (33/24, total 1890) held — if it missed,
say so and explain why, a prediction that missed is worth more recorded than quietly overwritten;
confirmation that `aria-current` survives exactly twice and where; the manifest's asset/font/nonce
counts after the rebuild; the note that this is the **third** one-off sanitizer strip and that a
general rule may be warranted later (as a future todo, not work done here); and the PR URL.
</output>
