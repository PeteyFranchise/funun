---
phase: quick/261001-dsh
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
requirements: [DSH-01, DSH-02, DSH-03]
branch: copy-remove-em-dashes
pr_base: hero-named-tabs-and-funun-copy

must_haves:
  truths:
    - "Reader-facing copy on the shipped marketing artifact contains zero em dashes, measured by a check that is proven non-vacuous against the pre-change artifact (25 today, 0 after)."
    - "Compound hyphens, en-dash date ranges and the credits-table no-value placeholders are untouched, measured as exact invariance rather than a loose floor."
    - "The page title and social description read with a middle dot and a comma, with no stray space before that comma."
    - "No internal decision commentary reaches the public artifact, and the verifier was not weakened to achieve that."
    - "The artifact is regenerable byte-for-byte from the current bench source with no hand edits."
    - "Every step of CI's validate job passes locally before the PR opens."
    - "The PR is stacked on the open hero-named-tabs branch, not on main."
  artifacts:
    - scripts/marketing-assets.ts (FROZEN_SHA256 advanced to the em-dash-clean bench revision; FROZEN_LINE_COUNT unchanged at 2167)
    - scripts/build-marketing-artifact.ts (title and description constants, already edited in the working tree, committed as-is)
    - assets/marketing/landing.html (regenerated, carrying the 28 copy-line edits and the 6 head meta lines)
    - assets/marketing/manifest.json (sourceSha256 advanced by scripts/marketing-assets.ts)
    - private/bench/baseline/FROZEN.sha256 (gitignored local baseline kept honest)
  key_links:
    - "scripts/marketing-assets.ts:42 FROZEN_SHA256 -> build-marketing-artifact.ts:517 frozen-source gate (refuses any other revision)"
    - "scripts/marketing-assets.ts:42 FROZEN_SHA256 -> build-marketing-artifact.ts:526 manifest.sourceSha256 equality gate (the step the obvious order of operations fails on)"
    - "scripts/marketing-assets.ts:334 -> assets/marketing/manifest.json sourceSha256 (the ONLY writer of that field)"
    - "build-marketing-artifact.ts:40,42 PRODUCTION_TITLE/PRODUCTION_DESCRIPTION -> lines 392-401 -> 6 head meta lines in the artifact (3 title + 3 description occurrences)"
    - "verify-marketing-artifact.ts:26-44 PROHIBITED_LITERALS -> scripts/marketing-artifact.test.ts:466 verifyArtifact(...) == []"
---

<objective>
Remove the em dash from every piece of reader-facing copy on the public marketing page at `/`,
then re-freeze the bench baseline and regenerate the shipped artifact.

Purpose. Owner, verbatim: *"Go through all of the copy on the marketing page and take away all of
the dashes - because it looks like AI written, we are going for the industry, cool human tone."*
The em dash is the tell. Hyphens, en dashes and the credits-table no-value placeholder are not,
and they stay.

**The editorial work is already done. Do not redo it and do not re-edit the bench.** Two files
already carry it: `private/bench/marketing.html` (gitignored, 29 anchored edits, browser-verified)
and `scripts/build-marketing-artifact.ts` (uncommitted working-tree edit to the title and
description constants). This plan is the re-freeze, the regeneration, the output proof, the gate
and the stacked PR.

Output: an advanced freeze constant, a regenerated `assets/marketing/landing.html` and
`assets/marketing/manifest.json`, and a PR opened with `--base hero-named-tabs-and-funun-copy`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md
@.planning/quick/261001-hna-hero-named-tabs-and-funun-copy/261001-hna-PLAN.md

@scripts/marketing-assets.ts
@scripts/build-marketing-artifact.ts
@scripts/verify-marketing-artifact.ts
@scripts/marketing-artifact.test.ts
</context>

<verified_findings>

Every claim below was checked against source in this session, with the command that checked it.
This repo's standing rule is that a plan is only as true as its claims about the code, and a
result that is *named* must be verified against an independent source. Several of these findings
sharpen the briefing rather than restate it. Read all of them before Task 1.

**V-1. The bench edit is on disk and the briefing's target sha is exact.**
`shasum -a 256 private/bench/marketing.html` returns
`47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527`; `wc -l` returns **2167**.
`scripts/marketing-assets.ts:41-42` still pins `366e6e93...b810fc78` and `:43` pins
`FROZEN_LINE_COUNT = 2167`. `assets/marketing/manifest.json` records
`sourceSha256: 366e6e93...b810fc78`, 50 assets, 7 fonts, `nonceScriptCount: 1`.
`private/bench/baseline/FROZEN.sha256` records `366e6e93...b810fc78  marketing.html` (two spaces
between the two columns).

**V-2. Both line-count tripwires are dead this time, not just one.** The briefing flags that
`FROZEN_LINE_COUNT` does not move (2167 to 2167). The *artifact* line count does not move either:
a dry run of `sanitize()` over the current bench produces **1890** lines, and the committed
artifact is already **1890**. The last two re-freezes both had an artifact line total as the
hard invariant. This one has none. V-4 through V-8 are what replace it, and they are stronger
because they are content assertions with a proven-failing control rather than a size check.

**V-3. The dry run is byte-identical to what the build will write, so these predictions are
measurements, not guesses.** `main()` at `scripts/build-marketing-artifact.ts:514-552` reads the
source, checks the freeze, calls `sanitize(source)`, and writes `result.html` verbatim with no
post-processing. So `sanitize()` called in isolation produces exactly the file the build produces.
Every number in V-4 through V-8 was measured on that dry-run output, written to a scratchpad file,
never to `assets/`.

