---
phase: quick/260927-pbc
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [PBC-01, PBC-02, PBC-03]
branch: neutral-black-palette

files_modified:
  - __tests__/palette-single-source.test.ts
  - tailwind.config.ts
  - app/globals.css
  - app/(artist)/antenna/[opportunityId]/page.tsx
  - app/(artist)/layout.tsx
  - app/(artist)/opportunities/page.tsx
  - app/(artist)/vault/[projectId]/pitch/page.tsx
  - app/(auth)/layout.tsx
  - app/email-preview/page.tsx
  - app/global-error.tsx
  - app/selects/[token]/page.tsx
  - app/w/[workspaceId]/layout.tsx
  - components/admin/BuyerOrgsAdmin.tsx
  - components/admin/ChecklistAdmin.tsx
  - components/admin/CuratorAdmin.tsx
  - components/admin/MembersAdmin.tsx
  - components/admin/console-theme.ts
  - components/antenna/ApplicationInbox.tsx
  - components/antenna/OpportunityForm.tsx
  - components/benchmarks/BenchmarkView.tsx
  - components/buyer/fnbl-theme.ts
  - components/contracts/ContractLocker.tsx
  - components/launchpad/SlotGeneratePanel.tsx
  - components/launchpad/TipPanel.tsx
  - components/playbook/ItRoomTopBar.tsx
  - components/profile/ActivityFeed.tsx
  - components/selects-player/theme.ts
  - components/split-sheets/PartyPicker.tsx
  - components/split-sheets/SplitApprovalView.tsx
  - components/split-sheets/SplitSheetBuilder.tsx
  - components/tools/PitchCard.tsx
  - components/tools/PitchPlugForm.tsx
  - components/vault/ExportPackPanel.tsx
  - components/vault/MetadataStudio.tsx
  - components/vault/StemsUpload.tsx
  - components/vault/ToolSidePanel.tsx

must_haves:
  truths:
    - "Every app surface renders on a pure-black ground with neutral-grey text; no indigo undertone remains anywhere under app/ or components/."
    - "The Funūn accent gradient, money colours, nav-rail gradient and status colours are byte-identical to before — only the ground and the neutral text move."
    - "tailwind.config.ts and app/globals.css cannot drift apart on the seven shared values without the test suite failing."
    - "Any retired palette literal reintroduced under app/, components/ or lib/ (outside the lib/email carve-out) fails the suite."
    - "The scanning half of the guard was observed FAILING against the unmodified tree, and its violation count is recorded."
    - "The guard cannot pass vacuously: both parsers are asserted to find exactly seven values, and the file walker is asserted to find a realistic file count."
  artifacts:
    - "__tests__/palette-single-source.test.ts"
    - "tailwind.config.ts — colors block carrying the seven locked values"
    - "app/globals.css — :root block carrying the seven locked values under the differing var names"
    - ".planning/quick/260927-pbc-repaint-surface-palette-to-neutral-black/260927-pbc-SUMMARY.md"
  key_links:
    - "Token↔var name map: ink→--bg, card→--card, card2→--card-2, lav→--lav, lavdim→--lav-dim, hair→--border, hairstrong→--border-strong. If this map is wrong the drift guard measures nothing while printing green."
    - "Value normalisation: globals.css writes rgba with spaces and a leading zero (0.12), tailwind.config.ts writes it compact (.12). The comparator must normalise case, interior whitespace and leading-zero alpha or half (a) fails on formatting, not on drift."
    - "app/global-error.tsx replaces the root layout and states in its own header comment that it cannot rely on the app's CSS. It must keep a literal hex, NOT a CSS var — a var there resolves to nothing and the crash screen loses its background."
---

<objective>
Repaint the Funūn surface palette from the indigo-undertone dark to neutral black, convert
every literal occurrence of the retired values to the shared tokens, and add a guard so the
two palette definitions cannot drift apart again.

Purpose: the Writer's Room bench already runs the neutral-black ground as its default
(`private/bench/index.html:23`, selected at `:1092`). The shipped app is the only surface
still carrying the indigo undertone. Two palette definitions exist today and only agree by
accident of nobody having edited one of them; a guard makes that agreement structural.

