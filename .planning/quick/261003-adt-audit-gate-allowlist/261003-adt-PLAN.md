---
phase: quick-261003-adt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/audit-gate.ts
  - scripts/audit-gate.test.ts
  - package.json
  - .github/workflows/quality.yml
  - .claude/CLAUDE.md
autonomous: true
requirements: [QUICK-261003-adt]
tags: [ci, security, npm-audit, supply-chain]

must_haves:
  truths:
    - "`npm run audit:gate` exits 0 on today's tree, with the braces chain suppressed by a dated deferral."
    - "All 7 high advisories are suppressed by the ONE deferral, not just `braces` — the 6 string-`via` dependents resolve transitively."
    - "Past 2026-11-02 the deferral stops suppressing and the gate exits 1 again."
    - "A deferral whose advisory is gone from the report is reported as stale and does NOT fail the build."
    - "A malformed or unparseable expiry date never suppresses — it is reported and the gate fails."
    - "If `npm audit --json` cannot be parsed, the gate exits nonzero rather than printing green."
    - "`npm audit --omit=dev --audit-level=moderate` is byte-identical in quality.yml and has no deferral path."
    - "Zero new npm dependencies are added."
  artifacts:
    - scripts/audit-gate.ts
    - scripts/audit-gate.test.ts
  key_links:
    - "quality.yml step 32 -> `npm run audit:gate` -> scripts/audit-gate.ts"
    - "package.json scripts.audit:gate -> tsx scripts/audit-gate.ts (same command CI runs)"
    - ".claude/CLAUDE.md Verification Gate command list -> quality.yml validate job steps"
---

<objective>
Replace the blanket `npm audit --audit-level=high` CI step with a dependency-free gate
that carries dated, justified, self-expiring exceptions — so the unpatchable dev-chain
`braces` advisory stops blocking every PR without silently losing coverage.

Purpose: `npm audit --audit-level=high` exits 1 on `main` today (verified below), so the
`validate` job is red repo-wide and every PR is blocked. The only fix npm offers is
semver-major and unacceptable. The gate must let this ONE advisory through, on a clock,
while still failing on anything new.

Output: `scripts/audit-gate.ts` (pure, testable logic + CLI), `scripts/audit-gate.test.ts`
(fixture-driven, no network), an `audit:gate` npm script, the quality.yml swap, and an
updated Verification Gate section in `.claude/CLAUDE.md`.
</objective>

<verified_findings>
Every claim below was checked against this working tree on 2026-10-03 with
npm 11.12.1 / node v24.15.0. Do not re-derive; do not assume beyond this.

**F1 — the gate is red today.** `npm audit --audit-level=high` exits **1**.
`npm audit --omit=dev --audit-level=moderate` exits **0** ("found 0 vulnerabilities").
Production is clean; the whole problem is dev-only.

**F2 — there is no patch.** `npm view braces version` -> **3.0.3**, which is both the
installed version and the vulnerable range (`<=3.0.3`). `fixAvailable` for every one of
the 7 entries is `{ name: "tailwindcss", version: "4.3.3", isSemVerMajor: true }`.

**F3 — the JSON shape (`auditReportVersion: 2`).** Top-level keys are
`auditReportVersion`, `vulnerabilities`, `metadata`. `vulnerabilities` is an object keyed
by package name. Each entry has `name`, `severity`, `isDirect`, `via`, `effects`, `range`,
`nodes`, `fixAvailable`.

**F4 — THE CRITICAL ONE. `via` is a mixed array, and only 1 of 7 entries carries the
advisory.** Measured exactly:

```
@next/eslint-plugin-next   sev=high  direct=false  via=[STR:fast-glob]
braces                     sev=high  direct=false  via=[OBJ:GHSA-vfj7-8cjw-p6xm]
chokidar                   sev=high  direct=false  via=[STR:braces]
eslint-config-next         sev=high  direct=true   via=[STR:@next/eslint-plugin-next]
fast-glob                  sev=high  direct=false  via=[STR:micromatch]
micromatch                 sev=high  direct=false  via=[STR:braces]
tailwindcss                sev=high  direct=true   via=[STR:chokidar, STR:fast-glob, STR:micromatch]
```