**V-4. The predicted artifact's complete em dash inventory, categorised, totalling 44.**
41 literal `U+2014` plus 3 escaped. Removing each category in turn:

  | category | removed | running total |
  |---|---|---|
  | start | | 44 |
  | HTML comments | 0 | 44 |
  | CSS and JS block comments `/* */` | 17 | 27 |
  | JS line comments `//` (guarded so `://` in URLs is not eaten) | 8 | 19 |
  | credits-table no-value placeholders `pro:`/`ipi:`/`pub:` | **16** (7 + 7 + 2) | 3 |
  | `art:'...'` art-direction strings | **3** | **0** |

**The briefing's exclusion list is one category short.** It names the 16 placeholders but not the
3 escaped em dashes inside the `art:'...'` strings, which are JS string literals and therefore
survive comment-stripping. They are at artifact lines 1842, 1846 and 1853 today, carry
`Midjourney pending` and similar art-direction notes, are never rendered, and were deliberately
left alone. A check that strips only comments and the 16 placeholders lands on **3**, not 0, and
whoever runs it will be tempted to weaken it. The gate in Task 2 excludes that fourth category
explicitly and **asserts the size of every exclusion** (16 and 3), so widening one silently fails.

**V-5. The em dash gate is non-vacuous. Positive control: 25.** The identical pipeline run against
the currently committed `assets/marketing/landing.html` leaves **25** reader-facing em dashes. So
the gate measures 25 before and 0 after. Task 2 runs that control as its own automated check,
reading the pre-change artifact from `git show HEAD:...` rather than trusting memory. A check that
prints green without exercising what it claims to cover is worse than no check.

**V-6. CORRECTION: the title phrase occurs FOUR times in the artifact, not three.** The briefing
asks for 3. Three are the head meta lines. The fourth, at artifact line 1064, is
`<p class="ftag">Make the song. Keep the record.</p>`, a footer tagline with no brand prefix and
no em dash, which is unchanged and must stay. **Grep the full string including the brand and the
separator** (`Funūn` + middle dot + `Make the song. Keep the record.`): that form occurs exactly
**3** times in the dry-run output, measured. A grep on the bare phrase returns 4 and would read as
a failure.

**V-7. Compound hyphens and en dashes are exactly invariant, which is a stronger gate than the
briefing's floor.** The briefing asks for "at least 20". Measured on visible text (HTML comments,
`<script>` and `<style>` removed): **69** compound hyphens, identical in the committed artifact and
the dry-run output, made of 68 ASCII and 1 `&#8209;` entity. Raw whole-file, also identical in
both: **1327** ASCII compounds, **4** `U+2011` non-breaking compounds, **2** `&#8209;` entities,
and **4** en dashes. Task 2 gates on exact equality on all of these. The `U+2011` forms the owner
listed (`invite`, `opt-in`, `read-only`) live inside JS strings, so a visible-text-only count
misses them. The raw counts are what cover them.

**V-8. The predicted diff is 34 insertions and 34 deletions, and every changed line was read.**
`git diff --no-index --numstat` between the committed artifact and the dry-run output reports
`34 34`. Six are the head meta lines. The remaining 28 are copy. Reading all 34, there is exactly
**one change that is not a pure copy string**: the pricing feature-list builder, which goes from
`'<strong>'+x[0]+'</strong> ' + <dash> + ' '+x[1]` to `'<strong>'+x[0]+':</strong> '+x[1]`. The
colon moves inside the `<strong>`. That is the briefing's "feature `<strong>label</strong>`
separator, now a colon" and it is the only markup movement. Everything else is text inside a tag
or inside a quoted JS string. Name it in the STOP list so it does not read as drift.

**V-9. CONFIRMED, not assumed: no new sanitizer strip is needed.** The briefing says to confirm
this rather than assume it. `PROHIBITED_LITERALS` at `scripts/verify-marketing-artifact.ts:26-44`
holds **17** entries; importing that array and testing the dry-run output against it returns
**zero** violations. No new internal-commentary comment was introduced by the copy edit, so
`build-marketing-artifact.ts` needs no fourth anchored removal. **If `marketing:verify` reports a
prohibited literal anyway, stop and report. Do not edit the verifier.**

**V-10. CONFIRMED: no test pins the old title or description.** The briefing asks for this to be
re-verified. `grep -rn 'Make the song. Keep the record' --include=*.ts --include=*.tsx
--include=*.json` outside `assets/marketing` matches exactly one line:
`scripts/build-marketing-artifact.ts:40`. `scripts/marketing-artifact.test.ts:256-258` uses a
generic fixture (`<title>Production title</title>`), not the production constant.
`__tests__/marketing-root-route.test.ts` asserts nothing about either string. The constants are
consumed only at `build-marketing-artifact.ts:392-401`.

**V-11. The bench page title at `private/bench/marketing.html:6` was NOT edited, and that matters.**
It still reads the bench-chrome title with an em dash in it. `replaceExactly` anchors on that exact
string to swap in `PRODUCTION_TITLE`, and `scripts/marketing-artifact.test.ts:256` quotes it as a
fixture. Had the copy pass "cleaned" it, the build would throw and the unit test would fail. It did
not. Leave it.