Output: seven values changed in two files, ~74 literals converted to tokens across 33 files,
one new boundary-style test, and a recorded pre-fix violation count proving the guard was red
before the repaint.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260927-pbc-repaint-surface-palette-to-neutral-black/260927-pbc-CONTEXT.md
@.claude/CLAUDE.md

@tailwind.config.ts
@app/globals.css
@__tests__/placements-client-server-boundary.test.ts
</context>

<locked_values>
The seven value changes. Copied verbatim from the bench. Do not round, re-derive or improve
them. Each row lists the Tailwind token name and the `app/globals.css` var name, which differ.

| Tailwind token | globals.css var | from | to |
|---|---|---|---|
| `ink` | `--bg` | `#0a0a0f` | `#000000` |
| `card` | `--card` | `#0E0D1E` | `#0a0a0c` |
| `card2` | `--card-2` | `#1A1838` | `#161618` |
| `lav` | `--lav` | `#C7CBF7` | `#d4d4d8` |
| `lavdim` | `--lav-dim` | `#7c80b4` | `#8b8b97` |
| `hair` | `--border` | `rgba(199,203,247,.12)` | `rgba(255,255,255,.08)` |
| `hairstrong` | `--border-strong` | `rgba(199,203,247,.22)` | `rgba(255,255,255,.16)` |

Unchanged, in both files: `grad`, `grad-money`, `nav-rail`, `brandindigo`, `brandfuchsia`,
`money`, `money2`, `--white`, `--indigo`, `--fuchsia`, `--emerald`, `--amber`, `--amber-2`,
`--rose`, `shadow-cta`, `rounded-card`, fonts. The accents are what keep the product reading
as Funūn once the ground goes neutral.
</locked_values>

<scope_notes>
Read this before starting. Three things were verified against the tree during planning that
the CONTEXT's grep does not surface.

