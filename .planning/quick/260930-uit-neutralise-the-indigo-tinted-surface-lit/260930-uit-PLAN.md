---
phase: 260930-uit
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [UIT-01, UIT-02, UIT-03]
files_modified:
  - __tests__/palette-single-source.test.ts
  - app/(artist)/vault/[projectId]/readiness/page.tsx
  - components/antenna/AntennaBrowser.tsx
  - components/antenna/OpportunityCard.tsx
  - components/antenna/OpportunityForm.tsx
  - components/auth/SessionIdentityGuard.tsx
  - components/contracts/ContractLocker.tsx
  - components/contracts/ContractUpload.tsx
  - components/messages/DockedWidget.tsx
  - components/nav/MessagesIcon.tsx
  - components/nav/WorkspaceContextSwitcher.tsx
  - components/profile/ProfileView.tsx
  - components/split-sheets/ReconcileDiff.tsx
  - components/tools/PitchPlugForm.tsx
  - components/vault/PlaybackView.tsx
  - components/vault/VaultProjectCard.tsx

must_haves:
  truths:
    - The palette guard fails on any DARK, BLUE-DOMINANT arbitrary-hex background, border or gradient-stop utility under app/ and components/ — a rule, not an enumerated retired list (UIT-01).
    - The guard was observed RED against the unmodified tree listing exactly 16 offenders, and that count is recorded in the PR body (UIT-01).
    - All 16 in-scope indigo-tinted surface literals are replaced by theme tokens, with PlaybackView's /95 opacity modifier preserved (UIT-02).
    - The two selection-tint sites carry no raw hex at all — their paired border-[#818CF8] is tokenised in the same class string (UIT-02).
    - The full CI validate job passes on the branch tip and a PR is open (UIT-03).
  artifacts:
    - __tests__/palette-single-source.test.ts — extended with half (d), the dark+blue-dominant surface scan
    - A PR on branch neutralise-indigo-surface-literals recording the RED count, the mutation results, and the one visible shift
  key_links:
    - The guard's classifier truth-table test — the only thing that keeps half (d) from going quietly vacuous once the tree is clean and its offender list is permanently empty.
    - The candidate-count floor — proves the regex still SEES the tree after the 16 literals it currently matches are removed from the candidate pool.
---

<objective>
Finish the neutral-black repaint by converting the 16 indigo-tinted surface literals the
existing palette guard is structurally blind to, and extend the guard with a RULE
(dark + blue-dominant) so this bug class cannot recur without an allowlist.

Purpose: PR #118's guard and PR #119's patch both scan for *exact* retired values. `bg-[#1A1840]`
sits two characters from the retired `#1A1838` and sailed through. These 16 are the only
indigo left on authenticated screens.

Output: a tokenised surface palette on 15 files, a third guard half that needs zero exclusions,
and a PR whose body records the RED count so the guard's claim is auditable.
</objective>

<planner_verification>
Every factual claim below was checked against the working tree on 2026-09-30, not inferred.

- **The 16 occurrences are exactly as specified.** `grep -rnoE '(bg|border|…)-\[#…\]' app components`
  returns all 16 at the exact file:line in the task description. Complete list, not a sample.
- **The matcher works as claimed.** Prototyped against the current tree: catches **exactly 16**,
  zero false positives, **zero exclusions needed**. Correctly ignores `#0F0D00`, `#111`, `#123126`,
  `#261416`, `#2a2111`, `#34D399`, `#60A5FA`, `#784044`, `#818CF8`, `#826b2b`, `#9aa3fa`, `#F43F5E`,
  `#F59E0B`.
- **Mutation probes behave.** `#0d0c1e` → caught (lum 0.0044, blue-dominance 17). `#1e1a0d` → passes
  (dominance −17). `#0d0d0d` → passes (dominance 0).
- **The out-of-scope text literals are excluded twice over.** `#5b5f8c` (lum 0.123) and `#9b96c8`
  (lum 0.330) both fail the darkness test *as well as* sitting in `text-` utilities. Either guard
  alone keeps them out.
- **NO test anywhere pins any in-scope literal.** `grep -rniE` over `__tests__/` and over every
  `*.test.ts(x)` / `*.spec.ts` in the repo returns nothing. The constraint's "update any test that
  pins one in the same commit" has no work attached today — Task 2 step 1 re-checks it anyway,
  because parallel sessions make state stale.
- **No 4- or 8-digit-hex blind spot.** No `bg-[#rrggbbaa]` form exists under `app/`+`components/`.
- **Scoping the new half to `app`+`components` (not `lib`) hides nothing.** `lib/` contains only
  five arbitrary-hex border utilities, all accent colours (`#60A5FA`, `#34D399`, `#F59E0B`,
  `#FB7185`), none of which the rule flags. The narrower scope is the owner's spec and is not
  load-bearing either way.
- **Counts for the non-vacuity floors.** 916 files under `app`+`components`; 65 candidate
  arbitrary-hex bg/border/gradient utilities today, **49 after the fix**. Floors are set below 49.
- **Jest path trap does not apply.** `__tests__/palette-single-source.test.ts` contains no `[`,
  so it will not parse as a regex character class and silently match zero tests.
- **Branch state.** `neutralise-indigo-surface-literals` is checked out, **zero commits ahead of
  origin/main**. Working tree carries 5 pre-existing untracked files under `.planning/reviews/`
  and `.planning/todos/pending/` that must remain untracked.
- **A stale full copy of the tree exists at `.claude/worktrees/zen-yalow-0b7a42/`** containing all
  16 literals. It is NOT in scope — the guard's walker skips dot-directories and roots at
  `app/`+`components/`, so it is never reached. Do not edit it.
</planner_verification>

<context>
@.claude/CLAUDE.md
@__tests__/palette-single-source.test.ts
@tailwind.config.ts
</context>

<label_integrity_note>
Project skill `label-integrity-funun` applies directly here: the existing half (b) is titled
"no retired palette literal survives" while it only checks an enumerated list — a name that
asserts more than it checks, which is exactly why `#1A1840` passed. Name half (d) for what it
actually checks (dark, blue-dominant, background/border/gradient utilities, under app+components)
and state the scope boundary in its header comment. Do not title it as though it catches all
indigo everywhere.
</label_integrity_note>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the dark+blue-dominant guard as half (d) and commit it RED</name>
  <files>__tests__/palette-single-source.test.ts</files>
  <behavior>
    The new half must, against the UNMODIFIED tree:
    - Flag exactly 16 offenders, with zero allowlist entries beyond the existing lib/email three.
    - Flag a novel indigo that appears nowhere in the tree (probe `bg-[#0d0c1e]`).
    - NOT flag a novel warm dark (probe `bg-[#1e1a0d]`) or a novel neutral dark (probe `bg-[#0d0d0d]`).
    - NOT flag any `text-` utility, which is what keeps the three out-of-scope indigo TEXT
      literals out of this gate.
    Classifier truth table (asserted directly as a unit test, independent of the tree):
    flagged → `#0d0c1e`, `#0b0a16`, `#1a1840`; not flagged → `#1e1a0d`, `#0d0d0d`, `#818cf8`,
    `#111`, `#0f0d00`, `#123126`, `#5b5f8c`.
  </behavior>
  <action>
Append a fourth describe block to `__tests__/palette-single-source.test.ts`, below half (c),
following the file's existing house style (section-header comment, own describe block, explicit
non-vacuity assertions, `expect(offenders).toEqual([])`).