**V-12. The working-tree edit to `scripts/build-marketing-artifact.ts` is exactly the two
constants and nothing else.** `git diff` on that file shows one hunk: line 40 `PRODUCTION_TITLE`
swaps the em dash for a middle dot, and lines 42-44 `PRODUCTION_DESCRIPTION` moves the comma onto
the end of the previous concatenated fragment so the join produces `registration, all in one
place.` with no stray space. Verified in the dry-run head: the description tail occurs 3 times and
the bad spaced form occurs **0** times. **Commit this edit. Do not rewrite it.**

**V-13. CI's validate job is exactly the six commands in CLAUDE.md**, read from
`.github/workflows/quality.yml:24-31`. `npm run marketing:verify` is **not** a CI step; the
pipeline reaches CI only through `scripts/marketing-artifact.test.ts:460-493`, whose
`the real generated artifact` block loads the committed artifact off disk and asserts
`verifyArtifact(...)` returns zero violations. Run `marketing:verify` manually anyway, because it
reports every violation at once instead of one jest failure.

**V-14. Branch and working tree.** `git rev-parse --abbrev-ref HEAD` returns
`copy-remove-em-dashes`, sitting at `19a7d6ab` with no commits of its own, and
`git merge-base --is-ancestor hero-named-tabs-and-funun-copy HEAD` succeeds: this branch is stacked
on that one. `gh pr view 127` confirms PR #127 is OPEN, head `hero-named-tabs-and-funun-copy`, base
`main`, MERGEABLE. Working tree is clean except the one modified script and **five** pre-existing
untracked files, three under the planning reviews directory and two under planning todos. They are
earlier work and must not be staged. The stale worktree at `.claude/worktrees/zen-yalow-0b7a42/`
is out of scope.

**V-15. `npm run marketing:assets` exists** (`package.json` scripts: `tsx scripts/marketing-assets.ts`)
and its build mode at `scripts/marketing-assets.ts:333-340` is the only writer of
`manifest.sourceSha256`. The artifact build does not write it; it only refuses to run when the
manifest and the constant disagree.

</verified_findings>

<tasks>

<!-- These literals are negative-greped against assets/marketing/landing.html, a file no task -->
<!-- here writes by hand, and are discussed in prose only. The echo risk the discipline rule -->
<!-- guards against does not apply. -->
<!-- planner-discipline-allow: .planning/ -->
<!-- planner-discipline-allow: OWNER DECISION -->
<!-- planner-discipline-allow: &mdash; -->
<!-- planner-discipline-allow: registration , all -->
<!-- planner-discipline-allow: Bench 02 -->
<!-- planner-discipline-allow: Bench mock -->
<!-- planner-discipline-allow: shipexit -->

<task type="auto">
  <name>Task 1: Advance the freeze constant, and confirm no new sanitizer strip is needed</name>
  <files>scripts/marketing-assets.ts</files>
  <action>
One edit, plus one confirmation that must be performed rather than assumed.

**1a. `scripts/marketing-assets.ts`, line 42.** Replace the `FROZEN_SHA256` string literal:
`366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78` becomes
`47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527`.

**`FROZEN_LINE_COUNT` on line 43 stays at 2167.** Every edit in the copy pass was in place, so the
bench did not grow or shrink (V-1). Do not "fix" it. Change nothing else in this file: the path
constants, `PRODUCTION_FONT_FILES` and every exported function stay as they are.

**1b. Do NOT edit `scripts/build-marketing-artifact.ts`.** It already carries the title and
description change in the working tree (V-12), applied and verified in a previous session. It is
committed as-is in Task 3. Rewriting it risks reintroducing the spaced-comma bug that was already
caught and fixed once.

**1c. Confirm, do not assume, that no fourth anchored comment strip is needed.** The last two
re-freezes each added one, because each bench edit introduced an internal decision comment that
`PROHIBITED_LITERALS` bans from the public artifact. This one should not, because the copy pass
added no new comment. Prove it by importing `PROHIBITED_LITERALS` from the verifier and testing the
dry-run sanitizer output against the whole array, which the verify block below does. Expected: 17
literals checked, 0 violations (V-9).

**Scope discipline, three hard NOs.**
  - Do not touch `scripts/verify-marketing-artifact.ts`. Do not add to or remove from
    `PROHIBITED_LITERALS`. If the check fires, stop and report. Weakening the verifier to pass is
    the one move this task must not make.
  - Do not edit `private/bench/marketing.html`. It is gitignored and final. Any edit invalidates
    the sha 1a just pinned, and the verify below re-hashes it to prove it did not move.
  - Do not touch the bench page title at bench line 6 even though it contains an em dash. It is
    bench chrome, it is never shipped, and `replaceExactly` plus a unit test both anchor on it
    (V-11).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json && echo TSC_OK</automated>
    <automated>grep -c '47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527' scripts/marketing-assets.ts | grep -qx 1 && grep -c 'FROZEN_LINE_COUNT = 2167' scripts/marketing-assets.ts | grep -qx 1 && grep -c '366e6e93759e9aa9272f6c63e678d2edcdbd8728c1286ae2a3bae496b810fc78' scripts/marketing-assets.ts | grep -qx 0 && echo FREEZE_ADVANCED</automated>
    <automated>shasum -a 256 private/bench/marketing.html | grep -q '^47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527' && wc -l < private/bench/marketing.html | tr -d ' ' | grep -qx 2167 && echo BENCH_UNTOUCHED</automated>
    <automated>git diff --numstat -- scripts/verify-marketing-artifact.ts | wc -l | tr -d ' ' | grep -qx 0 && echo VERIFIER_UNTOUCHED</automated>
    <automated>git diff --numstat -- scripts/build-marketing-artifact.ts | awk '{print $1"/"$2}' | grep -qx '3/3' && grep -c "PRODUCTION_TITLE = 'Fun" scripts/build-marketing-artifact.ts | grep -qx 1 && echo BUILD_SCRIPT_EDIT_INTACT</automated>
    <automated>npx tsx -e "import {PROHIBITED_LITERALS} from './scripts/verify-marketing-artifact'; import {sanitize} from './scripts/build-marketing-artifact'; import {readFileSync} from 'node:fs'; const h=sanitize(readFileSync('private/bench/marketing.html','utf8')).html; const bad=PROHIBITED_LITERALS.filter(l=>h.includes(l)); if(bad.length) throw new Error('a fourth strip IS needed, stop and report: '+bad.join(', ')); console.log('NO_NEW_STRIP_NEEDED ('+PROHIBITED_LITERALS.length+' literals checked, 0 violations)')"</automated>
  </verify>
  <done>
