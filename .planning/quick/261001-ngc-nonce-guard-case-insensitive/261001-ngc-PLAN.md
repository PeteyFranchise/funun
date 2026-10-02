---
phase: 261001-ngc-nonce-guard-case-insensitive
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/marketing/nonceInjection.ts
  - __tests__/marketing-root-route.test.ts
autonomous: true
requirements:
  - NGC-01   # injectNonce's two tag counts must stay symmetric across tag casing
  - NGC-02   # casing tests committed RED first, with captured failure evidence
  - NGC-03   # no artifact re-freeze; builder and landing.html byte-identical
user_setup: []

must_haves:
  truths:
    - "An uppercase or mixed-case un-nonced <SCRIPT> tag makes injectNonce throw. Today it returns successfully — that is the defect."
    - "A correctly nonced uppercase tag does NOT throw (the fix must not over-correct into a false positive)."
    - "A tag carrying a case-variant of the nonce VALUE does not satisfy the guard — the fix must not turn a secret comparison case-insensitive."
    - "All 7 pre-existing injectNonce tests (marketing-root-route.test.ts:60-117) pass unchanged."
    - "assets/marketing/landing.html stays byte-identical at sha256 598ab38a96b95367b3375ae58e97072575b4ce37980fbccb014b244a494a68fa; scripts/build-marketing-artifact.ts is untouched."
  artifacts:
    - lib/marketing/nonceInjection.ts
    - __tests__/marketing-root-route.test.ts
    - "A RED commit on branch nonce-guard-case-insensitive whose captured jest run fails the uppercase cases"
  key_links:
    - "injectNonce <- app/marketing-document/route.ts:74 (verified: sole runtime caller)"
    - "The tag count and the nonced count must come from ONE scan, so they structurally cannot diverge again"
    - "scripts/build-marketing-artifact.ts:852 lowercases every tag as a side effect — the runtime guard must not depend on that"
---

<objective>
Make the runtime nonce guard in `lib/marketing/nonceInjection.ts` count `<script` tags
case-insensitively, so an uppercase `<SCRIPT` can no longer pass the guard un-nonced.

Purpose: the guard currently **fails open**. Both of its counts are case-sensitive, so an
uppercase tag is missing from the numerator and the denominator alike, the counts still
agree, and the function returns success with an un-nonced script in the document. A guard
that fails open is worse than no guard, because it is trusted.

Output: a 1-function change in `lib/marketing/nonceInjection.ts`, a casing test block in
`__tests__/marketing-root-route.test.ts` committed RED first, and a PR against `main`.
No artifact re-freeze.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.claude/CLAUDE.md
@lib/marketing/nonceInjection.ts
@__tests__/marketing-root-route.test.ts
</context>

<verified_findings>
Every claim below was read from source before this plan was written. `file:line` cited.
Nothing here is inferred from a partial read.

1. **`lib/marketing/nonceInjection.ts:52`** — `const scriptTagCount = (replaced.match(/<script/g) ?? []).length`. No `i` flag.
2. **`lib/marketing/nonceInjection.ts:53`** — `new RegExp(\`<script nonce="${escapeRegExp(nonce)}"\`, 'g')`. No `i` flag.
3. **The fail-open is real, and both sides miss it equally.** The comparison at `:55` is
   `scriptTagCount !== noncedScriptTagCount`. An uppercase tag contributes 0 to BOTH counts,
   so for input `<script nonce="PH">a</script><SCRIPT>b</SCRIPT>` with expectedCount 1, the
   counts are 1 and 1, the condition is false, and the function **returns normally** with an
   un-nonced `<SCRIPT>` in the output. Confirmed by reading the whole function (`:34-64`).
4. **Whole-file sweep done.** All 64 lines were read. Lines 52-54 contain the *only* tag
   matching in the file. `NONCE_PLACEHOLDER` handling (`:39,46,48`) is literal `split`/`join`,
   not tag matching. There is no third case-sensitive matcher hiding here.