A `via` element is EITHER an advisory object (`{source, name, dependency, title, url,
severity, cwe, cvss, range}`) OR a **string naming another key in `vulnerabilities`**.
A gate that only matches advisory objects suppresses `braces` alone and **still fails CI
on the other 6** — it would look implemented and not work. Resolution must recurse:
`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces ->
GHSA-vfj7-8cjw-p6xm` is **5 hops**.

**F5 — the advisory ID is only in the URL.** The object carries `source: 1240992` (npm's
numeric id) and `url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm"`. There is no
`ghsa` field. The GHSA must be read off the end of `url`.

**F6 — `npm audit --json` exits 1 when vulnerabilities exist, and still writes valid JSON
to stdout.** Confirmed. The script must therefore NOT treat npm's nonzero exit as an
error, and must read stdout from the thrown error object.

**F7 — `scripts/*.ts` IS type-checked.** tsconfig `include` is `["next-env.d.ts",
"**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]`; `npx tsc --listFiles` lists 10 files under
`/scripts/`. So the new script is covered by `typecheck:strict` (`noUnusedLocals` +
`noUnusedParameters`) and by `npm run lint` at `--max-warnings=0`.

**F8 — house style for this exact kind of script** (`scripts/verify-marketing-artifact.ts`,
`scripts/marketing-assets.ts`): `#!/usr/bin/env node`, a `// ─── Title ───` banner comment
explaining *why*, named exports of the pure logic and its typed consts, a `main()` guarded
by `if (require.main === module)`, every `console` call preceded by
`// eslint-disable-next-line no-console`, all violations collected and reported together
rather than stopping at the first. Co-located test is `scripts/<name>.test.ts`.
Jest is `preset: ts-jest`, `testEnvironment: 'node'`, **no jsdom**.
</verified_findings>

<design_decisions>
These are settled. Implement them; do not re-litigate during execution.

**D-01 — Name the thing a DEFERRAL, not an allowlist.**
`Skill("label-integrity-funun")` asks: *does the label match the contents?* An "allow"
list asserts "these are permanently permitted." The contents are time-bounded,
single-advisory, approved suspensions that come back on a date. "Deferral" matches the
write-site guarantee exactly: *a named approver recorded a reason and a date, after which
this fails again.* Use `AuditDeferral` / `AUDIT_DEFERRALS` / `audit:gate` throughout.

Note the coherence this buys: the name is only honest *because* expiry is enforced. If
D-02 were weakened, "deferral" would itself become an over-claiming label — the exact
defect class the skill documents.

**D-02 — An expired deferral FAILS the build. Justification required by the brief:**
if expiry only warned, the gate would be permanently weakened and the expiry field would
be decorative — a name nothing enforces. Implement it as *expired deferrals simply do not
suppress*, so the advisory fails on its own security merits rather than on a bookkeeping
error. Still print `deferral for GHSA-… expired on <date>` alongside, so the human knows
why it came back rather than thinking a new advisory appeared.

**D-03 — A stale deferral (advisory no longer in the report) WARNS; exit stays 0.
Justification required by the brief:** a stale entry means the advisory was *fixed* —
the posture improved. Failing CI on good news turns a successful dependency upgrade into
an unrelated red build, which is how teams learn to bypass gates. Print a loud, explicit
`remove this entry` line instead. Accumulation is bounded anyway, because every entry
still carries an expiry that forces periodic review.

**D-04 — A malformed/unparseable `expires` FAILS and never suppresses.** `expires: "soon"`
must not become an immortal deferral. Fail closed.

**D-05 — If the audit output cannot be parsed, exit nonzero.** A gate that passes when it
could not run is worse than no gate — `.claude/CLAUDE.md` names this trap directly
("a check that prints green without exercising what it claims to cover"). Distinguish
"npm found vulnerabilities" (exit 1, valid JSON — normal) from "no parseable JSON"
(network/registry failure — hard fail).

**D-06 — Apply the severity threshold in our own code; call `npm audit --json` with no
`--audit-level`.** Deterministic, and makes the threshold directly unit-testable.
Order: info < low < moderate < high < critical. Default threshold `high`.