`scripts/marketing-assets.ts` pins the new sha with no trace of the old one, and still pins 2167.
`scripts/verify-marketing-artifact.ts` has a zero-line diff. `scripts/build-marketing-artifact.ts`
still carries exactly its pre-existing 3-line working-tree edit (3 insertions, 3 deletions). The bench source still hashes to
the pinned value. A dry-run sanitize of the bench carries zero prohibited literals, so no fourth
anchored strip is needed, confirmed rather than assumed. TypeScript compiles.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regenerate the manifest and artifact, and prove the OUTPUT reaches zero</name>
  <files>assets/marketing/manifest.json, assets/marketing/landing.html, private/bench/baseline/FROZEN.sha256</files>
  <action>
Run the pipeline in exactly this order. Step 1 is the one an obvious reading omits: the artifact
build does **not** write `manifest.sourceSha256`. It only refuses to run when the manifest and the
constant disagree (`scripts/build-marketing-artifact.ts:526`). The sole writer is
`scripts/marketing-assets.ts:334`, reached by its build mode (V-15).

1. `npm run marketing:assets` with no `--check` flag. Re-verifies the frozen source, re-parses the
   browser-captured HAR, reconciles observed against static assets, re-copies the manifest-listed
   files into `public/marketing/`, and writes `assets/marketing/manifest.json`.
2. `npx tsx scripts/build-marketing-artifact.ts` (equivalently `npm run marketing:build`).
3. `npx tsx scripts/verify-marketing-artifact.ts` (equivalently `npm run marketing:verify`). Must
   print `verify ok` and exit 0.
4. Update `private/bench/baseline/FROZEN.sha256` (gitignored). Preserve the existing two-column
   format with the bare filename in the second column. Regenerate it rather than hand-typing: run
   `shasum -a 256 marketing.html` from inside `private/bench/`.

Then prove the OUTPUT. **The freeze proves the INPUT, not the output**, and this time there is no
line-count tripwire at all (V-2) because neither the bench nor the artifact changed size. The
assertions below are the whole safety net. Read what each one is for:

  - **Reader-facing em dashes reach zero.** The gate strips HTML comments, then `/* */` blocks,
    then `//` line comments guarded so `://` inside a URL is not eaten, then removes the 16
    credits-table no-value placeholders, then removes the 3 escaped em dashes inside the
    `art:'...'` art-direction strings. **It asserts the size of both exclusions (16 and 3) before
    asserting zero**, so a silently-widened exclusion fails loudly instead of manufacturing a
    green. The `art:` category is the one the briefing's exclusion list omits (V-4); without it the
    check floors at 3 and invites being weakened.
  - **The gate is proven non-vacuous.** A separate control runs the identical pipeline over the
    pre-change artifact read from `git show HEAD:assets/marketing/landing.html` and asserts it is
    greater than zero. It measures **25** (V-5). A gate that cannot fail is not a gate.
  - **Title and description.** The full title string including the brand and the middle dot occurs
    exactly **3** times. Do not grep the bare phrase: it occurs 4 times, because the footer tagline
    at line 1064 repeats it without the brand prefix and is correctly unchanged (V-6). The
    description tail occurs 3 times and the spaced-comma bug occurs 0 times.
  - **Hyphens and en dashes are exactly invariant.** Visible-text compounds stay at 69 (68 ASCII +
    1 entity). Raw whole-file stays at 1327 ASCII, 4 non-breaking, 2 entity, and 4 en dashes. The
    raw counts are what cover the non-breaking compounds that live inside JS strings and are
    invisible to a visible-text count (V-7).
  - **Zero occurrences of every `PROHIBITED_LITERALS` entry**, read out of the verifier source so
    the set cannot drift from a hand-copied subset.
  - **Manifest shape unchanged:** 50 assets, 7 fonts, `nonceScriptCount` 1, `sourceSha256` advanced.

**Report the real diff.** Run `git diff --numstat -- assets/marketing/landing.html
assets/marketing/manifest.json` and record the actual numbers in the SUMMARY. Measured prediction
from V-8, to be checked rather than assumed: `landing.html` **34 insertions / 34 deletions**,
`manifest.json` **1 / 1** (the `sourceSha256` line only; `harCapturedAt` re-reads the same unchanged
HAR and the asset arrays rebuild identically). The artifact stays at **1890** lines.