5. **Unreachable today — confirmed, not assumed.** `scripts/build-marketing-artifact.ts:848`
   matches `/<script(\s[^>]*)?>/gi` and `:852` rewrites via `tag.replace(/^<script/i, ...)`,
   which lowercases the tag name as a side effect. `grep -o -i "<script" assets/marketing/landing.html`
   returns exactly one hit, lowercase, carrying `nonce="__CSP_NONCE_PLACEHOLDER__"`. So no
   uppercase tag reaches the runtime guard today. **This is defence-in-depth, not a live
   vulnerability — say exactly that in the PR, and do not overstate it.** The fix is still
   correct: a guard must not depend on a normalization performed by a different module in a
   different process.
6. **The nonce is lowercase hex** — `middleware.ts:26`, `crypto.randomUUID().replaceAll('-','')`.
   Relevant to the design decision below.
7. **Precedent test**: `scripts/marketing-artifact.test.ts:741`, `describe('injectNoncePlaceholder — tag casing (CodeQL js/bad-tag-filter)')`.
8. **Existing block to preserve**: `__tests__/marketing-root-route.test.ts:60-117`, 7 tests,
   including an un-nonced-throws test at `:111-116`.
</verified_findings>

<design_decision>
The description offers the 2-line fix (add `i` to both regexes) and invites a merit call on
a `<script` word boundary. Both are decided here; the executor implements this decision and
states the reasoning in the PR.

**Rejected: bare `i` on line 53.** Adding `i` to the constructed RegExp also makes the
**nonce value** match case-insensitively, so `<script nonce="ABC123">` would count as
satisfying nonce `abc123`. The real nonce is lowercase hex (finding 6), so this is as
unreachable as the bug being fixed — which is precisely why it must not be shipped. We are
rejecting "unreachable today" as a reason to leave a guard loose; applying that standard to
the original defect and not to the fix would be incoherent. A nonce is a secret; its
comparison stays case-sensitive.

**Chosen: one scan, case-insensitive tag name, case-sensitive attribute value.** Replace the
two-regex comparison with a single pass that finds each script-tag opening once and asks, for
each one, whether the nonce follows. The bug class here is *two regexes that must agree*;
deleting the second regex deletes the bug class, rather than patching the one symptom we
happened to notice.

**Boundary: yes, adopt it.** Require `<script` to be followed by whitespace, `/`, or `>`.
Reason on merit: without it the count includes `<scriptfoo`, which is not a script tag — a
miscount. The build-side counterpart already requires `(\s[^>]*)?>` (`builder:848`), so there
is in-repo precedent for being stricter. Note honestly that today's error direction for
`<scriptfoo` is fail-*closed* (a spurious throw), so this half was never a security hole,
only an inaccuracy — and with a single scan the boundary is free and cannot reintroduce
asymmetry. `</script>` is unaffected either way (`<` is followed by `/`, not `s`).