Implement it as a RULE, not a list. **Do not add a single allowlist entry** — the rule was
prototyped against this exact tree and needs none. If it appears to need one, the rule is wrong:
stop and report rather than excluding.

Structure:

1. **Scan scope.** Add a separate dirs constant for this half holding only `app` and `components`
   (leave the existing `SCAN_DIRS` untouched so halves b and c keep scanning `lib`). Reuse the
   existing `walk` helper and the existing `ALLOWLIST`.

2. **Utility matcher.** A global regex matching a word boundary, then one of the utility prefixes
   `bg`, `border-[trblxy]`, `border`, `from`, `via`, `to` — **with the directional `border-`
   alternative listed before bare `border`** so matching is deterministic rather than dependent on
   backtracking — then `-[#` , then a captured 3- or 6-digit hex, then `]`. Deliberately excludes
   `text-`, `ring-`, `shadow-`, `outline-`: narrowing to background/border/gradient-stop utilities
   is precisely what keeps the out-of-scope indigo text literals out of this gate, so say so in a
   comment.

3. **Classifier.** Export-free module-scope helper taking a bare hex string and returning boolean:
   expand a 3-digit hex by doubling each character; parse R, G, B as 0–255 integers; compute WCAG
   relative luminance (per-channel `v/255`, then `v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055) ** 2.4`,
   combined `0.2126R + 0.7152G + 0.0722B`); return true when luminance is **below 0.05** AND
   `B - max(R, G)` is **at least 8**. Case-insensitive.

4. **Offender format.** Push `` `${rel}:${lineNumber}  #${hex}` `` — include the hex, so a failure
   is diagnosable from the output alone and the mutation checks in step 7 can read it.