**D-07 — Suppression requires ALL of a package's resolved advisories to be covered, not
ANY.** A package that also carries a second, undeferred advisory must still fail. This is
the property that keeps the gate honest once there is more than one entry.

**D-08 — Deferrals live as a typed exported const in the script, not a JSON file.** JSON
cannot carry comments, and `tsconfig` already type-checks `scripts/` (F7), so a typed
const gets shape-checking for free and matches `PROHIBITED_LITERALS` in
`verify-marketing-artifact.ts`. Pure functions still take deferrals as a parameter so
tests supply their own.

**D-09 — No new npm dependency.** `tsx` is already a devDependency driving six existing
scripts; using it adds nothing. Do not add `audit-ci` or `better-npm-audit`.
</design_decisions>

<working_tree_guard>
A parallel session owns files in this tree. Recorded baseline, measured at plan time:

- **10 modified-but-unstaged tracked files** — `app/(auth)/AuthBanner.tsx`,
  `app/help/page.tsx`, `app/r/[projectId]/page.tsx`, `assets/marketing/landing.html`,
  `assets/marketing/manifest.json`, `components/buyer/BuyerTopNav.tsx`,
  `components/nav/ArtistNav.tsx`, `components/nav/WorkspaceNav.tsx`,
  `scripts/marketing-artifact.test.ts`, `scripts/marketing-assets.ts`.
- **10 untracked files** — this is MORE than the brief listed. Beyond the six
  `.planning/reviews/` + `.planning/todos/pending/` files, the parallel session also has
  `.planning/quick/261003-uniform-header-pronunciation/PLAN.md` + `SUMMARY.md` and
  **`components/brand/BrandPronunciation.tsx` + `BrandPronunciation.test.tsx`**. Those
  last two are live source files; `git add -A` would commit another session's half-done
  component into this PR.

Stage **only** by explicit path: `scripts/audit-gate.ts`, `scripts/audit-gate.test.ts`,
`package.json`, `.github/workflows/quality.yml`, `.claude/CLAUDE.md`, and this plan
directory. Never `git add -A`, never `git add .`, never `git stash`.

