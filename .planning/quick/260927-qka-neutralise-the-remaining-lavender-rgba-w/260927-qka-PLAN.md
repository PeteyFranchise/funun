---
phase: 260927-qka
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [QKA-01, QKA-02, QKA-03]
files_modified:
  - __tests__/palette-single-source.test.ts
  - .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md
  - app/(artist)/earnings/page.tsx
  - app/(artist)/vault/[projectId]/readiness/page.tsx
  - components/admin/HealthRulesForm.tsx
  - components/admin/console-theme.ts
  - components/antenna/OpportunityCard.tsx
  - components/benchmarks/BenchmarkView.tsx
  - components/buyer/fnbl-theme.ts
  - components/coach/RightsCoach.tsx
  - components/playbook/AccessEditorMatrix.tsx
  - components/playbook/Rail2.tsx
  - components/profile/ProfileView.tsx
  - components/selects-player/theme.ts
  - components/vault/PlaybackView.tsx
  - components/vault/PublicPlaybackView.tsx
  - components/vault/VaultProjectCard.tsx

must_haves:
  truths:
    - The palette guard fails on the lavender rgba family at ANY alpha under app/ and components/, not just on the five retired hex spellings (QKA-01).
    - The extended scan was observed RED against the unmodified tree, and the observed offender count is recorded in the branch history before any substitution lands (QKA-01).
    - Zero occurrences of the lavender rgba family survive under app/, components/ and lib/ outside the lib/email carve-out (QKA-02).
    - Every custom property in the three scoped theme blocks resolves at computed-value time — no declaration references its own name (QKA-02).
    - The five accent rgba families and the locked palette definitions in tailwind.config.ts / app/globals.css are byte-identical to 1728a221 (QKA-02).
    - The full CI validate job passes on the branch tip, and the PR body names the --ink-3 judgement call and the observed pre-fix count (QKA-03).
  artifacts:
    - __tests__/palette-single-source.test.ts — extended with a lavender-family scan carrying its own non-vacuity file-count assertion
    - .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md — the recorded RED observation
    - 15 modified source files carrying the neutral substitutions
  key_links:
    - "199,203,247 is the decimal spelling of retired hex #c7cbf7, which the hex scan already lists — the decimal-pattern list simply omitted it. That is the hole."
    - "console-theme.ts and selects-player/theme.ts both DEFINE --border in their own block, so a var(--border) value there is a silent self-cycle → literals only."
    - "fnbl-theme.ts defines --line / --line-2 / --wash-2 / --ink-3, all distinct from global names, and already resolves var(--lav) / var(--lav-dim) on the same line → var() is safe there."
    - "Tailwind token hair = rgba(255,255,255,.08) and hairstrong = rgba(255,255,255,.16) are exactly the two locked Category A targets, so bg-hair is a token swap, not a colour change."
---

<objective>
PR #118 repainted the surface palette to neutral black and shipped
`__tests__/palette-single-source.test.ts`. That guard scans for five retired **hex**
literals. `#c7cbf7` is one of them — and `rgba(199,203,247,α)` is that same colour in
decimal, which contains no `#`. 38 lavender washes across 15 files therefore survived
the repaint and now sit tinted on a pure-black ground.

Purpose: finish the repaint and close the guard hole that let it be a partial repaint,
in that order, so the guard is proven to catch what it claims to catch.

Output: an extended guard observed RED before the fix, 38 neutral substitutions, a
recorded pre-fix count, and a PR whose body names the one judgement call.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-CONTEXT.md
@.claude/CLAUDE.md
@__tests__/palette-single-source.test.ts
</context>

<preflight>
## Facts verified against the tree at `1728a221` (branch `neutral-lavender-washes`, clean)

Every claim below was read from source, not inferred. Line numbers were measured
today; re-measure before editing if the tree has moved.

**Inventory — 38 occurrences, 33 distinct lines, 15 files.**

The 38-vs-33 gap is not a shortfall: three lines carry multiple occurrences each —
`components/buyer/fnbl-theme.ts:22` (4), `components/admin/console-theme.ts:25` (2),
`components/selects-player/theme.ts:22` (2). `38 − 8 + 3 = 33`. A `file:line` guard
therefore reports **33 offenders**, and that is the expected number, not a miss.