5. **Three assertions, in this order:**
   - *Non-vacuity, walker:* file count greater than 400 (there are 916 today).
   - *Non-vacuity, matcher:* total candidate arbitrary-hex background/border/gradient utilities
     encountered is at least 25. There are 65 today and will be 49 after Task 2 — this floor is
     what stops the half going green-forever if the regex ever stops matching, which is the exact
     death this file's header warns about.
   - *Classifier truth table:* assert the classifier's verdict on each value listed in `<behavior>`
     above, driving it directly with bare hex strings. This is the mutation test made permanent:
     once the tree is clean the offender list is empty forever, so the truth table is the only
     thing left proving the rule still discriminates.
   - *The scan itself:* offenders equal the empty array.

6. **Run it RED.** Execute the file and confirm it fails. Confirm the offender count is 16 by an
   independent measure — a scoped grep over `app` and `components` for the seven in-scope hexes in
   a bg/border/gradient utility. Two signals, one from the guard and one from the source, per the
   repo's rule that "the code ran" and "the answer is right" are separate claims. **Record the
   count 16 for the PR body.**

7. **Mutation-test both ways, the way 260927-qka did.** Create a throwaway probe file at
   `components/__palette-probe.tmp.css` whose contents are a CSS comment holding three utility
   strings: a novel indigo `bg-[#0d0c1e]`, a novel warm dark `bg-[#1e1a0d]`, and a novel neutral
   dark `bg-[#0d0d0d]`. A `.css` file is walked by the guard but is not typechecked and is not
   linted, and being unimported it is inert. Re-run the guard and confirm the output names the
   probe file for the indigo value only — the warm and neutral values must not appear anywhere in
   the output. **Then delete the probe file** and confirm `git status --short components/` is empty
   before committing.

8. **Commit the test file ALONE, RED.** Per `.claude/CLAUDE.md`, a check that passes before the fix
   proves nothing; this intermediate red commit is the proof and the branch tip goes green in
   Task 2. Stage only `__tests__/palette-single-source.test.ts` by explicit path — never `git add -A`,
   and leave the five pre-existing untracked `.planning/` files untracked.
  </action>
  <verify>
    <automated>cd /Users/peterzora/Desktop/funun &amp;&amp; test "$(grep -rnoE '\b(bg|border-[trblxy]|border|from|via|to)-\[#(0b0a16|0c0b1a|1A1840|13112a|121120|11111d|0f0e1d)\]' app components --include='*.tsx' --include='*.ts' --include='*.css' | wc -l | tr -d ' ')" = "16" &amp;&amp; ! npx jest --runInBand __tests__/palette-single-source.test.ts &amp;&amp; test -z "$(git status --short components/)" &amp;&amp; git show --stat --name-only HEAD | grep -q 'palette-single-source.test.ts'</automated>
  </verify>
  <done>Half (d) is committed; it fails against the unmodified tree; the independent grep agrees the count is 16; the probe file is gone and components/ is clean; no allowlist entry was added.</done>
</task>

<task type="auto">
  <name>Task 2: Convert the 16 literals to tokens and take the guard green through the full CI gate</name>
  <files>app/(artist)/vault/[projectId]/readiness/page.tsx, components/antenna/AntennaBrowser.tsx, components/antenna/OpportunityCard.tsx, components/antenna/OpportunityForm.tsx, components/auth/SessionIdentityGuard.tsx, components/contracts/ContractLocker.tsx, components/contracts/ContractUpload.tsx, components/messages/DockedWidget.tsx, components/nav/MessagesIcon.tsx, components/nav/WorkspaceContextSwitcher.tsx, components/profile/ProfileView.tsx, components/split-sheets/ReconcileDiff.tsx, components/tools/PitchPlugForm.tsx, components/vault/PlaybackView.tsx, components/vault/VaultProjectCard.tsx</files>
  <action>
**Step 1 — re-check for test pins before editing.** Grep the whole repo's test files for each of
the seven in-scope hex values. Planning verified there are currently zero pins, but parallel
sessions make state stale, so confirm rather than assume. Any pin found is updated in THIS commit,
or the suite breaks.

**Step 2 — apply exactly these 16 edits.** This is the complete owner-approved list; do not extend
it and do not go hunting for other literals.

Panel/card grounds → `bg-card` (`card` is `#0a0a0c`; five of these already sit beside `border-hair`,
which the repaint tokenised while leaving the background behind):
- `components/contracts/ContractUpload.tsx:54`
- `components/contracts/ContractLocker.tsx:458`
- `components/contracts/ContractLocker.tsx:498`
- `components/split-sheets/ReconcileDiff.tsx:128`
- `components/antenna/AntennaBrowser.tsx:59`
- `components/vault/PlaybackView.tsx:364` — **keep the `/95` opacity modifier**, so the result is
  `bg-card/95`, not `bg-card`.