**1. Four decimal-rgba spellings of retired values (NOT in the CONTEXT's 81/34 count).**
These are the same retired colours written as decimal triples, so the hex grep is blind to
them. Two of them are the most-seen chrome in the product. Substitution is mechanical — same
locked value, decimal form — and is IN SCOPE for this task:

| site | current | becomes | why it matters |
|---|---|---|---|
| `app/(artist)/layout.tsx:147` | `bg-[rgba(10,10,15,.72)]` | `bg-[rgba(0,0,0,.72)]` | sticky header on every artist page |
| `app/w/[workspaceId]/layout.tsx:84` | `bg-[rgba(10,10,15,.72)]` | `bg-[rgba(0,0,0,.72)]` | same header, workspace routes |
| `components/playbook/ItRoomTopBar.tsx:18` | `rgba(10,10,15,.82)` | `rgba(0,0,0,.82)` | Playbook IT room top bar |
| `app/(auth)/layout.tsx:23` | `bg-[rgba(14,13,30,.86)]` | `bg-[rgba(10,10,12,.86)]` | the sign-in / sign-up card (PR #105) — the first surface a new member sees |

Left alone, the auth card stays visibly indigo floating on a pure-black page. These are
translucent, so they keep the alpha and stay arbitrary values; there is no token for a
translucent surface and inventing one is out of scope.

**2. One retired hex lives inside a comment**, and it is that file's only occurrence:
`app/(auth)/layout.tsx:13` reads "globals.css paints the body flat …". After the repaint that
sentence is false. Rewrite it to describe the black ground without naming a hex. This is why
the scanner reads RAW text rather than stripping comments the way
`__tests__/placements-client-server-boundary.test.ts` does: a comment that names a retired
value is a stale claim about the palette and should fail the same gate the code does.

**3. `app/global-error.tsx` is a genuine exception.** Its own header comment (lines 12-14)
states it replaces the root layout and "cannot rely on the app's Tailwind/CSS being present —
hence inline styles". A CSS var there resolves to nothing. Its `background` stays a literal
hex and simply becomes the new black. The guard still passes because the new value is not a
retired one.

**Deliberately out of scope, to be recorded in the PR body as known residue** (not silently
dropped — flagged for a later decision):

- The `rgba(199,203,247,α)` family at alphas other than the two locked ones — roughly 33
  occurrences across 16 files (progress-bar fills, conic-gradient tracks, hover washes,
  `Rail2.tsx` alone has 10). Over black these read as faint cool-grey; choosing the right
  neutral alpha for each is a design pass, not a substitution, and the CONTEXT locked two
  alphas only.
- `components/selects-player/theme.ts:76`, `rgba(10,9,16,.6)` — near ink but not a retired
  value.
- `lib/email/artistInvite.ts`, `lib/email/artistReopened.ts`, `lib/email/artistSpotOpened.ts`
  — the CONTEXT's explicit carve-out. Email HTML cannot use Tailwind classes, inbox clients
  invert dark backgrounds, and a pure-black email is a design decision nobody has made.
- Anything under `private/` (gitignored bench) or `docs/design/` (historical records).
</scope_notes>

<tasks>

<task type="auto">
  <name>Task 1: Write the palette guard and observe its scanning half RED against the unmodified tree</name>
  <files>__tests__/palette-single-source.test.ts</files>
  <action>
Create the guard following the boundary-test pattern already in this repo —
`__tests__/placements-client-server-boundary.test.ts` for the recursive `walk()` helper and
the `ROOT = process.cwd()` convention, `__tests__/member-api-boundary.test.ts` for the
`readFileSync` + assert-on-source shape. Jest resolves `@/*` to the repo root; the guard needs
no imports beyond `fs` and `path`.

Write BOTH halves now, before touching any palette value. Do not run any part of the repaint
in this task.

Half (a) — the two definitions agree. Parse the `colors` block of `tailwind.config.ts` into a
name-to-value record, and the `:root` block of `app/globals.css` into a var-to-value record.
Compare the seven shared entries through the explicit name map in this plan's
`<locked_values>` table (the names differ between the two files; a comparison that assumes
they match is comparing nothing). Normalise before comparing: lowercase, strip interior
whitespace from rgba, and treat a leading-zero alpha as equal to a bare-dot alpha — globals.css
is prettier-formatted as spaced-with-leading-zero and the Tailwind config is compact, so an
un-normalised comparator fails on formatting rather than on drift.

Half (a) must also assert NON-VACUITY: each parser found exactly seven of its expected keys.
A regex that silently matches nothing produces an empty record, an empty comparison, and a
green test forever. This repo has already shipped one column whose name asserted more than
anything checked; do not ship a second.

Half (b) — no retired literal survives. Recursively walk `app/`, `components/` and `lib/`,
collecting `.ts`, `.tsx` and `.css` files and skipping `node_modules` and dot-directories.
Read each file's RAW text — do NOT strip comments (see `<scope_notes>` item 2 for why this
guard deliberately differs from the placements guard on that point). Flag, case-insensitively,
any occurrence of the five retired hex values listed in `<locked_values>`, and additionally
the four retired decimal triples `rgba(10,10,15,`, `rgba(14,13,30,`, `rgba(26,24,56,` and
`rgba(124,128,180,` (whitespace-tolerant). Allowlist exactly three paths:
`lib/email/artistInvite.ts`, `lib/email/artistReopened.ts`, `lib/email/artistSpotOpened.ts`.
That allowlist is the whole allowlist — if the matcher needs more entries to go green the
matcher is wrong, not the code. Collect offenders as `relative/path:line` strings and assert
the array is empty, so a failure names every site rather than just counting them.

Half (b) must also assert NON-VACUITY: the walker found a realistic number of files (assert
greater than 200 — the real figure is well above that, and a broken walk returns zero).

Then dry-run the guard against the unmodified tree and record what you see:

1. Run half (a) alone. It is EXPECTED TO PASS here — both files currently carry the same old
   values, so there is no drift to detect. If it fails, the parser or the name map is wrong;
   fix that before going further. Half (a) gets its red-then-green proof in Task 2, where the
   tree is genuinely half-repainted.
2. Run half (b) alone. It MUST FAIL. Record the exact offender count and the file count from
   the failure output; both go in the SUMMARY and the PR body. The expected figures from
   planning are 79 offending occurrences across 34 files (81 hexes minus the 6 in the three
   allowlisted lib/email files, plus the 4 decimal-rgba sites). Line numbers and counts shift
   — record the ACTUAL. A number far below the expectation means the matcher is broken, not
   that the tree is cleaner than planning found it.

Commit the guard on its own, RED by design, with a message that says so and carries the count,
e.g. `test(palette): add single-source guard -- RED, N violations pre-fix`. A guard that
passes before the fix proves nothing; this intermediate commit is the proof that it does not.
The branch head is green again after Task 3 and only the head is what ships.
  </action>
  <verify>
    <automated>if npx jest __tests__/palette-single-source.test.ts --runInBand; then echo "FAIL: guard is green before the repaint -- it is measuring nothing"; exit 1; else echo "OK: guard red pre-fix, record the count"; fi</automated>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand -t "agree" </automated>
  </verify>
  <done>
`__tests__/palette-single-source.test.ts` exists and contains both halves plus both
non-vacuity assertions. Half (a) passes on the unmodified tree. Half (b) fails on the
unmodified tree and its offender count and file count are written down. The guard is
committed as a standalone red commit whose message carries the pre-fix count.
  </done>
</task>

<task type="auto">
  <name>Task 2: Repaint the two palette definitions, proving half (a) goes red between them</name>
  <files>tailwind.config.ts, app/globals.css</files>
  <action>
Apply the seven locked values from `<locked_values>` to both definitions. Do it in the order
below, because the intermediate state is the only place half (a) can be observed doing its job.

Step 1 — edit `tailwind.config.ts` ONLY. In the `colors` block (lines 12-24) replace the seven
values. Update the trailing comment on the `ink` line: it currently describes an indigo
undertone that will no longer exist. Leave `brandindigo`, `brandfuchsia`, `money`, `money2`,
the whole `backgroundImage` block including `nav-rail`, `fontFamily`, `boxShadow` and
`borderRadius` untouched. The file-head comment block (lines 3-7) describes the accent hexes
and stays accurate; leave it.

Step 2 — run half (a) of the guard. It MUST FAIL now: the Tailwind config carries the new
values and globals.css still carries the old ones, which is precisely the drift this half
exists to catch. Record that you saw it. If it passes here, the name map in the guard is wrong
and the guard is worthless — go fix Task 1's map before continuing.

Step 3 — edit `app/globals.css` ONLY, the `:root` block at lines 10-25. Apply the same seven
values under the DIFFERENT var names: `--bg`, `--card`, `--card-2`, `--lav`, `--lav-dim`,
`--border`, `--border-strong`. Match the file's existing formatting (lowercase hex, rgba
written spaced with a leading-zero alpha) — the guard normalises, and fighting prettier here
buys nothing. Do not rename any var in this task. Leave `--white`, `--indigo`, `--fuchsia`,
`--emerald`, `--amber`, `--amber-2`, `--rose`, `--grad` and `--grad-money` untouched. Also
update the comment block above `:root` if it makes a claim the new values break.