| alpha | n | sites |
|---|---|---|
| `.22` | 10 | HealthRulesForm 137/301/305/338/350, AccessEditorMatrix 113, console-theme 25, selects-player/theme 22 + 81, fnbl-theme 22 |
| `.05` | 10 | Rail2 174/188/204/230/251/267/297/313/340/391 |
| `.12` | 8 | earnings 158, readiness 199 + 216, RightsCoach 98, BenchmarkView 201, console-theme 25, selects-player/theme 22, fnbl-theme 22 |
| `.14` | 4 | OpportunityCard 36, PlaybackView 385, VaultProjectCard 116, selects-player/theme 163 |
| `.16` | 2 | ProfileView 101, PublicPlaybackView 254 |
| `.55` | 1 | fnbl-theme 22 (`--ink-3`) |
| `.28` | 1 | selects-player/theme 76 |
| `.18` | 1 | PlaybackView 249 |
| `.10` | 1 | fnbl-theme 22 (`--wash-2`) |

**The locked targets are already the Tailwind tokens.** `tailwind.config.ts:22-23`
defines `hair: 'rgba(255,255,255,.08)'` and `hairstrong: 'rgba(255,255,255,.16)'`,
matching `app/globals.css:24-25` `--border` / `--border-strong`. Category A is a token
swap, not a colour decision. `bg-hair` has existing precedent
(`components/catalogue/DiaryFeed.tsx`) and both `app/**` and `components/**` are inside
the Tailwind `content` globs (`tailwind.config.ts:9`).

**The self-cycle trap, resolved per file by reading each block:**

- `components/admin/console-theme.ts:25` — `.fncon{…--border:…;--border-2:…}` DEFINES
  both names. `var(--border)` here is self-referential. → **literals for both.**
- `components/selects-player/theme.ts:22` — `.selp{…--border:…;--border2:…}` DEFINES
  `--border`. → **literals for both**, keeping the block internally consistent.
- `components/buyer/fnbl-theme.ts:22` — defines `--line`, `--line-2`, `--wash-2`,
  `--ink-3`: all distinct from the global names. The same line already carries
  `--ink:var(--lav)` and `--ink-2:var(--lav-dim)` and renders today, which is positive
  evidence the globals resolve inside this block. → **`var()` is safe here.**

**Baseline:** `npx jest __tests__/palette-single-source.test.ts --runInBand` is green
today — 11 passed. The extension adds 2 tests → 13 expected at the branch tip.
</preflight>

<tasks>

<task type="auto">
  <name>Task 1: Extend the guard, observe it RED against the unmodified tree, record the count</name>
  <files>__tests__/palette-single-source.test.ts, .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md</files>
  <action>
Do this task FIRST and commit it BEFORE any substitution. A guard that is only ever run
after the fix proves nothing; this commit is the evidence that it catches the real thing.

Add a NEW constant and a NEW `describe` block to `__tests__/palette-single-source.test.ts`.
Do NOT create a second guard file, and do NOT add the lavender pattern to the existing
`RETIRED_DECIMAL_PATTERNS` array — that array feeds the existing hex/decimal test, which
CONTEXT.md requires to stay green throughout. A separate block keeps the existing halves
green while the new one goes red, which is what makes the RED observation legible.

Add near `RETIRED_DECIMAL_PATTERNS`:

- A constant matching the lavender family at any alpha and any internal whitespace —
  case-insensitive, anchored on the three channel numbers followed by a comma, so it
  matches regardless of how the alpha is spelled.
- A head comment recording the mechanism of the hole: those three channel numbers are
  the decimal spelling of retired hex `#c7cbf7`, which `RETIRED_HEXES` already lists.
  The hex scan cannot see it because a decimal rgba contains no `#`, and the original
  decimal-pattern list covered four of the five retired hexes and omitted this one.
  State that PR #118's repaint was partial for exactly this reason.

Add the new `describe` block after the existing half-(b) block. It must:

- Build its own file list with the existing `walk` helper over the existing `SCAN_DIRS`,
  and reuse the existing `ALLOWLIST` verbatim so `lib/email` is carved out identically
  to the hex scan.