Score-ring holes → `bg-card` (NOT `card2`). These four are the dark disc punched out of a conic
gradient to make the ring read as a donut; the hole must match the card it sits on. `card2` would
make the hole lighter than its surroundings and break the illusion:
- `app/(artist)/vault/[projectId]/readiness/page.tsx:202`
- `components/profile/ProfileView.tsx:102`
- `components/antenna/OpportunityCard.tsx:39`
- `components/vault/VaultProjectCard.tsx:119`

Raised surfaces → `bg-card2` (`card2` is `#161618`): a widget header, two dropdown overlays, a
modal card:
- `components/messages/DockedWidget.tsx:138`
- `components/nav/WorkspaceContextSwitcher.tsx:59`
- `components/auth/SessionIdentityGuard.tsx:119`
- `components/nav/MessagesIcon.tsx:121`

Selection tints → `bg-brandindigo/10`. These two are not surfaces: each is the selected branch of a
ternary on a toggle, paired with a raw indigo border. The right value is the translucent accent the
design bench uses for `[aria-checked="true"]`:
- `components/tools/PitchPlugForm.tsx:134`
- `components/antenna/OpportunityForm.tsx:158`

**Step 3 — on those two selection-tint lines ONLY**, also tokenise the paired border literal to
`border-brandindigo` (`brandindigo` is `#818CF8`). Verified: both sites carry the border and the
background inside the same ternary-branch string and neither has a background form of the accent,
so each selected branch ends up carrying no raw hex at all. Leaving a raw literal beside a
freshly-tokenised one in the same class string is precisely the half-conversion that produced this
bug class. **Do not touch the accent hex anywhere else** — it is a correct colour written as a
literal, not drift, and the owner ruled the accent family out of scope.

**Step 4 — change nothing else.** Specifically out of scope by owner decision: the indigo TEXT
literals in `app/(auth)/auth-ui.ts` and on `SessionIdentityGuard.tsx:120`; the accent family; the
warm/semantic rose, amber and emerald state tints; the neutral near-black on the native `option` in
`components/green-room/PeopleSearch.tsx`; anything under `private/` or `docs/design/`; and the stale
tree copy under `.claude/worktrees/`.

**Step 5 — run the full Verification Gate**, every step the CI `validate` job runs, no
substitutions: the migration security verify, `typecheck:strict` (not bare `tsc --noEmit`), `lint`
(`--max-warnings=0`, so any warning fails), the test suite with `--runInBand`, and both `npm audit`
invocations. **Do not run `npm run build`** — a dev server is live on :3000 and a build clobbers
`.next`.

**Step 6 — commit.** Stage the 15 changed source files by explicit path. Never `git add -A`; leave
the five pre-existing untracked `.planning/` files untracked.
  </action>
  <verify>
    <automated>cd /Users/peterzora/Desktop/funun &amp;&amp; test "$(grep -rnoE '\b(bg|border-[trblxy]|border|from|via|to)-\[#(0b0a16|0c0b1a|1A1840|13112a|121120|11111d|0f0e1d)\]' app components --include='*.tsx' --include='*.ts' --include='*.css' | wc -l | tr -d ' ')" = "0" &amp;&amp; grep -q 'bg-card/95' components/vault/PlaybackView.tsx &amp;&amp; test "$(grep -c 'border-brandindigo bg-brandindigo/10' components/tools/PitchPlugForm.tsx components/antenna/OpportunityForm.tsx | grep -c ':1')" = "2" &amp;&amp; npm run security:migrations:verify &amp;&amp; npm run typecheck:strict &amp;&amp; npm run lint &amp;&amp; npm test -- --runInBand &amp;&amp; npm audit --omit=dev --audit-level=moderate &amp;&amp; npm audit --audit-level=high</automated>
  </verify>
  <done>Zero in-scope literals remain under app/ and components/; PlaybackView keeps its /95; both selection-tint branches carry tokens for border and background; every CI validate step passes; `npm run build` was not run.</done>
</task>

<task type="auto">
  <name>Task 3: Push the branch and open the PR with the RED count and the visible-shift callout</name>
  <files>(no repo files — PR only)</files>
  <action>
Push `neutralise-indigo-surface-literals` and open a PR against `main` with `gh`. `main` is
protected; **do not merge** — that is the owner's call after CI and eyeballing.

The PR body must carry, because these are the claims a reviewer would otherwise have to take on
trust:

1. **The guard's RED evidence.** The guard was committed first and observed failing against the
   unmodified tree with **exactly 16 offenders**, with **zero allowlist entries added**. State the
   count explicitly.
2. **The mutation results, both directions.** The guard catches a novel indigo that appears nowhere
   in the tree, and does not fire on a novel warm dark or a novel neutral dark.
3. **The rule, in one sentence** — dark (WCAG relative luminance under 0.05) and blue-dominant
   (blue exceeds the larger of red and green by at least 8), in background, border and
   gradient-stop utilities only — and why the utility narrowing matters: it is what keeps the
   out-of-scope indigo *text* literals out of the gate without naming an exception.
4. **The 16-row mapping table**, file:line → token, with the three groupings and their reasons
   (panel grounds, score-ring holes that must match their card, raised surfaces, selection tints).
5. **A VISIBLE-CHANGE callout, prominent.** This touches many authenticated screens — contracts,
   split sheets, antenna, vault, profile, messages, nav, auth. Thirteen of the sixteen shifts are
   subtle, but the Messages docked-widget header (`components/messages/DockedWidget.tsx:138`,
   `#13112a` → `card2`) is the one visibly different surface (owner-measured perceptual distance
   32.6 against ≤24 for the rest). Ask for it to be eyeballed rather than discovered.
6. **What was deliberately left alone** and why: the indigo text literals on the sign-in surface
   (a design call, not cleanup), the accent family, the warm/semantic state tints, the neutral
   near-black `option`, and `private/` + `docs/design/`.
7. **The verification gate output** — every CI validate step run, and an explicit note that
   `npm run build` was skipped because a dev server is live.

Do not attach or paste any business document, deal term, or customer data: this repository is
PUBLIC and a force-pushed commit stays retrievable by SHA.
  </action>
  <verify>
    <automated>cd /Users/peterzora/Desktop/funun &amp;&amp; git rev-parse --abbrev-ref --symbolic-full-name @{u} | grep -q 'origin/neutralise-indigo-surface-literals' &amp;&amp; test -z "$(git log origin/neutralise-indigo-surface-literals..HEAD --oneline)" &amp;&amp; gh pr view --json number,state,body -q '.number, .state, (.body | test("16"))' | grep -q 'true'</automated>
  </verify>
  <done>The branch is pushed with nothing unpushed, a PR is open against main, its body records the RED count of 16 and flags the DockedWidget header as the one visible shift, and the PR has not been merged.</done>
</task>

</tasks>

<threat_model>
No trust boundary is crossed by this change. It edits Tailwind class-name string literals in JSX
and appends a test; there are no package installs (so no legitimacy gate applies), no migrations,
no new data flow, no auth or input handling, and no change to any server route.

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260930-uit-01 | Tampering | `components/__palette-probe.tmp.css` scratch probe | low | mitigate | Probe is `.css` (untypechecked, unlinted, unimported), deleted in Task 1 step 7, and `git status --short components/` is asserted empty before the commit. |
| T-260930-uit-02 | Information disclosure | PUBLIC repository | low | mitigate | PR body is restricted to code facts and colour values; Task 3 forbids attaching business or customer material. |
</threat_model>

<verification>
Branch tip passes every step of the CI `validate` job: `npm run security:migrations:verify`,
`npm run typecheck:strict`, `npm run lint`, `npm test -- --runInBand`,
`npm audit --omit=dev --audit-level=moderate`, `npm audit --audit-level=high`.
`npm run build` is NOT run (dev server live on :3000).

Independent cross-check of the guard's claim, not just the guard's own verdict: a scoped grep over
`app` and `components` for the seven in-scope hexes in a background/border/gradient utility returns
16 before Task 2 and 0 after.
</verification>

<success_criteria>
- Guard committed RED first, observed failing with exactly 16 offenders, zero allowlist entries added.
- Guard mutation-tested both ways and the probe file deleted before any commit.
- All 16 literals tokenised; `/95` preserved; both selection-tint branches fully tokenised.
- Nothing out of scope touched — no text literals, no accent family, no warm tints, no worktree copy.
- Full CI validate job green on the branch tip; `npm run build` not run.
- PR open against protected `main`, unmerged, body carrying the RED count and the DockedWidget
  visible-shift callout.
- Never `git add -A`; the five pre-existing untracked `.planning/` files remain untracked.
</success_criteria>

<output>
Append the outcome to `.planning/quick/260930-uit-neutralise-the-indigo-tinted-surface-lit/260930-uit-SUMMARY.md`
when done, recording the observed RED offender count and the PR URL.
</output>