Step 4 — run half (a) again. It passes. The two definitions now agree on the new palette, and
you have watched the guard fail and recover on a real edit rather than a contrived one.

Do not touch any other file in this task. The scanning half stays red until Task 3 and that is
expected.
  </action>
  <verify>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand -t "agree"</automated>
    <automated>test "$(grep -cE '#000000|#0a0a0c|#161618|#d4d4d8|#8b8b97' tailwind.config.ts)" -eq 5 &amp;&amp; test "$(grep -icE '#000000|#0a0a0c|#161618|#d4d4d8|#8b8b97' app/globals.css)" -eq 5 &amp;&amp; echo OK</automated>
    <automated>test "$(grep -c 'linear-gradient(105deg,#818CF8 0%,#D946EF 100%)' tailwind.config.ts)" -eq 1 &amp;&amp; echo "accents intact"</automated>
  </verify>
  <done>
Both `tailwind.config.ts` and `app/globals.css` carry all seven locked values under their own
naming. Half (a) of the guard was observed failing between the two edits and passing after.
The gradient, money colours, nav-rail gradient and accent hexes are unchanged in both files.
Half (b) is still red.
  </done>
</task>

<task type="auto">
  <name>Task 3: Convert every remaining literal to tokens, turn the guard green, run the full CI gate</name>
  <files>app/(artist)/antenna/[opportunityId]/page.tsx, app/(artist)/layout.tsx, app/(artist)/opportunities/page.tsx, app/(artist)/vault/[projectId]/pitch/page.tsx, app/(auth)/layout.tsx, app/email-preview/page.tsx, app/global-error.tsx, app/selects/[token]/page.tsx, app/w/[workspaceId]/layout.tsx, components/admin/BuyerOrgsAdmin.tsx, components/admin/ChecklistAdmin.tsx, components/admin/CuratorAdmin.tsx, components/admin/MembersAdmin.tsx, components/admin/console-theme.ts, components/antenna/ApplicationInbox.tsx, components/antenna/OpportunityForm.tsx, components/benchmarks/BenchmarkView.tsx, components/buyer/fnbl-theme.ts, components/contracts/ContractLocker.tsx, components/launchpad/SlotGeneratePanel.tsx, components/launchpad/TipPanel.tsx, components/playbook/ItRoomTopBar.tsx, components/profile/ActivityFeed.tsx, components/selects-player/theme.ts, components/split-sheets/PartyPicker.tsx, components/split-sheets/SplitApprovalView.tsx, components/split-sheets/SplitSheetBuilder.tsx, components/tools/PitchCard.tsx, components/tools/PitchPlugForm.tsx, components/vault/ExportPackPanel.tsx, components/vault/MetadataStudio.tsx, components/vault/StemsUpload.tsx, components/vault/ToolSidePanel.tsx</files>
  <action>