- Carry its OWN non-vacuity test asserting the walker found more than 200 files. The
  vacuity failure mode described in the file header applies to this scan too: a walker
  that silently returns nothing produces an empty offender list and a green test forever.
- Scan RAW lines, comments included, matching the existing block's deliberate choice —
  a comment naming a retired colour is a stale claim about the palette.
- Collect offenders as `relative/path:lineNumber` and assert the collected array equals
  the empty array, so the failure message enumerates every offending line.

Do not touch `tailwind.config.ts`, `app/globals.css`, half (a), `RETIRED_HEXES`,
`RETIRED_DECIMAL_PATTERNS`, `ALLOWLIST`, `SCAN_DIRS` or `walk`.

Now run the extended guard against the still-unmodified source tree and OBSERVE IT FAIL.
Record what you actually see — do not copy the numbers from this plan. Write
`260927-qka-PREFIX-VIOLATIONS.md` in the quick-task directory containing: the full list
of offender `file:line` strings the new test printed; the distinct-line count; the
occurrence count; the file count; and a one-line note reconciling occurrences against
lines by naming the three multi-occurrence lines. Expected today: 33 lines, 38
occurrences, 15 files. If what you observe is materially smaller, stop and investigate
the matcher before proceeding — a shortfall means the scan is weaker than the grep and
the hole is not actually closed.

Commit the extended guard and the record together. This commit is intentionally RED in
isolation; that is the point, and the branch tip is green after Task 2. Stage the two
paths by name — never `git add -A`.
  </action>
  <verify>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand > /tmp/qka-red.txt 2>&1; test $? -ne 0 && echo "RED as required" || (echo "GUARD PASSED PRE-FIX — the scan is not catching the family; fix the matcher" && exit 1)</automated>
    <automated>grep -qE "Tests:[[:space:]]+1 failed, 12 passed, 13 total" /tmp/qka-red.txt && echo "exactly one test red — the new scan; hex scan and both agreement halves stayed green"</automated>
    <automated>test "$(grep -rnoE 'rgba\([[:space:]]*199[[:space:]]*,[[:space:]]*203[[:space:]]*,[[:space:]]*247[[:space:]]*,' --include=*.ts --include=*.tsx --include=*.css app components lib | cut -d: -f1,2 | sort -u | wc -l | tr -d ' ')" = "33" && echo "33 distinct offender lines present at RED, matching what the guard must enumerate"</automated>
    <automated>test "$(grep -rlE 'rgba\([[:space:]]*199[[:space:]]*,[[:space:]]*203[[:space:]]*,[[:space:]]*247[[:space:]]*,' --include=*.ts --include=*.tsx --include=*.css app components lib | wc -l | tr -d ' ')" = "15" && echo "15 files still unmodified, as expected at RED"</automated>
    <automated>test -s .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md && grep -qE '\b(33|38|15)\b' .planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-PREFIX-VIOLATIONS.md</automated>
  </verify>
  <done>
The extended guard fails against the unmodified tree, naming every offending line at
`file:line`. Its non-vacuity test confirms the walker saw a realistic file count. The
existing hex scan and both two-file agreement halves still pass. The observed counts
are written to `260927-qka-PREFIX-VIOLATIONS.md` and committed alongside the guard.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply the 38 neutral substitutions across the 15 files</name>
  <files>app/(artist)/earnings/page.tsx, app/(artist)/vault/[projectId]/readiness/page.tsx, components/admin/HealthRulesForm.tsx, components/admin/console-theme.ts, components/antenna/OpportunityCard.tsx, components/benchmarks/BenchmarkView.tsx, components/buyer/fnbl-theme.ts, components/coach/RightsCoach.tsx, components/playbook/AccessEditorMatrix.tsx, components/playbook/Rail2.tsx, components/profile/ProfileView.tsx, components/selects-player/theme.ts, components/vault/PlaybackView.tsx, components/vault/PublicPlaybackView.tsx, components/vault/VaultProjectCard.tsx</files>
  <action>
The mapping below is LOCKED by CONTEXT.md. Apply it; do not re-derive it, do not
second-guess an individual alpha, and do not extend it to any other colour family.
Line numbers are from today's measurement — re-verify each before editing.