Nothing outside counting correctness changes. For the all-lowercase, nonce-first markup the
builder actually emits, the new logic is semantically identical to the old.
</design_decision>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the casing test block and commit it RED</name>
  <files>__tests__/marketing-root-route.test.ts</files>
  <behavior>
    Six cases, added as a new `describe` block immediately after the existing `injectNonce`
    block (which ends at line 117). Mirror the shape and the explanatory header comment of the
    precedent at `scripts/marketing-artifact.test.ts:741`.

    Expected-RED (these assert the DESIRED behaviour, which does not hold yet — NGC-02):
    - R1: `<SCRIPT>` un-nonced alongside one properly nonced lowercase script MUST throw
      `/carry the nonce/`. Currently returns normally — this failure IS the evidence of the
      fail-open.
    - R2: mixed-case `<Script>` un-nonced MUST throw the same way.
    - R3: a `<scriptfoo>` element alongside one properly nonced script MUST NOT throw.
      Currently throws (spurious fail-closed miscount).

    Expected-GREEN-before-and-after (over-correction guards, honestly labelled as such in a
    comment — do NOT claim the whole block is RED):
    - G1: an uppercase `<SCRIPT nonce="...">` that IS correctly nonced must NOT throw, and
      `replacedCount` must be right. Mix it with a lowercase nonced script, expectedCount 2.
    - G2: a tag whose nonce value differs only in CASE from the real nonce (e.g. literal
      `nonce="ABC123"` against nonce `abc123`) MUST still throw. This is the assertion that
      discriminates the chosen fix from the rejected bare-`i` fix.
    - G3: the 7 pre-existing tests at `:60-117` stay untouched and keep passing.
  </behavior>
  <action>
    Append a new `describe` block to `__tests__/marketing-root-route.test.ts` after line 117,
    covering R1, R2, R3, G1 and G2 above. Reuse the existing `NONCE` const pattern and
    `NONCE_PLACEHOLDER` from the import at `:18`. Build every fixture as a small hand-written
    string literal — never the real artifact, never an HTML parser — matching the house style
    of the existing block.

    Head the block with a comment naming what it defends: that the guard's two counts were
    case-sensitive and therefore agreed with each other while disagreeing with reality, and
    that HTML tag names are case-insensitive. Mark R1/R2/R3 as the cases expected to fail
    before the fix and G1/G2 as over-correction guards expected to pass on both sides.

    Do NOT modify or reorder any of the 7 existing tests. Do NOT touch any other file.

    Run the file and CAPTURE the failure output as the RED evidence, then commit. Use an
    explicit red marker in the subject so the commit reads correctly in PR history, e.g.
    `test(marketing): RED -- uppercase script slips past the runtime nonce guard`.
    Stage exactly one path: `__tests__/marketing-root-route.test.ts`. Never `git add -A`;
    the five untracked `.planning/reviews/` and `.planning/todos/pending/` files stay untracked.

    Paste the captured failing-test names into the eventual SUMMARY and PR body — a guard test
    that passes before the fix proves nothing, so the proof is the output, not the claim.
  </action>
  <verify>
    <automated>npx jest __tests__/marketing-root-route.test.ts --runInBand --json --outputFile="${TMPDIR:-/tmp}/ngc-red.json"; node -e 'const r=require(process.env.TMPDIR?process.env.TMPDIR+"/ngc-red.json":"/tmp/ngc-red.json");const a=r.testResults[0].assertionResults;const failed=a.filter(x=>x.status==="failed").map(x=>x.title);const passed=a.filter(x=>x.status==="passed").length;console.log("FAILED:",JSON.stringify(failed,null,1));console.log("passed:",passed);if(failed.length<3){console.error("EXPECTED >=3 RED cases, got "+failed.length+" -- the tests assert current behaviour instead of desired behaviour");process.exit(1)}if(passed<9){console.error("expected the 7 pre-existing injectNonce tests + 2 guards to pass, got "+passed);process.exit(1)}'</automated>
  </verify>
  <done>
    At least 3 named test failures captured (the uppercase, mixed-case and boundary cases),
    the 7 pre-existing injectNonce tests still passing, and a single RED commit on branch
    `nonce-guard-case-insensitive` containing only `__tests__/marketing-root-route.test.ts`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Make the guard's counting case-insensitive, turn the tests GREEN, ship the PR</name>
  <files>lib/marketing/nonceInjection.ts</files>
  <behavior>
    After this task the same test file runs with zero failures and strictly more passing tests
    than the RED run, and no other file in the repo has changed.
  </behavior>
  <action>
    Rewrite lines 52-61 of `lib/marketing/nonceInjection.ts` as a single scan, per
    `<design_decision>` (NGC-01):

    Declare the tag regex INSIDE `injectNonce`, not at module scope — a module-level global
    regex carries `lastIndex` across calls and `injectNonce` is invoked once per request from
    `app/marketing-document/route.ts:74`. A fresh local regex per call has no shared state.
    (The builder handles the same hazard the other way at `build-marketing-artifact.ts:729`
    by resetting `lastIndex`; a local const is simpler here.)

    Match `<script` case-insensitively with a zero-width lookahead requiring the next
    character to be whitespace, a forward slash, or a closing angle bracket. Walk the matches
    with an `exec` loop over a `RegExpExecArray` (not `matchAll`) so `index` is typed `number`
    under `strict` and needs no non-null assertion. For each match, increment the tag count;
    then take the remainder of the string starting at the end of the matched tag name and
    increment the nonced count only when it `startsWith` the literal space-`nonce=`-quote
    sequence followed by the real nonce and a closing quote — a plain case-SENSITIVE string
    comparison. This preserves the existing requirement that the nonce be the first attribute,
    which is exactly what the builder emits.

    Keep the throw at the end comparing the two counts, and keep its message text as-is so the
    existing test at `:111-116` (which matches `/carry the nonce/`) is unaffected.

    Delete the now-unused `escapeRegExp` helper at `:22-24`. It is required: `typecheck:strict`
    runs with `--noUnusedLocals` and `lint` runs with `--max-warnings=0`, so leaving a dead
    module-scope function fails CI. Deleting it is also a small win — a string comparison
    cannot be regex-injected by the nonce at all, so the escaping concern disappears rather
    than being maintained.

    Update the JSDoc at `:26-33` and add a short comment explaining WHY the counting is
    case-insensitive: HTML tag names are case-insensitive, both counts were previously
    lowercase-only so they agreed with each other while disagreeing with the document, and a
    single scan is used so the two counts cannot drift apart again. State in the comment that
    the nonce VALUE comparison stays case-sensitive on purpose. Match the file's existing
    comment voice (why, not what).

    Hard boundaries for this task:
    - Do NOT touch `scripts/build-marketing-artifact.ts`, `scripts/verify-marketing-artifact.ts`,
      `assets/marketing/landing.html`, or `assets/marketing/manifest.json`.
    - Do NOT run `npm run build` — a dev server is on :3000 and a build clobbers `.next`.
    - Stage exactly `lib/marketing/nonceInjection.ts`. Never `git add -A`. The five untracked
      `.planning/` files stay untracked. If the quick workflow needs the planning directory
      committed, do it as a SEPARATE commit, never mixed with code.

    Then run the FULL Verification Gate from `.claude/CLAUDE.md` — all six, no substitutions:
    `npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`,
    `npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`,
    `npm audit --audit-level=high`.

    Open a PR against `main` (protected — never push `main` directly). The PR body MUST carry
    all five points, in the honest framing established in `<verified_findings>`:
    1. CodeQL did NOT flag this; it was found sweeping for siblings of the pattern flagged in
       PR #131, and deliberately kept out of #131 rather than widening a blocked PR.
    2. The guard fails OPEN — an uppercase tag is absent from both counts, so they agree and
       the function returns success with an un-nonced script present. That is why it matters.
    3. It is unreachable today because `build-marketing-artifact.ts:852` lowercases every tag
       as it nonces it. Defence-in-depth, NOT a live vulnerability. Do not overstate it.
    4. The RED-first evidence: the captured failing test names from Task 1 and the commit that
       contains them.
    5. No re-freeze was needed — `assets/marketing/landing.html` is byte-identical and the
       builder was not touched (cite the sha256 below).
    Also state the design call: why the bare `i` flag was rejected (it would make the nonce
    value comparison case-insensitive) and why the `<scriptfoo` boundary was adopted.
  </action>
  <verify>
    <automated>npx jest __tests__/marketing-root-route.test.ts --runInBand --json --outputFile="${TMPDIR:-/tmp}/ngc-green.json"; node -e 'const g=require(process.env.TMPDIR?process.env.TMPDIR+"/ngc-green.json":"/tmp/ngc-green.json");const r=require(process.env.TMPDIR?process.env.TMPDIR+"/ngc-red.json":"/tmp/ngc-red.json");const gf=g.numFailedTests,gp=g.numPassedTests,rp=r.numPassedTests;console.log({redPassed:rp,greenPassed:gp,greenFailed:gf});if(gf!==0){console.error("still RED");process.exit(1)}if(gp<=rp){console.error("no test flipped red->green: the fix is unproven");process.exit(1)}'</automated>
    <automated>test "$(shasum -a 256 assets/marketing/landing.html | cut -d" " -f1)" = "598ab38a96b95367b3375ae58e97072575b4ce37980fbccb014b244a494a68fa" &amp;&amp; echo "ARTIFACT BYTE-IDENTICAL: no re-freeze"</automated>
    <automated>CHANGED="$(git diff --name-only origin/main -- lib scripts assets app components middleware.ts package.json package-lock.json | sort | tr '\n' ' ')"; echo "changed: [$CHANGED]"; test "$CHANGED" = "lib/marketing/nonceInjection.ts " &amp;&amp; echo "SCOPE OK: builder, verifier, artifact and deps untouched"</automated>
    <automated>npm run marketing:verify</automated>
    <automated>npm run security:migrations:verify &amp;&amp; npm run typecheck:strict &amp;&amp; npm run lint &amp;&amp; npm test -- --runInBand &amp;&amp; npm audit --omit=dev --audit-level=moderate &amp;&amp; npm audit --audit-level=high</automated>
  </verify>
  <done>
    All casing tests pass, strictly more tests pass than in the RED run, `landing.html` hashes
    to 598ab38a…, the only changed source file versus `origin/main` is
    `lib/marketing/nonceInjection.ts`, `npm run marketing:verify` passes unweakened, all six
    Verification Gate commands pass, and a PR is open against `main` carrying all five
    required body points.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| committed artifact -> served HTML | `assets/marketing/landing.html` is read from disk and emitted to every anonymous browser at `/`. The per-request CSP nonce is the only thing distinguishing a sanctioned inline script from an injected one. |