Regenerate the worklist first rather than trusting this plan's line numbers — run the CONTEXT's
grep over `app components lib` to get the current file list, and let the guard's own failure
output be the authoritative checklist. Planning measured 70 hex occurrences across 30 files
here (81 total, minus the 5 in globals.css handled in Task 2, minus the 6 in the three
allowlisted lib/email files), plus the 4 decimal-rgba sites in `<scope_notes>`.

Conversion rules, by file kind:

In `.tsx` — use the Tailwind token class: `bg-ink`, `bg-card`, `bg-card2`, `text-lav`,
`text-lavdim`, `border-hair`, `border-hairstrong`. Where a hex sits inside an arbitrary-value
class, replace the WHOLE class: an arbitrary card background becomes `bg-card`, never a
`bg-[var(--card)]` hybrid. Where a hex sits in an inline `style` object (for example
`app/email-preview/page.tsx`, which paints its own preview chrome, or a `conic-gradient`
string), use the CSS var form — `var(--bg)`, `var(--card)`, `var(--card-2)`, `var(--lav)`,
`var(--lav-dim)`, `var(--border)`, `var(--border-strong)` — since a style object cannot carry
a utility class. Every route in the app nests under `app/layout.tsx`, which imports
`globals.css`, so `:root` is in scope everywhere except the one case below.

In `.css` — use `var(--card)` and friends.

In the three CSS-in-TS theme modules — `components/admin/console-theme.ts` (5 occurrences, the
`.fncon` scope), `components/buyer/fnbl-theme.ts` (4, the `.fnbl[data-theme="dark"]` scope) and
`components/selects-player/theme.ts` (2) — these build raw CSS strings and cannot use Tailwind
classes. Point their local vars at the global ones: a local ground/page var takes `var(--bg)`,
a panel takes `var(--card)`, a raised panel or wash takes `var(--card-2)`, a secondary ink
takes `var(--lav)`, a tertiary ink takes `var(--lav-dim)`. Keep each module's own var NAMES
exactly as they are — this task single-sources the values, it does not rename anything.

Four decimal-rgba sites — apply the substitutions in the `<scope_notes>` table verbatim. Keep
the alpha, keep them as arbitrary values.

Two named exceptions:

- `app/global-error.tsx` — its `background` stays an inline literal and becomes plain black.
  Do NOT convert it to a var. The file's own header comment explains why: it replaces the root
  layout and cannot assume the app's CSS loaded. If you convert it, the crash screen loses its
  background and you will not find out from any test.