**Category A — 18 sites that were the locked values all along (no design judgement).**
Old `hair` = `.12` → white `.08`; old `hairstrong` = `.22` → white `.16`.

`.12` → `rgba(255,255,255,.08)`:
- `app/(artist)/earnings/page.tsx:158` — arbitrary-value progress-track background →
  replace the whole arbitrary class with the `bg-hair` token.
- `app/(artist)/vault/[projectId]/readiness/page.tsx:216` — same shape → `bg-hair`.
- `components/coach/RightsCoach.tsx:98` — same shape → `bg-hair`.
- `components/benchmarks/BenchmarkView.tsx:201` — same shape → `bg-hair`.
- `app/(artist)/vault/[projectId]/readiness/page.tsx:199` — inside a `conic-gradient`
  template literal alongside hard-coded `#818CF8` / `#D946EF` → use the white literal,
  matching its neighbours.
- `components/admin/console-theme.ts:25` — the `--border` declaration → **white literal**
  (self-cycle; see preflight).
- `components/selects-player/theme.ts:22` — the `--border` declaration → **white literal**
  (self-cycle).
- `components/buyer/fnbl-theme.ts:22` — the `--line` declaration → `var(--border)`
  (distinct name, safe).

`.22` → `rgba(255,255,255,.16)`:
- `components/admin/HealthRulesForm.tsx:137, 301, 305, 338, 350` — these are
  `var(--border-2, …)` style fallbacks. Keep the `var(--border-2, …)` wrapper exactly as
  it is and swap only the fallback colour inside it to the white literal.
- `components/playbook/AccessEditorMatrix.tsx:113` — same `var(--border-2, …)` fallback
  shape → same treatment.
- `components/admin/console-theme.ts:25` — the `--border-2` declaration → white literal,
  so the whole `.fncon` token block stays internally consistent with its `--border`.
- `components/selects-player/theme.ts:22` — the `--border2` declaration → white literal.
  Note `--border2` does not collide with a global name, so a `var()` would technically
  resolve; a literal is chosen deliberately so the pair `--border` / `--border2` reads
  the same way and no future reader has to re-derive which of the two is safe.
- `components/selects-player/theme.ts:81` — the `.chip-funun` border, a usage site rather
  than a declaration → white literal, same rationale as above.
- `components/buyer/fnbl-theme.ts:22` — the `--line-2` declaration →
  `var(--border-strong)` (distinct name, safe).

**Category B rule 1 — low-alpha washes (α ≤ .10): keep the alpha, swap the hue only.**
At these alphas the hue is imperceptible and the alpha carries the interaction feedback.
- `components/playbook/Rail2.tsx:174, 188, 204, 230, 251, 267, 297, 313, 340, 391` — all
  ten are the identical `hover:bg-[…]` arbitrary value. Swap the hue to white, keep `.05`.
  Do NOT run these through the linear fit: it would land near `.02` and make the hover
  state effectively invisible.
- `components/buyer/fnbl-theme.ts:22` — the `--wash-2` declaration at `.10`: hue to white,
  alpha unchanged. Use a literal — `--wash-2` has no global equivalent to point at.

**Category B rule 2 — mid-alpha borders and tracks: the linear fit through the two
locked anchors, `α' = 0.8α − 0.016`, rounded to two decimals.** This is interpolation
between `.12→.08` and `.22→.16`, not extrapolation.
- `.14` → white `.10`: `components/antenna/OpportunityCard.tsx:36` (conic-gradient),
  `components/vault/PlaybackView.tsx:385` (arbitrary-value scrub track),
  `components/vault/VaultProjectCard.tsx:116` (conic-gradient),
  `components/selects-player/theme.ts:163` (`.mini .mscrub` background).
- `.16` → white `.11`: `components/profile/ProfileView.tsx:101` (conic-gradient),
  `components/vault/PublicPlaybackView.tsx:254` (arbitrary-value scrub track).
- `.18` → white `.13`: `components/vault/PlaybackView.tsx:249` (waveform bar, the unfilled
  branch of the ternary).
- `.28` → white `.21`: `components/selects-player/theme.ts:76` (`.previewpill` border).

