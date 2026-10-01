---
phase: quick/260930-sqv
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
requirements: [SQV-01]
branch: step-badge-violet

must_haves:
  truths:
    - "The five How-it-works step badges on the shipped marketing artifact render violet (#a5b4fc text, indigo-tinted border and fill), not grey."
    - "The pricing-card badges (.pcard .who) are byte-identical to before."
    - "No internal decision commentary reaches the public artifact."
    - "The artifact is regenerable: scripts/build-marketing-artifact.ts reproduces it from the current bench source with no hand edits."
    - "Every step of CI's validate job passes locally before the PR opens."
  artifacts:
    - scripts/marketing-assets.ts (FROZEN_SHA256 + FROZEN_LINE_COUNT advanced to the new bench revision)
    - scripts/build-marketing-artifact.ts (anchored removal of the new bench decision comment)
    - assets/marketing/landing.html (regenerated, carrying the violet rule)
    - assets/marketing/manifest.json (sourceSha256 advanced by scripts/marketing-assets.ts)
    - private/bench/baseline/FROZEN.sha256 (gitignored local baseline kept honest)
  key_links:
    - "scripts/marketing-assets.ts FROZEN_SHA256 -> build-marketing-artifact.ts:487 frozen-source gate (refuses any other revision)"
    - "scripts/marketing-assets.ts FROZEN_SHA256 -> build-marketing-artifact.ts:496 manifest.sourceSha256 equality gate (the step the obvious order of operations fails on)"
    - "scripts/marketing-assets.ts:334 -> assets/marketing/manifest.json sourceSha256 (the ONLY writer of that field)"
    - "bench decision comment -> verify-marketing-artifact.ts:38 PROHIBITED_LITERALS 'OWNER DECISION' -> scripts/marketing-artifact.test.ts:466 verifyArtifact(...) == []"
---

<objective>
Ship the owner-approved violet treatment for the "How it works" step badges to the public
marketing page at `/`, by advancing the marketing artifact freeze to the already-edited bench
revision and regenerating the committed artifact.

Purpose: the badges were being scanned past entirely. **Contrast was never the problem** — the
old grey `#8b8b97` measures 6.2:1 on black, well over the 4.5:1 floor. The problem is
**salience**: the badges were small, weight-400, uppercase, grey, and the only element in the
section wearing no colour at all. Owner reviewed three bench renders on 2026-09-30 and chose
option A, violet.

Output: regenerated `assets/marketing/landing.html` + `assets/marketing/manifest.json`, two
`scripts/` source changes that make the pipeline accept and correctly sanitize the new bench
revision, and a PR against protected `main`.
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

Everything below was checked against source in this session. Four of the briefing's
assumptions did not survive. Read this section before Task 1 — two of these corrections are
the difference between the plan working and the plan failing on its second command.

**V-1 — The bench edit is real and already on disk. Do not touch it.**
`private/bench/marketing.html` (gitignored) now measures sha256
`eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294`, 2151 lines — matching the
briefing exactly. The `.steps .who` rule is at line 406; the pricing rule `.pcard .who` is a
separate declaration at line 203 and is untouched. Verified by `shasum -a 256`, `wc -l`, `grep -n`.