- `app/(auth)/layout.tsx:13` — the only comment-embedded occurrence, and the file's only hex
  hit. Rewrite the sentence so it describes the black ground without naming a colour value,
  then apply the decimal-rgba card substitution on line 23.

Before committing, grep the test suite for anything pinning the old palette and fix it in this
same commit. Planning found NO test file containing a retired hex, and confirmed
`components/catalogue/TimedTrackPlayer.test.tsx` asserts on the class string `bg-card`, whose
NAME is unchanged — so it needs no edit. Re-check anyway; the tree moves.

Then run the full CI `validate` job per `.claude/CLAUDE.md`, every step, not a subset:
`npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`,
`npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`,
`npm audit --audit-level=high`. Do NOT run `npm run build` — a dev server is live on :3000 and
a build clobbers `.next`. `lint` runs with `--max-warnings=0`, so a single warning fails.

Commit with an explicit pathspec list. Never `git add -A`.

Finally, open the PR (never push `main`). The PR body must state, plainly: the seven value
changes as a table; that the accents, gradient, money colours and nav-rail are untouched; the
pre-fix guard violation count recorded in Task 1; the `lib/email` carve-out as a known,
intentional inconsistency awaiting a separate decision; the residue list from `<scope_notes>`
(the lavender-alpha family and the near-ink selects value) as a second known, intentional
inconsistency; and — clearly — that this is a GLOBAL VISUAL CHANGE to every authenticated
screen, including the sign-in and sign-up pages merged in PR #105, which are the first thing a
new member sees and must be eyeballed on the Vercel preview before merge.
  </action>
  <verify>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand</automated>
    <automated>test "$(grep -rliE '#0a0a0f|#0E0D1E|#1A1838|#C7CBF7|#7c80b4' --include=*.tsx --include=*.ts --include=*.css app components | wc -l | tr -d ' ')" -eq 0 &amp;&amp; echo "no retired hex under app/ or components/"</automated>
    <automated>test "$(grep -rlE 'rgba\(\s*(10\s*,\s*10\s*,\s*15|14\s*,\s*13\s*,\s*30|26\s*,\s*24\s*,\s*56|124\s*,\s*128\s*,\s*180)\s*,' --include=*.tsx --include=*.ts --include=*.css app components | wc -l | tr -d ' ')" -eq 0 &amp;&amp; echo "no retired decimal-rgba under app/ or components/"</automated>
    <automated>test "$(grep -rliE '#0a0a0f|#0E0D1E|#1A1838|#C7CBF7|#7c80b4' --include=*.ts lib | grep -vc '^lib/email/')" -eq 0 &amp;&amp; echo "lib clean outside the email carve-out"</automated>
    <automated>npm run typecheck:strict &amp;&amp; npm run lint &amp;&amp; npm test -- --runInBand</automated>
    <automated>npm run security:migrations:verify &amp;&amp; npm audit --omit=dev --audit-level=moderate &amp;&amp; npm audit --audit-level=high</automated>
  </verify>
  <done>
`npx jest __tests__/palette-single-source.test.ts` passes both halves. Zero retired hex and
zero retired decimal-rgba occurrences remain under `app/` or `components/`; the only remaining
occurrences anywhere are the three allowlisted `lib/email/artist*.ts` files. `app/global-error.tsx`
still uses an inline literal, now black. The `app/(auth)/layout.tsx` comment no longer names a
retired value. Every step of the CI `validate` job passes, with `npm run build` deliberately
not run. A PR is open carrying the seven-value table, the pre-fix violation count, both known
carve-outs, and the global-visual-change warning naming the sign-in and sign-up pages.
  </done>
</task>

</tasks>

<!-- planner-discipline-allow: #0a0a0f -->
<!-- planner-discipline-allow: #0E0D1E -->
<!-- planner-discipline-allow: #1A1838 -->
<!-- planner-discipline-allow: #C7CBF7 -->
<!-- planner-discipline-allow: #7c80b4 -->

<threat_model>
## Trust Boundaries