**Category B rule 3 — the one judgement call, already decided.**
`components/buyer/fnbl-theme.ts:22` `--ink-3` at `.55` is TEXT, not a wash. Do not run it
through the wash rule — white at `.55` on the buyer portal is a readability change, not a
hue change. Set it to `var(--lav-dim)`, the palette's existing tertiary-text token, which
is what it was standing in for.

Record one observable consequence for the PR body: the same line already sets
`--ink-2:var(--lav-dim)`, so after this change `--ink-2` and `--ink-3` resolve to the same
value and the buyer dark theme loses its secondary/tertiary text distinction. This is a
consequence of the locked decision, not a reason to revisit it — state it in the PR body
and flag the buyer portal for eyeballing on the Vercel preview.

**Out of bounds, hard.** Do not edit `tailwind.config.ts` or `app/globals.css` — the
seven values are locked and already correct. Do not touch anything under `lib/email`,
`private/` or `docs/design/`. Do not touch the accent families `52,211,153`,
`245,158,11`, `244,63,94`, `129,140,248`, `217,70,239` — those are accents and must
survive byte-identical.

Commit with the paths named explicitly. Never `git add -A`: this tree has an untracked
planning directory and parallel sessions can leave unrelated files behind.
  </action>
  <verify>
    <automated>test "$(grep -rohE 'rgba\(\s*199\s*,\s*203\s*,\s*247\s*,' --include=*.ts --include=*.tsx --include=*.css app components lib | wc -l | tr -d ' ')" = "0"</automated>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand 2>&1 | grep -E "Tests:\s+13 passed, 13 total"</automated>
    <automated>git diff --name-only 1728a221 -- tailwind.config.ts app/globals.css | wc -l | tr -d ' ' | grep -qx 0 && echo "locked palette definitions untouched"</automated>
    <automated>test "$(git diff 1728a221 --unified=0 -- app components | grep '^-' | grep -v '^---' | grep -cE 'rgba\(\s*(52\s*,\s*211\s*,\s*153|245\s*,\s*158\s*,\s*11|244\s*,\s*63\s*,\s*94|129\s*,\s*140\s*,\s*248|217\s*,\s*70\s*,\s*239)')" = "0" && echo "no accent rgba line was removed by this diff"</automated>
    <automated>test "$(grep -ohE -- '--border-?2?[[:space:]]*:[[:space:]]*rgba\([[:space:]]*255[[:space:]]*,[[:space:]]*255[[:space:]]*,[[:space:]]*255[[:space:]]*,' components/admin/console-theme.ts components/selects-player/theme.ts | wc -l | tr -d ' ')" = "4" && echo "all four self-defining border declarations are white literals"</automated>
    <automated>test "$(grep -ohE -- '--border-?2?[[:space:]]*:[[:space:]]*var\(' components/admin/console-theme.ts components/selects-player/theme.ts | wc -l | tr -d ' ')" = "0" && echo "no self-defining border declaration resolves through var()"</automated>
    <automated>npm run typecheck:strict</automated>
    <automated>npm run lint</automated>
  </verify>
  <done>
Zero lavender-family occurrences remain under `app/`, `components/` and `lib/`. The
palette guard is green at 13 tests, including the scan that was red in Task 1.
`tailwind.config.ts` and `app/globals.css` are unchanged from `1728a221`. No accent
rgba was removed. Neither `console-theme.ts` nor `selects-player/theme.ts` contains a
`var()` reference to a border name it defines itself. `typecheck:strict` and `lint`
both pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run the full CI validate gate and open the PR</name>
  <files>(no source changes — verification and PR only)</files>
  <action>
Run every step CI's `validate` job runs, in this order, and require all of them green.
A weaker gate is what let a real defect through six consecutive waves in Phase 39:

- `npm run security:migrations:verify`
- `npm run typecheck:strict`
- `npm run lint`
- `npm test -- --runInBand`
- `npm audit --omit=dev --audit-level=moderate`
- `npm audit --audit-level=high`

Do NOT run `npm run build`. It is not part of validate, and there is a live dev server
on :3000 whose `.next` it would clobber.

Push the branch and open a PR against `main` — `main` is protected, so never push it
directly.

The PR body must state all seven of these, because each one is a thing a reviewer
cannot recover from the diff alone:

1. That PR #118's guard had a hex-only blind spot, why (the lavender family is the
   decimal spelling of retired hex `#c7cbf7`, and a decimal rgba contains no `#`), and
   that this PR closes it.
2. The observed pre-fix violation count from Task 1, quoted from
   `260927-qka-PREFIX-VIOLATIONS.md`, including the occurrences-vs-lines reconciliation.
3. That the 18 Category-A sites were the locked `hair` / `hairstrong` values all along —
   sites the hex-based worklist could not see, not a new design decision.
4. The Category-B mapping rule (`α' = 0.8α − 0.016`, two decimals) **and where it was
   deliberately not applied**: the Rail2 hovers and `--wash-2` keep their alpha because
   the fit would have driven a hover state to near-invisibility.
5. The `--ink-3` judgement call, called out explicitly as the one judgement call in the
   task — `.55` is text, not a wash, so it became `var(--lav-dim)` rather than white at
   `.55` — together with the consequence that `--ink-2` and `--ink-3` now resolve to the
   same value in the buyer dark theme.
6. The self-cycle finding: `console-theme.ts` and `selects-player/theme.ts` define
   `--border` inside their own scope, so literals were used there while `fnbl-theme.ts`
   could safely use `var()`. A silently-wrong `var()` is invisible to every test in the
   suite, which is why it is written down.
7. That the buyer portal (`fnbl-theme`), the admin console (`console-theme`), the
   Playbook Rail2 hovers and the Selects player are the surfaces most changed and are
   worth eyeballing on the Vercel preview.
  </action>
  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high</automated>
    <automated>gh pr view --json url,body --jq '.body' | grep -qi 'ink-3' && gh pr view --json body --jq '.body' | grep -qiE 'c7cbf7|hex-only|blind spot'</automated>
    <human-check>Open the Vercel preview and eyeball four surfaces against main: the buyer portal in dark mode (borders and tertiary text), the admin console, the Playbook Rail2 hover states, and the Selects player. Confirm nothing reads washed-out or invisible.</human-check>
  </verify>
  <done>
All six validate steps pass locally. The branch is pushed and a PR is open against
`main` whose body covers all seven required points. The four most-changed surfaces have
been eyeballed on the preview.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none newly crossed | This change edits CSS colour literals and one test file. No input parsing, no auth, no data path, no network call, no dependency is added or altered. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qka-01 | Information Disclosure | `.fnbl[data-theme="dark"]` `--ink-3` | low | mitigate | Lowering tertiary-text contrast could render a legal/rights disclaimer unreadable rather than merely dim. Mitigated by using the palette's existing `--lav-dim` token instead of white at `.55`, plus the Task 3 human-check on the buyer portal preview. |
| T-qka-02 | Denial of Service | `console-theme.ts`, `selects-player/theme.ts` | medium | mitigate | A self-referential custom property is invalid at computed-value time and fails silently — borders vanish and no test sees it, which can make an admin or player control unusable. Mitigated by literals in both self-defining blocks and by the Task 2 gate asserting neither file references a border name it defines. |
| T-qka-03 | Tampering | dependencies | low | accept | No package is installed, upgraded or removed by this task, so the package legitimacy gate does not apply. `npm audit` still runs at both thresholds in Task 3 as a standing check. |
</threat_model>

<verification>
- Extended guard observed RED against the unmodified tree, with the count recorded and committed before any substitution — the ordering, not just the outcome.
- Zero lavender-family occurrences under `app/`, `components/`, `lib/` outside `lib/email`.
- Palette guard green at 13 tests; the existing hex scan and both two-file agreement halves green throughout.
- `tailwind.config.ts` and `app/globals.css` byte-identical to `1728a221`.
- No accent rgba family removed by the diff.
- Full CI validate job green. `npm run build` not run.
- PR open with all seven required body points.
</verification>

<success_criteria>
The lavender repaint is complete, the guard that missed it now fails on it, and the
branch history shows the guard failing before the fix landed rather than only passing
after it.
</success_criteria>

<output>
Create `.planning/quick/260927-qka-neutralise-the-remaining-lavender-rgba-w/260927-qka-SUMMARY.md` when done.
</output>

<!-- planner-discipline-allow: rgba(199,203,247 -->
<!-- planner-discipline-allow: 199,203,247 -->