| build process -> runtime process | `scripts/build-marketing-artifact.ts` runs via `tsx` at build time; `lib/marketing/nonceInjection.ts` runs per-request in the Next.js server. They share no module and must not share assumptions. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ngc-01 | Elevation of Privilege | `lib/marketing/nonceInjection.ts:52-55` | medium | mitigate | The defect itself: a case-variant `<SCRIPT` is absent from both counts, so the guard returns success with an un-nonced script present. Task 2's single case-insensitive scan makes the counts symmetric by construction. Severity is medium not high because finding 5 proves no uppercase tag reaches the guard today — it is a failed defence layer, not an open door. |
| T-ngc-02 | Spoofing | the nonced-tag comparison | low | mitigate | The naive fix (bare `i` on `:53`) would compare the nonce VALUE case-insensitively, letting a case-variant token count as nonced. Mitigated by comparing the value with a case-sensitive `startsWith` while only the tag name is case-insensitive, and pinned by test G2. |
| T-ngc-03 | Tampering | regex construction from `nonce` | low | mitigate | `escapeRegExp` currently prevents a hostile nonce from altering the pattern. Removing it must not regress that. Mitigated structurally: the replacement uses string comparison, so there is no pattern left to inject into. |
| T-ngc-04 | Denial of Service | the new tag regex | low | accept | The pattern is a literal plus a zero-width character-class lookahead — no alternation, no nested quantifier, no backtracking blowup. Input is the cached, fixed-size committed template (`route.ts:29-49`), not user data. |
| T-ngc-05 | Tampering | `assets/marketing/landing.html` | medium | mitigate | A change here would ship unreviewed markup under a re-freeze. Mitigated by asserting the sha256 is unchanged AND that `git diff` versus `origin/main` lists no file under `assets/` or `scripts/`. |
| T-ngc-SC | Tampering | npm/pip/cargo installs | n/a | accept | No package-manager installs occur in this change; `package.json` and `package-lock.json` are asserted unchanged by the scope gate in Task 2. No Package Legitimacy Gate is required, and both `npm audit` runs stay in the gate regardless. |
</threat_model>