No trust boundary moves in this task. It changes presentational token values, adds one
filesystem-reading test, installs no packages, touches no route, no query, no migration, no
auth path and no serialised data. The threat worth registering is that the safeguard itself
is silently inert.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-pbc-01 | Tampering | `__tests__/palette-single-source.test.ts` | medium | mitigate | The guard's failure mode is a vacuous pass: a parser regex that matches nothing, or a `walk()` that returns no files, yields an empty comparison and green forever. Mitigated by two mandatory non-vacuity assertions (each parser found exactly seven keys; the walker found >200 files) plus the Task 1 requirement that half (b) be OBSERVED red pre-fix and half (a) be OBSERVED red mid-repaint in Task 2. |
| T-pbc-02 | Denial of Service | `app/global-error.tsx` | low | mitigate | Converting its inline hex to a CSS var would strip the crash screen's background, because it replaces the root layout and loads no app CSS. No test can see this. Mitigated by naming it as an explicit exception in Task 3 and pinning the reason to the file's own header comment. |
| T-pbc-03 | Information Disclosure | `lib/email/artist*.ts` | low | accept | The three email templates keep the retired hexes, so outbound mail and in-app surfaces diverge visually. Accepted per the CONTEXT carve-out: email HTML cannot use Tailwind classes, inbox clients invert dark backgrounds, and a pure-black email is an unmade design decision. Recorded in the PR body rather than fixed. |
| T-pbc-04 | Tampering | branch `neutral-black-palette` | low | mitigate | Task 1 lands a deliberately RED commit. If that commit were treated as shippable the suite would be broken on `main`. Mitigated by branch protection (`main` rejects direct pushes until `validate` passes) and by Task 3 gating the PR on the full validate job at branch head. |
</threat_model>

<verification>
Run the full CI `validate` job from `.claude/CLAUDE.md` at branch head — every step, not a
subset. A weaker gate has already passed a real defect through six consecutive waves in this
repo:

- `npm run security:migrations:verify`
- `npm run typecheck:strict`
- `npm run lint` (`--max-warnings=0`; any warning fails)
- `npm test -- --runInBand`
- `npm audit --omit=dev --audit-level=moderate`
- `npm audit --audit-level=high`

`npm run build` is NOT part of the validate job and is forbidden here — a dev server is live
on :3000 and a build clobbers `.next`.

Human eyeball, on the Vercel preview, before merge — this is a global visual change and no
test can see it:

1. Sign-in and sign-up (PR #105) — the card must read neutral on black, not indigo.
2. The artist dashboard and its sticky header.
3. One Sound Vault project page and one Writer's Room work page.
4. One admin console page (`.fncon` scope) and the public Selects player (`.selp` scope) —
   these carry their own scoped var systems and are the likeliest place a var mapping is wrong.
5. Confirm the accent gradient and money colours still read as Funūn.
</verification>

<success_criteria>
- Seven locked values applied to both `tailwind.config.ts` and `app/globals.css`, under their
  differing names, with no accent, gradient, money, font, shadow or radius token changed.
- Zero retired hex and zero retired decimal-rgba literals under `app/` and `components/`.
- The only surviving retired literals in the repo are in the three allowlisted
  `lib/email/artist*.ts` files, and the guard's allowlist contains exactly those three paths.
- `__tests__/palette-single-source.test.ts` passes, and was observed failing before the
  repaint (half b) and mid-repaint (half a), with the pre-fix violation count recorded.
- The guard cannot pass vacuously: both parser non-vacuity assertions and the walker file-count
  assertion are present.
- Every step of the CI validate job passes at branch head. `npm run build` was not run.
- A PR is open carrying the value table, the pre-fix count, both carve-outs, and the
  global-visual-change warning naming the sign-in and sign-up pages.
</success_criteria>

<output>
Create `.planning/quick/260927-pbc-repaint-surface-palette-to-neutral-black/260927-pbc-SUMMARY.md`
when done. It must record the ACTUAL pre-fix violation count and file count from Task 1, the
final converted-file count, and both carve-out lists verbatim so the PR body and the summary
cannot drift.
</output>