**STOP conditions. Halt and report rather than pressing on:**
  - the em dash gate does not reach 0, or either exclusion count is not 16 and 3
  - the positive control reports 0, meaning the gate proves nothing
  - the artifact line total is not 1890, or the numstat is not 34/34
  - the `landing.html` diff touches any line that is not one of: the six head meta lines, text
    inside an HTML tag, text inside a quoted JS string, or the single allowed markup micro-change
    where the pricing feature-list builder moves a colon inside its `<strong>` (V-8). Any other
    `<script`, `<div`, `<section`, `<body`, or any `function`/`const` moving is a stop.
  - the manifest diff touches more than the `sourceSha256` line, or the shape is not 50 / 7 / 1
  - `git status` shows modified files under `public/marketing/`. The re-copy writes identical
    bytes, so any diff there is a real change in the source assets.
  - the build throws an `assertOccurrences` error naming any sanitizer anchor. V-9 and V-11 say
    none should drift, and a drift must be understood, not worked around.

**Do not run `npm run build`.** It is not in CI's validate job and it clobbers `.next` under the
owner's live dev server on port 3000.
  </action>
  <verify>
    <automated>npx tsx scripts/verify-marketing-artifact.ts</automated>
    <automated>wc -l < assets/marketing/landing.html | tr -d ' ' | grep -qx 1890 && echo LINE_TOTAL_1890_UNCHANGED</automated>
    <automated>node -e "const fs=require('fs');const raw=fs.readFileSync('assets/marketing/landing.html','utf8');const em=s=>((s.match(/—/g)||[]).length)+((s.match(/&mdash;/g)||[]).length);let h=raw;const total=em(h);h=h.replace(/<!--[\s\S]*?-->/g,'');h=h.replace(/\/\*[\s\S]*?\*\//g,'');h=h.replace(/(^|[^:])\/\/[^\n]*/g,'\$1');let ph=0;h=h.replace(/(?:pro|ipi|pub):'—'/g,()=>{ph++;return 'X';});let art=0;h=h.replace(/art:'[^']*'/g,m=>{art+=em(m);return 'X';});const left=em(h);console.log('total='+total+' placeholdersExcluded='+ph+' artStringsExcluded='+art+' readerFacing='+left);if(ph!==16)throw new Error('placeholder exclusion is wrong: expected 16, removed '+ph);if(art!==3)throw new Error('art-string exclusion is wrong: expected 3, removed '+art);if(left!==0)throw new Error(left+' reader-facing em dash(es) remain');console.log('READER_FACING_EM_DASHES_ZERO')"</automated>
    <automated>node -e "const raw=require('child_process').execSync('git show HEAD:assets/marketing/landing.html',{encoding:'utf8',maxBuffer:1e8});const em=s=>((s.match(/—/g)||[]).length)+((s.match(/&mdash;/g)||[]).length);let h=raw.replace(/<!--[\s\S]*?-->/g,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'\$1').replace(/(?:pro|ipi|pub):'—'/g,'X').replace(/art:'[^']*'/g,'X');const n=em(h);console.log('PRE_CHANGE_READER_FACING='+n);if(n===0)throw new Error('positive control is vacuous: the pre-change artifact already measures 0, so the gate above proves nothing');console.log('POSITIVE_CONTROL_OK')"</automated>
    <automated>node -e "const h=require('fs').readFileSync('assets/marketing/landing.html','utf8');const t='Funūn · Make the song. Keep the record.';const c=h.split(t).length-1;if(c!==3)throw new Error('full title string occurs '+c+' time(s), expected 3');if(h.includes('registration , all'))throw new Error('stray space before the comma is back in the description');const d=h.split('registration, all in one place.').length-1;if(d!==3)throw new Error('description tail occurs '+d+' time(s), expected 3');console.log('TITLE_AND_DESCRIPTION_OK (3 title, 3 description, 0 spaced-comma)')"</automated>
    <automated>node -e "const raw=require('fs').readFileSync('assets/marketing/landing.html','utf8');const vis=raw.replace(/<!--[\s\S]*?-->/g,'').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'');const n=r=>(raw.match(r)||[]).length;const v=r=>(vis.match(r)||[]).length;const visTotal=v(/[A-Za-z]-[A-Za-z]/g)+v(/[A-Za-z]‑[A-Za-z]/g)+v(/[A-Za-z]&#8209;[A-Za-z]/g);const got=[visTotal,n(/[A-Za-z]-[A-Za-z]/g),n(/[A-Za-z]‑[A-Za-z]/g),n(/[A-Za-z]&#8209;[A-Za-z]/g),n(/–/g)];const want=[69,1327,4,2,4];console.log('visible='+got[0]+' rawAscii='+got[1]+' rawNbHyphen='+got[2]+' rawEntity='+got[3]+' enDashes='+got[4]);if(got.join()!==want.join())throw new Error('hyphen/en-dash counts moved: got '+got.join()+', expected '+want.join());console.log('HYPHENS_AND_EN_DASHES_EXACTLY_INTACT')"</automated>
    <automated>npx tsx -e "import {PROHIBITED_LITERALS} from './scripts/verify-marketing-artifact'; import {readFileSync} from 'node:fs'; const h=readFileSync('assets/marketing/landing.html','utf8'); const bad=PROHIBITED_LITERALS.filter(l=>h.includes(l)); if(bad.length) throw new Error('prohibited literal(s) shipped: '+bad.join(', ')); console.log('NO_PROHIBITED_LITERALS ('+PROHIBITED_LITERALS.length+' checked)')"</automated>
    <automated>node -e "const m=require('./assets/marketing/manifest.json');if(m.assets.length!==50||m.fonts.length!==7||m.nonceScriptCount!==1)throw new Error('manifest shape drifted: assets='+m.assets.length+' fonts='+m.fonts.length+' nonce='+m.nonceScriptCount);if(m.sourceSha256!=='47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527')throw new Error('sourceSha256 not advanced');console.log('MANIFEST_OK')"</automated>
    <automated>git diff --numstat -- assets/marketing/landing.html | awk '{print $1"/"$2}' | grep -qx '34/34' && git diff --numstat -- assets/marketing/manifest.json | awk '{print $1"/"$2}' | grep -qx '1/1' && git status --porcelain -- public/marketing | wc -l | tr -d ' ' | grep -qx 0 && echo DIFF_AS_PREDICTED_AND_PUBLIC_ASSETS_UNCHANGED</automated>
    <automated>grep -c '47e284e999ec494924e3859beaaeff626ea18981d4a89e7f1046a328dd0ab527  marketing.html' private/bench/baseline/FROZEN.sha256 | grep -qx 1 && echo LOCAL_BASELINE_UPDATED</automated>
    <human-check>Already done and not to be repeated as a gate: the owner reviewed the edited bench in a browser with all three carousel slides forced visible and every collapsible expanded, and confirmed the copy reads right. What is NOT yet seen is the shipped artifact rendering. Local `http://localhost:3000/` redirects to /signin under demo mode and that is expected and pre-existing, so do not chase it. Confirm instead on the PR's Vercel preview at `/` while signed out; if that also redirects, demo mode is on there too, in which case the byte assertions above are the evidence and the owner confirms on www.funun.studio after merge. Do not run `npm run build`.</human-check>
  </verify>
  <done>