<verification>
1. RED proof exists and is committed: >=3 named failing tests before the fix.
2. GREEN proof exists: zero failures after the fix, with strictly more passing tests than the
   RED run — so a test actually flipped and the fix is not self-certifying.
3. The 7 pre-existing `injectNonce` tests (`:60-117`) are unmodified and passing.
4. `assets/marketing/landing.html` sha256 == `598ab38a96b95367b3375ae58e97072575b4ce37980fbccb014b244a494a68fa`.
5. `git diff --name-only origin/main` over source paths lists exactly
   `lib/marketing/nonceInjection.ts`; `scripts/verify-marketing-artifact.ts` is untouched and
   `npm run marketing:verify` passes unweakened.
6. All six Verification Gate commands pass. `npm run build` was NOT run.
7. The five untracked `.planning/reviews/` and `.planning/todos/pending/` files are still
   untracked.
</verification>

<success_criteria>
`injectNonce` throws on an un-nonced script tag in any casing, does not throw on a correctly
nonced tag in any casing, still rejects a case-variant of the nonce value, and the committed
marketing artifact is byte-for-byte what it was before — with a PR open against `main` that
describes the fail-open honestly as defence-in-depth and shows the RED-first evidence.
</success_criteria>

<output>
Create `.planning/quick/261001-ngc-nonce-guard-case-insensitive/261001-ngc-SUMMARY.md` when done.
</output>