**V-2 — CORRECTION: `build-marketing-artifact.ts` does NOT write `sourceSha256`.**
The briefing says the build rewrites `manifest.json` from `FROZEN_SHA256` and that the manifest
must not be hand-edited. Half right. `scripts/build-marketing-artifact.ts:516-521` writes
`{ ...manifest, nonceScriptCount }` — it carries `sourceSha256` through from whatever the
manifest already said and never sets it. What it actually does with `FROZEN_SHA256` is at
`scripts/build-marketing-artifact.ts:496-497`:

    if (manifest.sourceSha256 !== FROZEN_SHA256) {
      fail('manifest sourceSha256 does not match the frozen hash — run Task 1 first')

So the briefing's order of operations (bump constants → `build-marketing-artifact.ts`) **fails on
its second command**. The only writer of `sourceSha256` is `scripts/marketing-assets.ts:334`,
reached by its build mode (`npm run marketing:assets`, no `--check`). That step must run between
the constant bump and the artifact build. Task 2 does this.

**V-3 — BLOCKER: the new bench comment contains a literal the verifier bans.**
`scripts/verify-marketing-artifact.ts:38` lists `'OWNER DECISION'` in `PROHIBITED_LITERALS`
(alongside `'.planning/'` and `'owner-approved'`). The 5-line decision comment the owner placed
above the new rule at `private/bench/marketing.html:401` opens with that exact phrase.

CSS comments are **not** stripped wholesale — the adjacent `/* ── the crate ... */` block
survives verbatim into `assets/marketing/landing.html:406-409`. So a straight regeneration ships
internal decision commentary onto the public page, `npm run marketing:verify` exits 1, and
`scripts/marketing-artifact.test.ts:466` (`expect(verifyArtifact(html, manifest)).toEqual([])`)
fails. This is the verifier doing its job: T-ibp-01 exists precisely to keep internal commentary
off a public artifact, and this repo is public.

The fix is not to re-edit the bench (the owner's decision record belongs there) and not to
weaken the verifier. It is an anchored removal in the sanitizer, for which there is an exact
precedent two constants away: `scripts/build-marketing-artifact.ts:272-275` defines
`DIFFERENTIATORS_OWNER_COMMENT` and line 416 strips it with the label
`'differentiators OWNER DECISION comment'`. Task 1 adds the same shape for this comment.

**V-4 — CORRECTION: the test path in the briefing does not exist.**
There is no `__tests__/marketing-artifact.test.ts`. The suite that exercises this pipeline is
`scripts/marketing-artifact.test.ts` (it lives beside the scripts). A second relevant suite is
`__tests__/marketing-root-route.test.ts`. Both run under plain `npm test`. The briefing is right
that this is the test most likely to catch a bad re-freeze — `scripts/marketing-artifact.test.ts:457-492`
loads the *committed* artifact off disk and asserts zero verifier violations, a positive
`nonceScriptCount`, preserved `main{padding-top:44px}` and body data-attributes, every `<script`
nonced, and zero inline event handlers.

**V-5 — Current recorded state, for diffing against after the build.**
`assets/marketing/manifest.json` records `sourceSha256` = the old `1995cbe9…`,
`harCapturedAt` = `2026-09-30T17:40:42.446608Z`, **50 assets**, **7 fonts**,
`nonceScriptCount: 1`. The HAR the asset builder needs is present at
`private/bench/baseline/manifest.har` (39,267 bytes). Counts confirmed by reading the JSON.

**V-6 — Working tree and branch.** On `step-badge-violet`, tree otherwise clean except five
pre-existing untracked files under `.planning/reviews/` and `.planning/todos/pending/`. Those
are earlier work and must not be staged.

</verified_findings>

<tasks>

<task type="auto">
  <name>Task 1: Advance the freeze and teach the sanitizer to strip the new decision comment</name>
  <files>scripts/marketing-assets.ts, scripts/build-marketing-artifact.ts</files>
  <action>
Two edits that must land together — either alone leaves the pipeline broken.

**1a. `scripts/marketing-assets.ts`, lines 41-43.** Replace the frozen baseline values with the
new bench revision:
  - `FROZEN_SHA256` (string literal on line 42): `1995cbe96a0638fcddf8759e836adbbcc6ab1cda43be0fe35e6e62765c973cb5`
    becomes `eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294`
  - `FROZEN_LINE_COUNT` (line 43): `2145` becomes `2151`

The +6 lines are the 5-line decision comment plus one extra wrapped CSS line. Change nothing
else in this file — `PRODUCTION_FONT_FILES`, the path constants and every exported function stay
as they are.

**1b. `scripts/build-marketing-artifact.ts`.** Add an anchored removal for the decision comment
that now sits above the `.steps .who` rule, following the existing `DIFFERENTIATORS_OWNER_COMMENT`
precedent at lines 272-275 / 416 exactly.

Declare a new pair of anchor constants in the constants region near that precedent (keep them
adjacent to it so the two owner-comment strips read together). Name them for the badge rule —
e.g. `STEP_BADGE_DECISION_COMMENT_START` and `STEP_BADGE_DECISION_COMMENT_END`. Their values must
be lifted byte-for-byte from the frozen source, where continuation lines carry exactly three
leading spaces:
  - start anchor: the full first line of the comment, from the opening `/*` through the trailing
    word `scanned` (no newline)
  - end anchor: three spaces, then the final line `accent. 10.5:1. */`, then a single `\n` — claim
    the newline so the removal leaves no blank line between the `.steps p` rule and `.steps .who`

<!-- planner-discipline-allow: OWNER DECISION -->
Both anchors were confirmed to occur exactly once in the frozen source (`grep -c` = 1 each), which
is what `removeBetween`'s `assertOccurrences(..., 1, ...)` requires. Write a short comment above
the constants recording *why* the strip exists: the comment holds the owner's rationale and
belongs in the bench, but `verify-marketing-artifact.ts` bans the literal `OWNER DECISION` from
the artifact because that file ships to a public page.

Then add one call inside `sanitize()` (the function at line 399), placed immediately after the
existing `removeExactly(html, DIFFERENTIATORS_OWNER_COMMENT, ...)` on line 416:

    html = removeBetween(html, STEP_BADGE_DECISION_COMMENT_START, STEP_BADGE_DECISION_COMMENT_END, '<label>')

Use `removeBetween`, not `removeExactly` — the block is multi-line and anchoring both ends is how
every other multi-line strip in this file works. Give it a descriptive label; the label is what
surfaces in the thrown error if an anchor ever stops matching.

Do not touch `verify-marketing-artifact.ts`. Do not add anything to `PROHIBITED_LITERALS` and do
not remove anything from it. Do not edit `private/bench/marketing.html` — any edit there
invalidates the sha this task just pinned.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json && grep -c 'eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294' scripts/marketing-assets.ts && grep -c 'FROZEN_LINE_COUNT = 2151' scripts/marketing-assets.ts && grep -c '1995cbe96a0638fcddf8759e836adbbcc6ab1cda43be0fe35e6e62765c973cb5' scripts/marketing-assets.ts | grep -qx 0 && echo FREEZE_OK</automated>
    <automated>grep -c 'STEP_BADGE_DECISION_COMMENT_START' scripts/build-marketing-artifact.ts | grep -qx 2 && echo ANCHOR_DECLARED_AND_USED</automated>
    <automated>git diff --numstat -- scripts/verify-marketing-artifact.ts private/bench/marketing.html | wc -l | grep -qx 0 && echo UNTOUCHED_OK</automated>
  </verify>
  <done>
`scripts/marketing-assets.ts` carries the new sha and line count and no trace of the old sha.
`scripts/build-marketing-artifact.ts` declares the two anchor constants and calls `removeBetween`
with them inside `sanitize()`. TypeScript compiles. `verify-marketing-artifact.ts` and the bench
source are unmodified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regenerate the manifest and artifact, and prove the change actually landed</name>
  <files>assets/marketing/manifest.json, assets/marketing/landing.html, private/bench/baseline/FROZEN.sha256</files>
  <action>
Run the pipeline in this order. The middle step is the one the briefing omitted (see V-2); without
it the build exits 1 on the manifest equality gate.

1. `npm run marketing:assets` — build mode. This is the only writer of `manifest.sourceSha256`
   (`scripts/marketing-assets.ts:334`). It re-verifies the frozen source, re-parses
   `private/bench/baseline/manifest.har`, reconciles the browser-observed asset set against the
   static candidate set, re-copies the manifest-listed files into `public/marketing/`, and writes
   `assets/marketing/manifest.json`.
2. `npm run marketing:build` — regenerates `assets/marketing/landing.html` and rewrites
   `nonceScriptCount` into the manifest.
3. `npm run marketing:verify` — must print `verify ok` and exit 0.
4. Update `private/bench/baseline/FROZEN.sha256` (gitignored) so the local baseline stays honest.
   Preserve the existing two-column `<sha>  marketing.html` format — regenerate it rather than
   hand-typing: run `shasum -a 256 private/bench/marketing.html` from inside `private/bench/` so
   the recorded filename stays bare, or rewrite the file with the new sha and the same filename
   column.

Then prove the artifact carries the change. **The freeze proves the INPUT, not the OUTPUT** — a
regenerated artifact that silently dropped the edit would still pass every freeze check. Assert
directly on `assets/marketing/landing.html`:

- the `.steps .who` rule contains `color:#a5b4fc`, `background:rgba(129,140,248,.11)`,
  `border:1px solid rgba(129,140,248,.38)` and `font-weight:600`
- the `.steps .who` rule no longer contains `color:var(--lav-dim)`
- the pricing rule is byte-identical: the artifact still contains
  `.pcard .who{font-size:12px;color:var(--lav-dim);margin:0 0 20px}` and `git diff` does not touch
  that line
- the decision comment did not ship: zero occurrences of the banned phrase (the `grep ... | grep -qx 0`
  form below), and `git diff` shows no added comment lines

**Report the diff line count.** Expected shape, from reading the two revisions — treat as a
prediction to check, not a fact:
  - `assets/marketing/landing.html`: `4` insertions / `3` deletions (the rule grew from 3 wrapped
    lines to 4); the comment is stripped by Task 1b so it contributes nothing
  - `assets/marketing/manifest.json`: `1` / `1` (the `sourceSha256` line only — `harCapturedAt`
    re-reads the same unchanged HAR, and the asset arrays rebuild identically)

**STOP conditions.** If any of these hold, halt and report rather than pressing on:
  - the landing.html diff touches any line outside the `.steps .who` rule — in particular any
    `<script`, `<div`, `<section`, `<body`, or any `function`/`const` inside the surviving script
  - the manifest diff touches more than the `sourceSha256` line
  - asset count ≠ 50, font count ≠ 7, or `nonceScriptCount` ≠ 1 (a change there means the
    sanitizer did something unintended)
  - `git status` shows modified files under `public/marketing/` (the re-copy writes identical
    bytes, so any diff there is a real change in the source assets)

Human check, non-blocking: a dev server is already live on :3000. Load `http://localhost:3000/`
and confirm the five How-it-works badges render violet and the pricing-card labels are unchanged.
The greps above already prove the bytes; this confirms the shipped route, not just the bench.
**Do not run `npm run build`** — it clobbers `.next` under the running server.
  </action>
  <verify>
    <automated>npm run marketing:verify</automated>
    <automated>grep -A3 '^\.steps \.who{' assets/marketing/landing.html | grep -q 'color:#a5b4fc' && grep -A3 '^\.steps \.who{' assets/marketing/landing.html | grep -q 'background:rgba(129,140,248,\.11)' && grep -A3 '^\.steps \.who{' assets/marketing/landing.html | grep -q 'rgba(129,140,248,\.38)' && grep -A3 '^\.steps \.who{' assets/marketing/landing.html | grep -q 'font-weight:600' && echo VIOLET_LANDED</automated>
    <automated>grep -A3 '^\.steps \.who{' assets/marketing/landing.html | grep -c 'color:var(--lav-dim)' | grep -qx 0 && echo GREY_GONE</automated>
    <automated>grep -c '\.pcard \.who{font-size:12px;color:var(--lav-dim);margin:0 0 20px}' assets/marketing/landing.html | grep -qx 1 && echo PCARD_INTACT</automated>
    <automated>grep -c 'OWNER DECISION' assets/marketing/landing.html | grep -qx 0 && grep -c '\.planning/' assets/marketing/landing.html | grep -qx 0 && echo NO_INTERNAL_COMMENTARY</automated>
    <automated>node -e "const m=require('./assets/marketing/manifest.json');if(m.assets.length!==50||m.fonts.length!==7||m.nonceScriptCount!==1)throw new Error('manifest shape drifted: assets='+m.assets.length+' fonts='+m.fonts.length+' nonce='+m.nonceScriptCount);if(m.sourceSha256!=='eecfb67d68a7b6feb762aa2de1b2f92a661fe88eb95fd86275ea48c94a58b294')throw new Error('sourceSha256 not advanced');console.log('MANIFEST_OK')"</automated>
    <automated>git diff --numstat -- assets/marketing/landing.html assets/marketing/manifest.json; git status --porcelain -- public/marketing | wc -l | grep -qx 0 && echo PUBLIC_ASSETS_UNCHANGED</automated>
    <human-check>Load http://localhost:3000/ on the already-running dev server. The five "How it works" step badges read violet with a soft indigo pill behind them; the pricing-card labels are unchanged. Do not run `npm run build`.</human-check>
  </verify>
  <done>
`npm run marketing:verify` prints `verify ok`. The artifact's `.steps .who` rule carries
`#a5b4fc`, both `rgba(129,140,248,…)` values and `font-weight:600`, and no longer carries
`var(--lav-dim)`. `.pcard .who` is byte-identical. Zero occurrences of the banned decision-comment
literals in the artifact. Manifest reports 50 assets / 7 fonts / `nonceScriptCount: 1` and the
advanced `sourceSha256`. The landing.html diff is confined to the `.steps .who` rule and its
actual insertion/deletion counts are reported in the summary. `public/marketing/` is unchanged.
`private/bench/baseline/FROZEN.sha256` records the new sha.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full verification gate, scoped commit, PR</name>
  <files>(no source changes — gate, stage and ship the work from Tasks 1-2)</files>
  <action>
**Run every step CI's `validate` job runs** (`.github/workflows/quality.yml`). Not a subset — a
weaker gate has already passed a real defect through six consecutive waves in this repo:

    npm run security:migrations:verify
    npm run typecheck:strict
    npm run lint
    npm test -- --runInBand
    npm audit --omit=dev --audit-level=moderate
    npm audit --audit-level=high

Notes on two of these. `npm run typecheck:strict` is not the same as `tsc --noEmit` — it adds
`noUnusedLocals`/`noUnusedParameters`, which is exactly what catches an anchor constant that was
declared in Task 1b but never wired into `sanitize()`. `npm run lint` runs with
`--max-warnings=0`, so any warning fails the build. **Do not substitute `npm run build`** — it is
not in CI's validate job and it clobbers `.next` under the live dev server.

Within the test run, two suites carry this change specifically:
`scripts/marketing-artifact.test.ts` (its `the real generated artifact` block at lines 457-492
loads the committed artifact off disk and asserts `verifyArtifact(...)` returns zero violations —
this is the test that would fail loudest on a bad re-freeze) and `__tests__/marketing-root-route.test.ts`.
Both run under plain `npm test`; no filter needed. If either fails, stop and report — do not
adjust the test to match the artifact.

**Stage explicitly. Never `git add -A`.** Five untracked files under `.planning/reviews/` and
`.planning/todos/pending/` are pre-existing work from earlier sessions and must stay untracked.
Stage exactly:

    git add scripts/marketing-assets.ts scripts/build-marketing-artifact.ts \
            assets/marketing/landing.html assets/marketing/manifest.json

plus this plan directory and the summary GSD writes. `private/bench/` is gitignored and will not
stage. Run `git status --porcelain` before committing and confirm nothing unexpected is staged.

Commit, push `step-badge-violet`, and open a PR against `main` (protected — never push `main`
directly).

**The PR body must state the reason correctly.** Say: the badges were hard to notice; the fix is
**salience**, not contrast. State that the previous grey `#8b8b97` measured **6.2:1 on black**,
comfortably over the 4.5:1 floor, and that the badges were the only element in the "How it works"
section wearing no colour. `#a5b4fc` is the light tint of `--indigo:#818cf8`, the indigo end of
the signature gradient, so the treatment reads as Funūn rather than as a new accent; it measures
10.5:1 on black. Geometry is unchanged — only `color`, `border-color`, `background` and
`font-weight` moved.

**Do not claim the badges failed a contrast check.** An earlier assertion in this work that they
measured 3.4:1 was never computed and was wrong. Do not repeat it in the PR, the commit message,
or the summary.

Also record in the PR body: that the freeze constants moved in lockstep with the bench revision
(2145→2151 lines, old sha→new sha), that `scripts/build-marketing-artifact.ts` gained an anchored
strip for the bench decision comment because the artifact ships to a public page and the verifier
bans that commentary, and the measured diff line counts from Task 2.
  </action>
  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high && echo FULL_GATE_GREEN</automated>
    <automated>git status --porcelain | grep -E '^[AM]' | grep -vE 'scripts/(marketing-assets|build-marketing-artifact)\.ts|assets/marketing/(landing\.html|manifest\.json)|\.planning/quick/260930-sqv' | wc -l | grep -qx 0 && echo STAGING_SCOPED</automated>
    <automated>git status --porcelain | grep -c '^?? \.planning/\(reviews\|todos\)' | grep -qx 5 && echo PREEXISTING_UNTRACKED_PRESERVED</automated>
  </verify>
  <done>
All six validate-job commands pass locally. Only the four source/artifact files plus this plan
directory are staged; the five pre-existing untracked planning files remain untracked. Branch
pushed and a PR opened against `main` whose body attributes the change to salience (not contrast),
cites 6.2:1 for the old grey and 10.5:1 for the new violet, and reports the measured diff counts.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo → public internet | `assets/marketing/landing.html` is served at `/` on www.funun.studio, and `PeteyFranchise/funun` is itself a public repository. Anything that reaches either is permanent. |
| bench source → shipped artifact | `private/bench/marketing.html` is a working surface full of internal notes, placeholders and bench chrome. The sanitizer is the only thing standing between it and the public page. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-sqv-01 | Information Disclosure | the owner's decision comment at `private/bench/marketing.html:401` | high | mitigate | Task 1b strips it with an anchored `removeBetween`; Task 2 greps the artifact for zero occurrences of the banned literals; `verify-marketing-artifact.ts:38` and `scripts/marketing-artifact.test.ts:466` enforce it independently in CI. |
| T-sqv-02 | Tampering | `assets/marketing/landing.html` regenerated from an unverified input | high | mitigate | `build-marketing-artifact.ts:487` refuses any revision whose sha256/line-count differs from `FROZEN_SHA256`/`FROZEN_LINE_COUNT`, and line 496 additionally refuses a manifest that disagrees with the frozen hash. Both constants move in Task 1 before anything is regenerated. |
| T-sqv-03 | Tampering | silent content drift during regeneration (markup or script moved, not just the CSS rule) | medium | mitigate | Task 2 requires reporting `git diff --numstat` and halts on any changed line outside the `.steps .who` rule; manifest shape (50/7/1) is asserted numerically. The freeze proves the input, so the output is checked separately. |
| T-sqv-04 | Information Disclosure | unrelated pre-existing untracked planning files swept into a public commit | medium | mitigate | Task 3 forbids `git add -A`, enumerates the exact pathspecs, and asserts the five pre-existing untracked files are still untracked after staging. |
| T-sqv-05 | Repudiation | a PR that misstates why the change was made (the retracted 3.4:1 contrast claim) | low | mitigate | Task 3 specifies the correct framing (salience, 6.2:1 old / 10.5:1 new) and explicitly forbids repeating the uncomputed figure. |

No package-manager installs are performed by this plan, so no package legitimacy gate applies.
</threat_model>

<verification>
1. `npm run marketing:verify` exits 0 with `verify ok`.
2. `scripts/marketing-artifact.test.ts` and `__tests__/marketing-root-route.test.ts` pass inside
   the full `npm test -- --runInBand` run.
3. All six CI validate-job commands pass locally, in order, with no substitutions.
4. The regenerated artifact carries the violet rule and carries no internal decision commentary.
5. `.pcard .who` is byte-identical and untouched by the diff.
6. The landing.html diff is confined to the `.steps .who` rule, and its actual line counts are
   reported rather than assumed.
7. `private/bench/marketing.html` and `scripts/verify-marketing-artifact.ts` are unmodified.
</verification>

<success_criteria>
- The five How-it-works step badges render violet on the page served at `/`, with geometry
  unchanged.
- The pricing-card badges are unchanged.
- `assets/marketing/landing.html` is fully regenerable from the current bench source — no hand
  edits anywhere in the artifact or the manifest.
- The freeze constants, the manifest `sourceSha256` and the local `FROZEN.sha256` all name the
  same bench revision.
- No internal commentary reached the public artifact.
- A PR is open against `main` stating the salience rationale correctly, with the retracted 3.4:1
  contrast claim absent from every artifact of this work.
</success_criteria>

<output>
Create `.planning/quick/260930-sqv-colour-the-how-it-works-step-badges-viol/260930-sqv-SUMMARY.md` when done.

Record in it: the measured `git diff --numstat` counts for `landing.html` and `manifest.json`;
confirmation that `.pcard .who` was untouched; the manifest's asset/font/nonce counts after the
rebuild; and the PR URL. If the diff counts differed from the predicted 4/3 and 1/1, say so and
explain why — a prediction that missed is worth more recorded than quietly overwritten.
</output>