`verify-marketing-artifact.ts` prints `verify ok`. The artifact is still 1890 lines and its diff is
exactly 34/34, the manifest's exactly 1/1, with `public/marketing/` unchanged. Reader-facing em
dashes measure **0**, with both exclusions size-asserted at 16 and 3, and the positive control
proves the same gate measures 25 on the pre-change artifact. The full title string occurs 3 times,
the description tail 3 times, the spaced-comma bug 0 times. Hyphen and en-dash counts are exactly
unchanged at 69 / 1327 / 4 / 2 / 4. Zero occurrences of all 17 prohibited literals. Manifest reports
50 / 7 / 1 with the advanced `sourceSha256`. The gitignored local baseline records the new sha.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full verification gate, scoped commit, stacked PR</name>
  <files>(no source changes: gate, stage and ship the work from Tasks 1-2)</files>
  <action>
**Run every step CI's `validate` job runs** (`.github/workflows/quality.yml:24-31`, confirmed in
V-13). Not a subset. A weaker gate has already passed a real defect through six consecutive waves
in this repo:

    npm run security:migrations:verify
    npm run typecheck:strict
    npm run lint
    npm test -- --runInBand
    npm audit --omit=dev --audit-level=moderate
    npm audit --audit-level=high

Two notes. `npm run typecheck:strict` is not `tsc --noEmit`: it adds `noUnusedLocals` and
`noUnusedParameters`. `npm run lint` runs with `--max-warnings=0`, so any warning fails the build.
**Do not substitute `npm run build`**: it is not in validate and it clobbers `.next` under the live
dev server.

Two suites carry this change. `scripts/marketing-artifact.test.ts` lives beside the scripts, **not**
under `__tests__/`; its `the real generated artifact` block at lines 460-493 loads the committed
artifact off disk and asserts `verifyArtifact(...)` returns zero violations, which is the loudest
failure on a bad re-freeze. `__tests__/marketing-root-route.test.ts` is the other. Both run under
plain `npm test` with no filter. V-10 confirmed neither pins the old title or description, so
neither should need touching. **If either fails, stop and report. Do not adjust a test to match the
artifact.**

**Stage explicitly. Never `git add -A`.** Stage exactly:

    git add scripts/marketing-assets.ts scripts/build-marketing-artifact.ts \
            assets/marketing/landing.html assets/marketing/manifest.json

plus this plan directory and the SUMMARY. `private/bench/` is gitignored and will not stage. The
five pre-existing untracked files under the planning reviews and planning todos directories stay
untracked. The stale worktree at `.claude/worktrees/zen-yalow-0b7a42/` is out of scope: do not edit
or stage it. Run `git status --porcelain` before committing and confirm nothing unexpected is
staged. Parallel sessions can make a remembered tree state stale, so re-check it rather than
trusting the snapshot in this plan.

Commit, push `copy-remove-em-dashes` (already created and checked out; do not create another
branch), and open the PR with:

    gh pr create --base hero-named-tabs-and-funun-copy ...

**This is stacked on PR #127, not on main** (V-14). Do not rebase onto main, do not merge #127, and
do not open against `main`. Never push `main` directly; it is protected.