At finish, re-measure: `git diff --name-only | wc -l` must still be **10**, and
`git ls-files --others --exclude-standard` must still list the parallel session's files
(the count rises only by this plan's own `.planning/quick/` artifacts).

`scripts/marketing-artifact.test.ts` and `scripts/marketing-assets.ts` are open in the
other session — read them for style if needed, but do not edit them.
</working_tree_guard>

<context>
@.github/workflows/quality.yml
@package.json
@scripts/verify-marketing-artifact.ts
@jest.config.js
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the dependency-free audit gate with self-expiring deferrals</name>
  <files>scripts/audit-gate.ts</files>
  <behavior>
    Pure, exported, no I/O — these are the unit-test targets:
    - `resolveAdvisories(report, pkgName)` returns the full set of advisory objects a
      package is vulnerable through, walking string `via` entries recursively (F4) with a
      visited-set cycle guard. `eslint-config-next` must resolve to GHSA-vfj7-8cjw-p6xm
      across 5 hops.
    - `advisoryId(viaObject)` returns the GHSA read off the end of `url` (F5), uppercased;
      falls back to `npm:<source>` when the URL carries no GHSA.
    - `classifyDeferral(entry, now)` returns active / expired / invalid-date. Invalid date
      is its own state, never silently active (D-04).
    - `evaluate({ report, deferrals, threshold, now })` returns
      `{ failures, staleDeferrals, expiredDeferrals, invalidDeferrals }` and collects ALL
      of them before returning (F8 house style), never short-circuits.
    Cases that must hold:
    - Active deferral for GHSA-vfj7-8cjw-p6xm suppresses all 7 packages -> 0 failures.
    - Same deferral with `now` past `expires` -> 7 failures, and it is listed as expired.
    - An at-or-above-threshold advisory with no deferral -> failure.
    - A package resolving to two advisories, only one deferred -> still fails (D-07).
    - A deferral matching nothing in the report -> listed stale, contributes 0 failures.
    - `expires: "soon"` -> listed invalid, suppresses nothing.
    - A `moderate` advisory under threshold `high` -> ignored.
    - A cyclic `via` graph terminates instead of overflowing the stack.
    - A report object with no `vulnerabilities` key -> throws (D-05).
  </behavior>
  <action>
Create `scripts/audit-gate.ts` following the house pattern in
`scripts/verify-marketing-artifact.ts` (F8): `#!/usr/bin/env node` shebang, a
`// ─── Audit gate ───` banner explaining why this exists (CI red repo-wide, braces has no
patched version, npm's only fix is semver-major Tailwind 4 — cite F1/F2), named exports,
`main()` behind `if (require.main === module)`, and
`// eslint-disable-next-line no-console` before every console call because lint runs at
`--max-warnings=0` (F7).

Define and export `type AuditDeferral` with exactly these fields: `advisory` (GHSA string),
`package` (string, the package the advisory originates in), `reason` (string),
`approvedBy` (string), `approvedOn` (YYYY-MM-DD), `expires` (YYYY-MM-DD). Per D-01 name the
type and the exported const for what they are — a dated deferral — and do not use a term
that asserts permanent permission anywhere in this file.

Export `const AUDIT_DEFERRALS: readonly AuditDeferral[]` holding exactly ONE entry:
advisory `GHSA-vfj7-8cjw-p6xm`, package `braces`, approvedOn `2026-10-03`, expires
`2026-11-02` (the owner's 30 days), approvedBy the repo owner, and a reason stating that
braces 3.0.3 is simultaneously the installed and the latest published version so no
upstream patch exists (F2), that npm's only offered fix is a semver-major Tailwind 4
upgrade that would rewrite `tailwind.config.ts`, and that the entire chain is
devDependencies-only with `npm audit --omit=dev --audit-level=moderate` reporting zero (F1).

Implement the pure functions named in the behavior block. For `resolveAdvisories`, walk
`report.vulnerabilities[name].via`: an object element is an advisory; a string element is a
key back into `vulnerabilities` and must be followed recursively, carrying a `Set` of
visited package names so a cyclic graph terminates. This recursion is the load-bearing part
— per F4 only `braces` carries an advisory object and the other six reference it by string
through up to 5 hops, so a one-level implementation would leave CI red on 6 packages while
appearing to work.

For `classifyDeferral`, parse `expires` strictly as `YYYY-MM-DD` and treat the deferral as
active through the end of that day in UTC; anything that fails to parse is the invalid
state, which suppresses nothing (D-04). Take `now` as an explicit parameter so tests are
deterministic — never read the clock inside a pure function.

For `evaluate`, compute each package's resolved advisory set, drop packages below the
severity threshold using the ordering in D-06, and mark a package suppressed only when
EVERY advisory in its resolved set is covered by an active deferral (D-07). Separately
collect deferrals that matched no advisory anywhere in the report (stale), that classified
expired, and that classified invalid. Throw a descriptive Error if `vulnerabilities` is
absent from the report, per the repo's error-handling convention of failing loudly with an
actionable message.

Add `runNpmAudit()` that shells out with `execFileSync('npm', ['audit', '--json'], ...)`
and NO `--audit-level` flag (D-06). Because npm exits 1 whenever vulnerabilities exist
while still writing valid JSON to stdout (F6), wrap the call in try/catch and read
`err.stdout` on throw; only when stdout yields no parseable object carrying
`vulnerabilities` should this be treated as a real failure (D-05).

`main()` reads the report, calls `evaluate` with `AUDIT_DEFERRALS`, threshold `high`, and
the real clock, then prints: every unsuppressed advisory with its package, severity and
URL; every expired deferral as a line naming the advisory and the date it lapsed, so a
returning failure is legible as a lapsed deferral rather than a surprise; every invalid
deferral; and every stale deferral as an explicit instruction to delete that entry. Exit 1
when there are failures or invalid deferrals, exit 0 when the only remarks are stale ones
(D-02, D-03, D-04). On a fully clean pass print one summary line naming how many deferrals
are active and the earliest expiry date, so the next person sees the clock without opening
the file.
  </action>
  <verify>
    <automated>npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep -c 'scripts/audit-gate' | grep -qx 0 && npx tsx scripts/audit-gate.ts; echo "gate exit: $?"</automated>
    <automated>grep -v '^#' scripts/audit-gate.ts | grep -ci 'allowlist' | grep -qx 0</automated>
    <automated>grep -c 'AUDIT_DEFERRALS\|GHSA-vfj7-8cjw-p6xm\|2026-11-02' scripts/audit-gate.ts</automated>
  </verify>
  <done>
    `npx tsx scripts/audit-gate.ts` exits 0 and reports the braces chain as deferred until
    2026-11-02. Typecheck is clean for this file. The file contains exactly one deferral
    entry, names the concept a deferral rather than a permanent permission (D-01), and
    contains no new import from outside the node builtins.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fixture-driven unit tests for the gate's pure logic</name>
  <files>scripts/audit-gate.test.ts</files>
  <behavior>
    Every case listed in Task 1's behavior block, asserted against hand-built fixtures with
    no network and no clock dependence. There is no jsdom and `testEnvironment` is `node`,
    so nothing here may touch the DOM.
  </behavior>
  <action>
Create `scripts/audit-gate.test.ts` following the convention of the existing co-located
script tests: a `// ─── … ───` banner stating that these are pure fixture tests with no
network, importing the named exports from `./audit-gate`.

Build the primary fixture as a trimmed but shape-faithful `auditReportVersion: 2` payload
reproducing the exact seven-entry graph measured in F4 — `braces` holding the one advisory
object with its real `url`, `source`, `severity` and `range`, and the other six carrying
string `via` references in precisely the arrangement shown. Keep it inline as a typed const
so a reader can see the graph; do not snapshot a live audit run, which changes under them.

Assert, at minimum: an active deferral for the GHSA yields zero failures across all seven
packages; the same deferral evaluated with a `now` after its expiry yields seven failures
and appears in the expired list; `eslint-config-next` resolves to that GHSA through the
five-hop string chain (test `resolveAdvisories` directly so a regression to one-level
lookup is caught at the function, not just the aggregate); an undeferred advisory added to
the fixture produces a failure; a package resolving to two advisories with only one deferred
still fails (D-07); a deferral whose advisory is absent is reported stale and contributes
zero failures (D-03); an unparseable `expires` is reported invalid and suppresses nothing
(D-04); a `moderate`-severity advisory is ignored at threshold `high` and caught at
threshold `moderate`; a deliberately cyclic `via` graph terminates rather than exhausting
the stack; and a report missing `vulnerabilities` throws (D-05).

Add one guard assertion over the committed `AUDIT_DEFERRALS` const itself: every entry's
`expires` parses as a real date, and every entry has a non-empty `reason` and `approvedBy`.
That keeps a future hand-edited entry from landing in the shape D-04 is meant to reject.

Pass `now` explicitly in every case. No test may depend on the real date, or it will start
failing on 2026-11-03 for the wrong reason.
  </action>
  <verify>
    <automated>npx jest scripts/audit-gate.test.ts --runInBand 2>&1 | tail -20</automated>
    <automated>npx jest scripts/audit-gate.test.ts --listTests | grep -c 'audit-gate.test.ts' | grep -qx 1</automated>
  </verify>
  <done>
    The suite passes and `--listTests` resolves to exactly one file — the bracketed-path
    trap in `.claude/CLAUDE.md` does not apply here, and this check proves the tests are
    actually discovered rather than silently matching zero. Every assertion supplies its
    own `now`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire the gate into package.json, CI, and the Verification Gate doc</name>
  <files>package.json, .github/workflows/quality.yml, .claude/CLAUDE.md, scripts/audit-gate.test.ts</files>
  <action>
In `package.json`, add `"audit:gate": "tsx scripts/audit-gate.ts"` to the scripts block,
placed next to the other verification scripts so it reads with `security:migrations:verify`
and `marketing:verify`. Add no dependency to any dependency block (D-09).

In `.github/workflows/quality.yml`, replace **line 32 only** —
`      - run: npm audit --audit-level=high` — with a named step running
`npm run audit:gate`. Give it a `name:` consistent with the existing
`Verify security migration package` step. **Line 31,
`      - run: npm audit --omit=dev --audit-level=moderate`, must come through byte-identical.**
Production dependencies keep a strict gate with no exception mechanism at all; the deferral
path exists only for the dev-inclusive run. Change nothing else in the file.

In `.claude/CLAUDE.md`, update the Verification Gate section (the fenced command block
begins at line 466). Replace the sixth command, `npm audit --audit-level=high`, with
`npm run audit:gate`, and annotate it inline the way the neighbouring lines are annotated —
one short clause noting it is `npm audit` at the high threshold plus dated deferrals that
expire. Add one bullet to the `Notes:` list, in that section's existing voice, recording
that a deferral stops suppressing on its expiry date and the build goes red again by
design, so the response to a lapsed entry is to re-evaluate the advisory rather than to
push the date out reflexively. Leave the rest of the section — the `npm run build` note,
the lint note, the protected-`main` note, and the closing paragraph about checks that print
green — untouched.

Finally, append one guard test to `scripts/audit-gate.test.ts` that reads
`.github/workflows/quality.yml` and `.claude/CLAUDE.md` off disk and asserts the
Verification Gate command block lists every `npm`-invoking step the `validate` job runs,
with no step missing and none left over. This exact drift — a doc enumerating commands that
no longer match CI — is what the brief flags as sending the next session to run a command
that does not exist, and it is cheap to lock permanently. Assert the production audit line
is present verbatim in both files, so a future edit cannot quietly relax `--omit=dev`.
  </action>
  <verify>
    <!-- planner-discipline-allow: audit-level=high -->
    <automated>grep -c 'npm run audit:gate' .github/workflows/quality.yml | grep -qx 1 && grep -c 'npm audit --omit=dev --audit-level=moderate' .github/workflows/quality.yml | grep -qx 1 && grep -v '^#' .github/workflows/quality.yml | grep -c 'audit-level=high' | grep -qx 0</automated>
    <automated>node -e 'const p=require("./package.json");if(p.scripts["audit:gate"]!=="tsx scripts/audit-gate.ts")process.exit(1);const d=JSON.stringify(p.dependencies)+JSON.stringify(p.devDependencies);if(/audit-ci|better-npm-audit/.test(d))process.exit(1)'</automated>
    <automated>git diff --stat package-lock.json | grep -c . | grep -qx 0</automated>
    <automated>npx jest scripts/audit-gate.test.ts --runInBand 2>&1 | tail -15</automated>
  </verify>
  <done>
    CI runs `npm run audit:gate` in place of the old blanket step; the `--omit=dev`
    production audit is byte-identical; `package-lock.json` is untouched (zero new
    dependencies); `.claude/CLAUDE.md` lists the six commands CI actually runs; and a guard
    test fails if the doc and the workflow ever drift apart again.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry -> CI | Advisory data and package tarballs cross from an external source into the build |
| committed deferral const -> CI gate decision | A human-asserted record decides whether a known-vulnerable package is permitted |
| dev dependency tree -> deployed bundle | Dev tooling must not reach production; the `--omit=dev` run is the enforcement |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-adt-01 | Elevation of Privilege | `AUDIT_DEFERRALS` expiry handling | high | mitigate | Expiry is enforced, not advisory (D-02); an unparseable date fails closed (D-04); a committed-const guard test asserts every entry has a parseable `expires`, a `reason` and an `approvedBy`. An exception with no working clock is just a permanently weakened gate, and per `label-integrity-funun` would make the word "deferral" a claim nothing checks. |
| T-adt-02 | Denial of Service / false assurance | `runNpmAudit()` output handling | high | mitigate | npm exits 1 with valid JSON on findings (F6), so exit code alone cannot be trusted either way. Parse stdout; treat *unparseable* output as hard failure (D-05). A gate that passes when the registry is unreachable is the "prints green without exercising what it claims" trap named in `.claude/CLAUDE.md`. |
| T-adt-03 | Tampering | scope creep of the deferral mechanism into production deps | critical | mitigate | `npm audit --omit=dev --audit-level=moderate` stays byte-identical with no deferral path; Task 3's guard test asserts that exact line is present in both quality.yml and CLAUDE.md, so relaxing it requires visibly editing a test. |
| T-adt-04 | Spoofing | incomplete advisory resolution masking real findings | high | mitigate | Resolution must cover ALL advisories a package reaches, and suppression requires every one to be covered, not any (D-07). Tested directly at `resolveAdvisories`, not only through the aggregate, so a regression to one-level matching is caught. |
| T-adt-05 | Information Disclosure | stale deferrals accumulating unnoticed | low | accept | Warn, do not fail (D-03). Failing CI because a vulnerability was *fixed* converts a good upgrade into an unrelated red build and teaches bypass. Bounded because every entry still expires. |
| T-adt-SC | Tampering | npm/pip/cargo installs | high | mitigate | **Zero packages installed by this plan.** No Package Legitimacy Gate is required because no install task exists; `package-lock.json` being unchanged is an explicit verify gate in Task 3. Adding a dev dependency to work around a dev-dependency advisory would enlarge the very attack surface being gated. |
</threat_model>

<verification>
Run the **full** `validate` job per `.claude/CLAUDE.md`, with the sixth command replaced by
the thing this task builds — state that substitution explicitly when reporting:

```bash
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate     # must stay 0 vulnerabilities
npm run audit:gate                              # NEW — replaces the old blanket step
```

Do **not** run `npm run build`; a dev server is live on :3000 and the build clobbers
`.next`.

Two checks beyond the job, because an exit code alone does not prove this gate means what
it says:

1. **Prove the clock works.** Temporarily evaluate with a `now` past 2026-11-02 (via the
   test suite, not by editing the committed const) and confirm the gate reports 7 failures.
   A deferral mechanism that has never been observed to lapse is unverified.
2. **Prove the chain resolves.** Confirm the passing run suppresses all 7 packages, not
   just `braces`. Per F4 this is the one way the implementation can look finished and be
   wrong.

Then re-measure the working tree against `<working_tree_guard>`: 10 modified tracked files,
and the parallel session's 10 untracked files still untracked.
</verification>

<success_criteria>
- `npm run audit:gate` exits 0 today; `npm audit --omit=dev --audit-level=moderate` still 0.
- All 7 advisories suppressed by the single deferral, verified as 7 and not 1.
- Expiry observed to lapse in test, with `now` injected rather than the committed date edited.
- Stale entry warns and passes; invalid date fails; unparseable audit output fails.
- `package-lock.json` unchanged; no new dependency in either dependency block.
- `.claude/CLAUDE.md` Verification Gate matches the workflow, locked by a guard test.
- Working tree baseline intact; only this plan's six paths staged.
</success_criteria>

<pr>
Target `main`. The body must state:

- The gate is **red repo-wide today** — `npm audit --audit-level=high` exits 1 on `main`,
  so every PR is blocked, including ones that touch nothing related.
- `braces` has **no patched version**: 3.0.3 is both installed and latest, and the vulnerable
  range is `<=3.0.3`. npm's only offered fix is `isSemVerMajor` — Tailwind 3.4 -> 4.3.3
  (an engine and config rewrite that would tear up `tailwind.config.ts` and the
  neutral-black palette tokens locked two days ago) or an `eslint-config-next` **downgrade**
  to 14.2.35 from 15.x. Neither is acceptable as an audit fix.
- `npm audit --omit=dev --audit-level=moderate` reports **0 vulnerabilities**; both roots are
  devDependencies, the vulnerable code is lint and CSS tooling globbing our own source, and
  **none of it is in the deployed bundle**. That step is unchanged and keeps no exception path.
- The **expiry mechanism**: each entry carries an advisory, a package, a reason, an approver
  and a date; past that date it stops suppressing and the build goes red again. An exception
  without one is just a weakened gate — which is also why it is called a deferral rather than
  a permanent permission. One entry, expiring 2026-11-02.
- A deferral that no longer matches anything is surfaced for removal but does not fail the
  build, because failing CI when a vulnerability gets *fixed* is how gates get bypassed.
- This branch carries **PR #134's export-copy commit (`756ce68d`)** for working-tree reasons —
  a clean base off `origin/main` was impossible without disturbing a parallel session — so
  **merging this closes #134**.
</pr>

<output>
Create `.planning/quick/261003-adt-audit-gate-allowlist/261003-adt-SUMMARY.md` when done.
</output>