**The PR body must state all of the following.** Lead with the fact that this is a live change to
the public page served at `/` on www.funun.studio to anonymous visitors
(`lib/marketing/rootRewrite.ts`: path is `/` and there is no user), and that it is stacked on
#127 so the diff should be read against that branch.

  1. **The owner's words, verbatim:** *"Go through all of the copy on the marketing page and take
     away all of the dashes - because it looks like AI written, we are going for the industry, cool
     human tone."*
  2. **A before/after table of the copy edits, grouped by section.** The editing pass counted 29
     anchored edits; they land as 28 changed lines in the artifact plus the 6 head meta lines,
     because a few edits span two wrapped source lines. Use the measured 28 when describing the
     diff and the owner-facing 29 when describing the editorial work, and say which is which
     rather than reconciling them silently. Sections: hero lede, The Crate
     section, Selects header and figcaption, FAQ intro, the 9 FAQ answers, the 5 pricing feature
     blurbs, the pricing feature label separator, the 2 How-it-works steps, PitchPlug and
     SampleClear tool copy, the Entourage band, the footer legal note. Note that most em dashes
     became periods, some commas, one a colon, and one became a middle dot to match the page's own
     existing metadata idiom (the Selects attribution line, which already reads name then middle
     dot then context elsewhere on the page).
  3. **The three categories deliberately left alone, and why.** Compound hyphens
     (`Grammy-winning`, `invite-only`, `opt-in`, `read-only`, `co-writer`, `one-stop`,
     `last-minute`, `release-ready`): the owner meant the em-dash tic, not English. En dashes in
     date ranges (`1685` to `1750` and three others): correct typography. The em dash as a no-value
     placeholder in the collaborator credits data: a standard credits-table convention, not prose.
     Give the measured counts: 69 visible compounds, 4 en dashes and 16 placeholders, all exactly
     unchanged.
  4. **The title and social description change,** since it is the part a reader sees in a search
     result and a link preview rather than on the page. The two constants alone account for 6 of
     the artifact's em dashes, because each string appears three times across `<title>`, `og:` and
     `twitter:`. Note that an earlier attempt produced a stray space before the comma, that it was
     caught and fixed, and that the artifact is now asserted against that exact bug.
  5. **The line count did not move, and what was used as a tripwire instead.** Both the bench
     (2167) and the artifact (1890) are the same size before and after, because every edit was in
     place. The last two re-freezes leaned on an artifact line total; this one cannot. State what
     replaced it: an em dash gate that measures 25 on the pre-change artifact and 0 on this one,
     with both of its exclusions size-asserted; exact-equality counts on hyphens and en dashes; an
     exact 34/34 numstat with every changed line read; and the full prohibited-literal set checked
     by importing the array rather than hand-copying it.
  6. **No sanitizer change was needed, and that was confirmed rather than assumed.** Unlike the
     previous two re-freezes, the copy pass introduced no new internal commentary, so no fourth
     anchored strip was added. State that the verifier was **not** weakened and the bench was
     **not** edited to dodge a check.
  7. **The measured diff:** 34 insertions and 34 deletions on `landing.html`, 1 and 1 on
     `manifest.json`, artifact total still 1890 lines, manifest still 50 assets / 7 fonts /
     nonceScriptCount 1. Name the single markup micro-change (the pricing feature label's colon
     moving inside its `<strong>`) so a reviewer does not read it as drift.
  </action>
  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high && echo FULL_GATE_GREEN</automated>
    <automated>git status --porcelain | grep -E '^[AM]' | grep -vE 'scripts/(marketing-assets|build-marketing-artifact)\.ts|assets/marketing/(landing\.html|manifest\.json)|\.planning/quick/261001-dsh' | wc -l | tr -d ' ' | grep -qx 0 && echo STAGING_SCOPED</automated>
    <automated>git status --porcelain | grep -c '^?? \.planning/\(reviews\|todos\)' | grep -qx 5 && echo PREEXISTING_UNTRACKED_PRESERVED</automated>
    <automated>git rev-parse --abbrev-ref HEAD | grep -qx 'copy-remove-em-dashes' && git merge-base --is-ancestor hero-named-tabs-and-funun-copy HEAD && echo ON_EXPECTED_STACKED_BRANCH</automated>
    <automated>gh pr view --json baseRefName,headRefName -q '.baseRefName+" <- "+.headRefName' | grep -qx 'hero-named-tabs-and-funun-copy <- copy-remove-em-dashes' && echo PR_BASE_CORRECT</automated>
  </verify>
  <done>
All six validate-job commands pass locally, in order, with no substitutions. Only the four
source/artifact files plus this plan directory are staged; the five pre-existing untracked planning
files remain untracked and the stale worktree is untouched. The branch is pushed and a PR is open
with base `hero-named-tabs-and-funun-copy`, whose body covers all seven required points including
the live-public-page flag, the owner quote, the grouped before/after table, the three deliberate
exclusions, the dead line-count tripwire and its replacements, and the measured diff.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo to public internet | `assets/marketing/landing.html` is served at `/` on www.funun.studio to anonymous visitors, and `PeteyFranchise/funun` is itself a public repository. Anything that reaches either is permanent. |
| bench source to shipped artifact | `private/bench/marketing.html` is a working surface full of internal notes, placeholders and bench chrome. The sanitizer is the only thing between it and the public page. |
| marketing copy to prospective artists | A rewritten sentence can change a promise. In a rights product an overclaim is a money bug, not a copy bug. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dsh-01 | Tampering | the em dash gate silently counting excluded categories, floor-ing above zero, and being weakened to pass | high | mitigate | The gate excludes all four categories including the `art:` strings the briefing omits (V-4), and asserts the exact size of both data exclusions (16 and 3) before asserting zero, so a widened exclusion fails loudly. |
| T-dsh-02 | Repudiation | a check that cannot fail, printing green and proving nothing | high | mitigate | Task 2 runs the identical pipeline over the pre-change artifact from `git show HEAD:` and fails if it is not greater than zero. Measured at 25 (V-5). |
| T-dsh-03 | Tampering | silent content drift during regeneration, with no line-count tripwire to catch it | high | mitigate | Both line counts are invariant this time (V-2), so the plan gates on an exact 34/34 numstat, enumerates the only regions allowed to change, names the single allowed markup micro-change, asserts manifest shape numerically, and requires `public/marketing/` to be byte-unchanged. |
| T-dsh-04 | Information Disclosure | internal commentary reaching the public artifact | high | mitigate | Task 1's verify dry-runs the sanitizer and tests the output against the whole `PROHIBITED_LITERALS` array imported from the verifier; Task 2 repeats it on the written artifact; `scripts/marketing-artifact.test.ts:466` enforces it again in CI. Confirmed clean at 17 literals, 0 violations (V-9). |
| T-dsh-05 | Tampering | weakening `PROHIBITED_LITERALS`, or editing the frozen bench, to make a gate pass | high | mitigate | Task 1 states three hard NOs and its verify asserts the verifier has a zero-line diff and the bench still hashes to the pinned value. |
| T-dsh-06 | Tampering | over-reach into correct typography: compound hyphens, en-dash date ranges, or the credits-table no-value placeholders | medium | mitigate | Task 2 gates on exact equality (69 visible compounds, 1327/4/2 raw, 4 en dashes, 16 placeholders) rather than the briefing's "at least 20" floor, so removal in either direction fails. |
| T-dsh-07 | Repudiation | a false FAIL from a retyped predicate, specifically grepping the bare title phrase and getting 4 | medium | mitigate | V-6 identified the fourth occurrence (the footer tagline at line 1064) and the gate asserts on the full brand-prefixed title string, measured at exactly 3. |
| T-dsh-08 | Information Disclosure | unrelated pre-existing untracked planning files, or the stale worktree, swept into a public commit | medium | mitigate | Task 3 forbids `git add -A`, enumerates exact pathspecs, asserts the five pre-existing untracked files are still untracked after staging, and names the worktree as out of scope. |
| T-dsh-09 | Elevation of Privilege | the PR landing on `main` instead of the stacked branch, shipping copy that depends on #127's bench state | medium | mitigate | Task 3 requires `--base hero-named-tabs-and-funun-copy`, asserts the branch is a descendant of it, and asserts the opened PR's base and head with `gh pr view`. |

No package-manager installs are performed by this plan, so no package legitimacy gate applies.
</threat_model>

<verification>
1. `npx tsx scripts/verify-marketing-artifact.ts` exits 0 with `verify ok`.
2. Reader-facing em dashes on `assets/marketing/landing.html` measure 0, with the exclusions
   size-asserted at 16 placeholders and 3 art strings, and the same gate measures 25 on the
   pre-change artifact.
3. Compound hyphens, en dashes and placeholders are exactly unchanged: 69 visible, 1327 / 4 / 2
   raw, 4 en dashes, 16 placeholders.
4. The full title string occurs 3 times, the description tail 3 times, the spaced-comma bug 0
   times.
5. Zero occurrences of all 17 `PROHIBITED_LITERALS` entries, checked by importing the array.
6. The artifact is 1890 lines with a 34/34 diff; the manifest is 1/1 and reports 50 / 7 / 1 with
   the advanced `sourceSha256`; `public/marketing/` is unchanged.
7. `scripts/marketing-artifact.test.ts` and `__tests__/marketing-root-route.test.ts` pass inside
   the full `npm test -- --runInBand` run, unmodified.
8. All six CI validate-job commands pass locally, in order, with no substitutions.
9. `private/bench/marketing.html` and `scripts/verify-marketing-artifact.ts` are unmodified.
10. The PR is open with base `hero-named-tabs-and-funun-copy`.
</verification>

<success_criteria>
- No reader of the page served at `/` encounters an em dash in the copy, in the page title, or in a
  link preview.
- Hyphens, en dashes and the credits-table no-value placeholders are exactly as they were.
- `assets/marketing/landing.html` is fully regenerable from the current bench source with no hand
  edits anywhere in the artifact or the manifest.
- The freeze constant, `manifest.sourceSha256`, and the local gitignored baseline all name the same
  bench revision.
- No internal commentary reached the public artifact, and the verifier was not weakened. That no
  fourth sanitizer strip was needed was confirmed, not assumed.
- A PR is open against `hero-named-tabs-and-funun-copy` covering all seven required points, flagging
  that this is a live change to a public page.
</success_criteria>

<output>
Create `.planning/quick/261001-dsh-remove-em-dashes-from-marketing-copy/261001-dsh-SUMMARY.md` when
done.

Record in it: the measured `git diff --numstat` for `landing.html` and `manifest.json` and whether
the 34/34 and 1/1 predictions held, with an explanation if either missed, because a prediction that
missed is worth more recorded than quietly overwritten; the em dash gate's four numbers (total,
placeholders excluded, art strings excluded, reader-facing) and the positive control's number; the
hyphen and en-dash counts; the confirmation that no fourth sanitizer strip was needed and that the
verifier and bench were untouched; the manifest's asset / font / nonce counts after the rebuild; the
note that this is the third consecutive re-freeze of this pipeline and the second in two days, so a
standing re-freeze runbook may be worth extracting as a future todo rather than reconstructing the
ordering each time; and the PR URL.
</output>
</content>
</invoke>
