---
phase: 261004-wrr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/catalogue/GuidingLine.tsx
  - components/catalogue/GuidingLine.test.tsx
  - components/catalogue/WorkHeader.tsx
  - components/catalogue/WorkHeader.test.tsx
  - components/catalogue/WorkRoster.tsx
  - components/catalogue/WorkRoster.test.tsx
  - .planning/todos/pending/2026-10-04-work-page-provenance-row.md
autonomous: false
requirements: [QUICK-261004-WRR]

must_haves:
  truths:
    - "The guiding-line action button no longer paints the full two-stop brand gradient — the page's single gradient spend stays on ComposerCard's primary action, which is what both components' own comments already say."
    - "The work header reads as the bench's title row: a 21px bold title with an inline uppercase indigo pill beside it, not a dim eyebrow stacked above it."
    - "Status chips across the header and roster use the project's money/money2 tokens and a hairline border, not raw Tailwind amber classes."
    - "GuidingLine still takes a single step or null; a stack still cannot be constructed; the type-level assertion still fails compilation if that drifts."
    - "No tab, module, LyricsPad or WorkPage structure changed; no component prop was added or removed; no data was touched."
  artifacts:
    - components/catalogue/GuidingLine.tsx
    - components/catalogue/WorkHeader.tsx
    - components/catalogue/WorkRoster.tsx
    - components/catalogue/GuidingLine.test.tsx
    - components/catalogue/WorkHeader.test.tsx
    - components/catalogue/WorkRoster.test.tsx
    - .planning/todos/pending/2026-10-04-work-page-provenance-row.md
  key_links:
    - "GuidingLine's button ↔ ComposerCard.tsx:118-122's BUDGET RULE comment — the comment names the guiding-line row explicitly; the code violated it."
    - "Every colour ↔ tailwind.config.ts token names (never the bench's CSS literals) — see the palette trap in <context> below."
    - "WorkRoster's member list ↔ its existing per-row affordances (promote button, designation picker, ✍/🎤 badges) — restyle must not remove any of them."
---

<objective>
Restyle three existing Writer's Room components — `WorkHeader`, `WorkRoster`,
`GuidingLine` — to match the approved bench at `http://127.0.0.1:4321/index.html`.

**Visual only.** No information-architecture change, no new components, no new props,
no data changes, no structural edit to `WorkPage` or `LyricsPad`.

Purpose: this is **part 1 of a deliberate two-part split**. The bench also replaces the
shipped work page's interleaved canvas with seven peer tabs — that reverses the
owner-ratified Phase 37 decision 001 ("the diary is the canvas", C desktop / A mobile)
and has been split out as **part 2**, to be decided on its own. Part 1 ships the
uncontested cosmetic layer so part 2 can be argued on its merits rather than smuggled in.

Output: three restyled components, three tightened test files, one todo capturing the
cut provenance row, and a PR against `main`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@./.claude/CLAUDE.md
@components/catalogue/GuidingLine.tsx
@components/catalogue/WorkHeader.tsx
@components/catalogue/WorkRoster.tsx
@.claude/skills/sketch-findings-funun/references/catalogue-hygiene-ui.md

## Verified facts this plan rests on (file:line)

Each was read in source, not inferred.

| Claim | Evidence |
|---|---|
| GuidingLine's own header comment forbids the full gradient here | `components/catalogue/GuidingLine.tsx:23-28` — "never the full `bg-grad` gradient, which is this surface's single spend and belongs to ComposerCard's empty-state primary action" |
| …and the button violates it today | `components/catalogue/GuidingLine.tsx:58` — `bg-gradient-to-r from-brandindigo to-brandfuchsia` <!-- planner-discipline-allow: from-brandindigo to-brandfuchsia --> |
| ComposerCard names the guiding-line row by hand in its budget rule | `components/catalogue/ComposerCard.tsx:118-122` — "do not add a second one to a later change here or **on the composer/guiding-line row above**"; the spend itself is at `:126` |
| `bg-grad` is the same two stops | `tailwind.config.ts:27` — `linear-gradient(105deg,#818CF8 0%,#D946EF 100%)`, i.e. brandindigo→brandfuchsia. The shipped button differs from the reserved utility by its *angle only*. |
| Bench guiding line is a tinted-border secondary, not a gradient | `private/bench/index.html:544-548` (`.gline .doit`) + the comment at `:538-539` stating the same budget rule |
| Bench container styling already matches shipped exactly | `private/bench/index.html:540-542` (`.gline`) vs `GuidingLine.tsx:42` — radius 10, `brandindigo/30` border, `brandindigo/10 → brandfuchsia/5` wash, 13/14 padding. **No container change needed.** |
| Bench title treatment | `private/bench/index.html:54` (`.wh h2`) + `:493-497` (`.titlerow`, `.roomtag`) |
| Bench chip treatment | `private/bench/index.html:56-59` (`.chip`, `.chip.ok`, `.chip.warn`) |
| Bench in-list avatar + row treatment | `private/bench/index.html:254-258` (`.mrow .mface`, `.mrow .n1`), `:245-248` (`.mrow`, `:hover`) |
| WorkRoster is rendered here, unwrapped | `components/catalogue/WorkPage.tsx:1545-1551` |
| No jsdom; tests are static markup + type-level | `jest.config.js` `testEnvironment: 'node'`; see `GuidingLine.test.tsx:5-6` |

## THE PALETTE TRAP — read this before touching a colour

The bench's `:root` block (`private/bench/index.html:11-18`) carries the **retired
lavender palette** (`--card:#0e0d1e`, `--lav:#c7cbf7`, `--border:rgba(199,203,247,.12)`).
That is NOT what the bench renders: `private/bench/index.html:1540` sets
`document.body.dataset.ground='neutral'` on load, and the `neutral` ground
(`:26-31`) is **byte-identical to the shipped palette** — `#000000`, `#0a0a0c`,
`#161618`, `#d4d4d8`, `#8b8b97`, `rgba(255,255,255,.08)`, `rgba(255,255,255,.16)`,
matching `tailwind.config.ts:15-23` and `app/globals.css:10-25`.

But the ground switch only overrides the *variables*. Hardcoded
`rgba(199,203,247,…)` literals scattered through the bench's CSS (avatar washes,
tick borders, row hovers) **survive the neutral ground and are stale lavender.**

Therefore: **translate by token name, never by literal.** Reading a hex out of the
bench and pasting it in is the single most likely way to produce a visual regression
here, and `__tests__/palette-single-source.test.ts` will fail you for it anyway —
it is a rule (dark AND blue-dominant), not a list.

The accent mapping (the bench states accents never change across grounds, `:20`):

| Bench | Token |
|---|---|
| `var(--indigo)` / `rgba(129,140,248,…)` | `brandindigo` |
| `var(--fuchsia)` / `rgba(217,70,239,…)` | `brandfuchsia` |
| `var(--amber)` / `rgba(245,158,11,…)` `#f59e0b` | `money` |
| `var(--amber-2)` `#f4c77b` | `money2` |
| `var(--emerald)` `#34d399` | `emerald-400` |
| `var(--fg)` | `white` |
| `rgba(199,203,247,.N)` (any) | `lav/[.N]` — **grey now, by design** |

## Hard stops

If any of these appear necessary, **stop and report rather than proceeding**:
- a new or changed component prop
- a structural edit to `WorkPage.tsx` or `LyricsPad.tsx`
- a change to the tab/module arrangement or `LyricsPad`'s `roomModules` contract
- replacing `WorkRoster`'s member list with the bench's `.msrow` toggle selector
  (that removes per-row affordances — it is IA, not styling)
- adding a dependency, or editing the bench, the marketing artifact, or `scripts/`

## Out of scope, deliberately
- The bench's **"FROM AN IDEA" provenance row** (`private/bench/index.html:563-573`).
  Not cosmetic: the work has no reverse link to its originating idea.
  `lib/ideas/schema.ts:44` holds `promotedWorkId` pointing idea→work, so surfacing it
  needs a reverse lookup in the server page. Task 1 captures it as a todo.
- The bench's `.wh` **right-hand status chips** ("Splits unsigned", "Lead vocal set",
  `private/bench/index.html:1131-1134`). The shipped right slot is deliberately empty and
  reserved for sketch 004's destination lights in 37.2 (`WorkHeader.tsx:274-278`).
  Filling it is new information, not a restyle.
- The bench's **collapsed `.meta` identity line** (`@handle · A, B, C +3`,
  `private/bench/index.html:1129`), which replaces N chips with one truncated line plus an
  overflow count. That is an IA change; the shipped chip row stays.
- The bench's **"Writer's Room"** wording for the title pill. The shipped label is
  "Unreleased work" — a true statement about the work's state, not a room name.
  Changing it is a copy decision, not a visual one. Keep the shipped copy.
- Tabs, modules, `LyricsPad`, `WorkPage` composition — part 2.
- Song builder / Audition, Chat + slash commands, Splits tab, Todos tab — each already
  has its own todo.

## Git hygiene (a parallel session is editing this tree)

At plan start: **10 modified tracked files, 8 untracked**, none under
`components/catalogue/`. Do not stage, revert or stash any of them.
**Never `git add -A`.** Stage only the explicit paths named in each task.
Re-verify both counts before the PR — they must be unchanged.
</context>

<source_audit>

| Source | Item | Coverage |
|---|---|---|
| GOAL | Restyle work header to bench | COVERED — Task 2 |
| GOAL | Restyle collaborator avatar row to bench | COVERED — Task 3 |
| GOAL | Restyle hygiene nudge card to bench | COVERED — Task 1 |
| CONTEXT | Visual only; no IA / props / data change | COVERED — `<context>` Hard stops; asserted per task |
| CONTEXT | Preserve GuidingLine's single-step contract + type-level test | COVERED — Task 1 (test retained verbatim, re-asserted) |
| CONTEXT | Use locked palette tokens; no raw dark hex | COVERED — `<context>` palette trap; negative grep in every task |
| CONTEXT | No jsdom — plan tests the harness can run | COVERED — static markup + type-level only, per task |
| CONTEXT | Provenance row cut, captured as a todo | COVERED — Task 1 |
| CONTEXT | Full Verification Gate incl. `npm run audit:gate`; no `npm run build` | COVERED — Task 3 |
| CONTEXT | PR against main with the six required disclosures | COVERED — Task 3 |
| CONTEXT | Stage only this task's files; never `git add -A` | COVERED — every task's action |

No gaps.
</source_audit>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Before-state verdict, GuidingLine gradient-budget restyle, provenance todo</name>
  <files>
    components/catalogue/GuidingLine.tsx,
    components/catalogue/GuidingLine.test.tsx,
    .planning/todos/pending/2026-10-04-work-page-provenance-row.md
  </files>
  <behavior>
    - Static markup: the rendered guiding line contains no opaque two-stop brand gradient (the full-saturation `from-`/`to-` pair with no opacity modifier), while the container's tinted wash (`/10` → `/5`) is still present.
    - Static markup: the lamp, headline, action label and dismiss ✕ all still render.
    - Static markup: a null step still renders the empty string — not an empty container.
    - Static markup: no raw hex literal, and no retired-lavender `rgba(199,203,247` literal.
    - Type-level: `GuidingLineProps['step']` still refuses an array (the existing `@ts-expect-error` assertion compiles only while the contract holds).
  </behavior>
  <action>
**Step A — record the before-state verdict (do this first, it feeds the PR body).**

The bench is already served and reachable (`curl -s -o /dev/null -w "%{http_code}"
http://127.0.0.1:4321/index.html` → `200`). View it over **HTTP**, never as a `file://`
URL — a `data:`/`file:` load has no base, every relative image breaks, and the bench
looks like a regression it is not.

Then attempt the shipped Writer's Room at `http://localhost:3000/vault/works/[workId]`
(dev server is live on :3000). It is behind auth. If you cannot authenticate, **say so
plainly** — do not claim a comparison you did not make. Record one line, verbatim, which
Task 3 copies into the PR body:

- `BEFORE-STATE: VERIFIED — compared shipped /vault/works/<id> against the bench side by side.`
- or `BEFORE-STATE: UNVERIFIED — shipped page is behind auth and could not be reached; restyle derived from component source + bench CSS.`

Carry that line in this task's commit body.

**Step B — restyle the action button (`GuidingLine.tsx:55-61`).**

The container at `:42` already matches the bench exactly (radius 10,
`border-brandindigo/30`, `bg-gradient-to-r from-brandindigo/10 to-brandfuchsia/5`,
`px-[14px] py-[13px]`, `gap-[8px]`) — **leave it alone**. The dismiss ✕ at `:43-51` also
matches. The only delta is the button.

The shipped button paints the brand gradient at full saturation. That double-spends the
page's one gradient, which `ComposerCard.tsx:118-122` reserves by name for its own primary
action and explicitly forbids "on the composer/guiding-line row above". The bench's
`.doit` (`private/bench/index.html:544-548`) is a tinted-border secondary instead.

Replace the button's `className` with the token translation of `.doit`:

`self-start rounded-[8px] border border-brandindigo/45 bg-brandindigo/[.12] px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-brandindigo/[.22]`

(bench `border-radius:8px` → `rounded-[8px]`; `padding:6px 12px` → `py-1.5 px-3`;
`font-size:11px` → `text-[11px]`; hover `rgba(129,140,248,.22)` → `hover:bg-brandindigo/[.22]`.
Arbitrary-opacity syntax is already this repo's idiom — see `WorkHeader.tsx:29`.)

Keep the ` →` suffix on `{step.actionLabel}`. The bench's sample label simply has no
arrow; removing a shipped affordance on that evidence would be a guess, not a port.

Keep every comment in the file. Keep the props type exactly as it is — single
`GuidingLineStep | null`, never an array. Do not add a prop.

**Step C — fix a label-integrity defect in the existing test.**

`GuidingLine.test.tsx` has a case named "never spends the full bg-grad gradient — only a
border/wash tint" whose body only greps for the literal class `bg-grad`. That assertion
passed green for the entire life of a component that was painting the full gradient under
a different class name. The name claimed more than the check carried — exactly the pattern
`label-integrity-funun` is about.

Tighten it so the check matches the name: still reject the `bg-grad` utility, and
additionally reject the opaque gradient pair — a `from-brandindigo` **with no `/opacity`
modifier**. The container's `from-brandindigo/10` must still pass, so the negative lookahead
on the slash is load-bearing. Use `expect(markup).not.toMatch(/from-brandindigo(?!\/)/)`
and rename the case to state what it now actually checks.

Add two more cases to the same suite:
- the tinted wash survives: `expect(markup).toMatch(/from-brandindigo\/10/)`
- no retired-lavender literal: `expect(markup).not.toMatch(/rgba\(199,\s*203,\s*247/)`

Leave the type-level `@ts-expect-error` case byte-identical. Do not weaken it.

**Step D — capture the cut provenance row.**

Write `.planning/todos/pending/2026-10-04-work-page-provenance-row.md` recording: the bench
element (`private/bench/index.html:563-573`, `.origin`, "FROM AN IDEA"); why it was cut from
part 1 (not cosmetic — needs data); the data that exists (`lib/ideas/schema.ts:44`
`promotedWorkId`, idea state `'promoted'`, pointing idea→work); and what is missing (a
reverse lookup work→idea in the server page). Do not build it.

**Stage exactly:** `components/catalogue/GuidingLine.tsx`,
`components/catalogue/GuidingLine.test.tsx`,
`.planning/todos/pending/2026-10-04-work-page-provenance-row.md`. Never `git add -A`.
  </action>
  <verify>
    <automated>npx jest components/catalogue/GuidingLine.test.tsx --runInBand && grep -c 'from-brandindigo to-brandfuchsia' components/catalogue/GuidingLine.tsx | grep -qx 0 && grep -q 'from-brandindigo/10' components/catalogue/GuidingLine.tsx && grep -q '@ts-expect-error' components/catalogue/GuidingLine.test.tsx && test -f .planning/todos/pending/2026-10-04-work-page-provenance-row.md</automated>
  </verify>
  <done>
`GuidingLine.tsx` paints no opaque brand gradient; the tinted container wash is intact; the
button is the bench's tinted-border secondary; the single-step contract and its type-level
assertion are unchanged; the gradient-budget test now checks what its name claims; the
provenance todo exists; the before-state verdict line is recorded in the commit body.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WorkHeader — bench title row, room-tag pill, chip treatment</name>
  <files>components/catalogue/WorkHeader.tsx, components/catalogue/WorkHeader.test.tsx</files>
  <behavior>
    - Static markup: the "Unreleased work" label renders as an inline pill carrying the brandindigo border/background/text classes, not as a dim stacked eyebrow.
    - Static markup: the title input still carries `aria-label="Song title"` and the current value, and now renders at the bench's 21px/bold/negative-tracking size.
    - Static markup: the splits chip still reads `Splits: <word>` with no `%` anywhere, and uses the money/money2 tokens with a hairline-ish border.
    - Static markup: no `amber-` class remains; no retired-lavender `rgba(199,203,247` literal.
    - Static markup: the reserved right-hand slot is still `aria-hidden` and still carries no chip text.
  </behavior>
  <action>
Three deltas against the bench. Nothing else in this file changes — the vocal-state
control, the three state lines, `LearnWhy`, both mutations, and every comment stay as they
are. Do not add a prop. Do not fill the reserved right-hand slot at `:274-278`.

**1. Title row (bench `.titlerow` + `.wh h2`, `private/bench/index.html:493-494, :54`).**

Today the eyebrow `<p>` sits above the title input. The bench puts the label **beside** the
title as a pill. Replace the eyebrow `<p>` and the bare input with a flex title row:

- wrapper: `mt-0.5 flex flex-wrap items-center gap-[11px]`
- the input keeps everything it has except `w-full` → `min-w-0 flex-1`, and its type scale
  changes from `text-[22px] font-extrabold leading-tight` to
  `text-[21px] font-bold leading-tight tracking-[-0.015em]` (bench: 21px / 700 / `-.015em`).
  Keep `border-b border-transparent bg-transparent text-white outline-none transition
  focus:border-hairstrong disabled:cursor-default` and the `mt-0.5` moves to the wrapper.
- the pill (bench `.roomtag`, `:494-497`):
  `inline-flex shrink-0 whitespace-nowrap rounded-full border border-brandindigo/30 bg-brandindigo/[.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-brandindigo`
  (bench `padding:4px 10px` → `py-1 px-2.5`; `letter-spacing:.08em` → `tracking-[0.08em]`).

**Keep the copy "Unreleased work".** The bench's mock says "Writer's Room"; those are
different claims and swapping them is a copy change, not a restyle. Note it in the PR body.

**2. Chip treatment (bench `.chip`, `private/bench/index.html:56-57`).**

Bench chips are 10px / 700 / `padding:4px 9px` / `border-radius:999px` / `border:1px solid`
— the shipped chips are 11px / 600 and borderless. Update `CHIP_CLASS` (`:28-29`) to:

`inline-flex items-center gap-1 rounded-full border border-hair bg-lav/[.08] px-[9px] py-1 text-[10px] font-bold text-lav`

The bench's bare `.chip` leaves `border-color` at `currentColor`, which on an identity chip
would be a full-strength text-coloured outline — too loud and not what the bench renders.
Use the surface hairline (`border-hair`) for the neutral identity chips. The `.ok`/`.warn`
variants below do specify their own border colours and are ported literally.

**3. Splits chip (bench `.chip.warn`, `private/bench/index.html:59`).**

`CHIP_SPLITS_CLASS` (`:30-31`) uses raw Tailwind amber classes. The bench's warn chip maps
onto this project's own tokens: `rgba(245,158,11,.1)` is `money` at 10%,
`rgba(245,158,11,.3)` is `money` at 30%, and `var(--amber-2)` `#f4c77b` **is** `money2`
(`tailwind.config.ts:22`). Replace with:

`inline-flex items-center gap-1 rounded-full border border-money/30 bg-money/10 px-[9px] py-1 text-[10px] font-bold text-money2`

Leave `splitsStatus`'s doc comment and the "state word, never a percentage" guarantee
exactly as written — this chip renders a word and nothing else, forever.

**Tests (`WorkHeader.test.tsx`).** Keep every existing case. Add, as static markup
assertions (no jsdom — `renderToStaticMarkup` only):
- the label renders as the pill: markup contains `Unreleased work` **and** `text-brandindigo`
- the splits chip is on project tokens: markup contains `text-money2`, and
  `expect(markup).not.toMatch(/amber-/)`
- no retired-lavender literal: `expect(markup).not.toMatch(/rgba\(199,\s*203,\s*247/)`
- the reserved slot stays empty: markup contains `aria-hidden="true"` and
  `expect(markup).not.toContain('Lead vocal set')`

**Stage exactly:** `components/catalogue/WorkHeader.tsx`,
`components/catalogue/WorkHeader.test.tsx`. Never `git add -A`.
  </action>
  <verify>
    <automated>npx jest components/catalogue/WorkHeader.test.tsx --runInBand && grep -v '^\s*//' components/catalogue/WorkHeader.tsx | grep -c 'amber-' | grep -qx 0 && grep -q 'text-brandindigo' components/catalogue/WorkHeader.tsx && grep -q 'text-money2' components/catalogue/WorkHeader.tsx && grep -q 'Unreleased work' components/catalogue/WorkHeader.tsx && grep -q 'aria-label="Song title"' components/catalogue/WorkHeader.tsx</automated>
  </verify>
  <done>
The header renders a 21px bold title with the uppercase indigo "Unreleased work" pill
beside it; chips carry the bench's 10px/700/bordered treatment; the splits chip is on
`money`/`money2` with no raw amber class left; the right-hand slot is still reserved and
empty; no prop changed; `WorkHeader.test.tsx` passes with the new assertions.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: WorkRoster avatar + chip treatment, full Verification Gate, PR</name>
  <files>components/catalogue/WorkRoster.tsx, components/catalogue/WorkRoster.test.tsx</files>
  <behavior>
    - Static markup: a member row renders a 34px avatar with the bench's lav/10 wash and 11px initials.
    - Static markup: a pending member's avatar carries the dimmed/grayscale treatment, and the pending chip uses the money/money2 tokens.
    - Static markup: split-sheet chips carry the same bordered 10px/700 treatment as the header's.
    - Static markup: every per-row affordance still renders — the ✍/🎤 badges, the promote button for a manageable non-owner non-writer, and the designation picker entry point.
    - Static markup: no `amber-` class remains; no retired-lavender `rgba(199,203,247` literal.
  </behavior>
  <action>
**Scope note, read before starting.** The bench does **not** re-create `WorkRoster`. Its
roster surface (`private/bench/index.html:1193-1202`, `.msrow` at `:198-215`) is a
toggle-to-select member picker — a different interaction with no promote button, no
designation picker and no tier labels. Converting the shipped list into it would delete
per-row affordances, which is IA, not styling. **Do not do it.** What ports cleanly is the
bench's *in-list* row vocabulary (`.mrow`, `.mrow .mface`, `.mrow .n1`,
`private/bench/index.html:245-258`) and the chip treatment from Task 2.

Four deltas. The accordion structure, the three section toggles, the two-groupings
separation (PITFALL 3), the add form and every comment stay exactly as they are.

**1. Member avatar (`WorkRoster.tsx:396-403`).** Bench `.mrow .mface` is 34px with an 11px
label over a `card` + 10% lav wash; the shipped span is 28px over `bg-lav/[.14]`. Change
`grid h-7 w-7` → `grid h-[34px] w-[34px]`, `bg-lav/[.14]` → `bg-lav/10`, `text-[10px]` →
`text-[11px]`. Keep `flex-none place-items-center overflow-hidden rounded-full bg-cover
bg-center font-bold text-lav`, keep the `backgroundImage` inline style, keep
`aria-hidden="true"` and the initials fallback.

**2. Pending state as a visual encoding (bench `.mrow[data-on="0"] .mface`, `:256`).** The
bench dims and desaturates a face that is not active. `member.isPending` is an existing
boolean already rendered as a chip — encoding it on the avatar too adds no information.
Append `member.isPending ? ' opacity-55 grayscale' : ''` to the avatar's class list.

**3. Pending chip (`WorkRoster.tsx:428`).** Same `.chip.warn` port as Task 2:
`rounded-full border border-money/30 bg-money/10 px-2 py-0.5 text-[10px] font-bold text-money2`.
Keep the copy "Pending — hasn't signed up yet" and its five-line explanatory comment.

**4. Split-sheet chips (`WorkRoster.tsx:473-476`) and row hover.**
- chips → `inline-flex items-center gap-1.5 rounded-full border border-hair bg-lav/[.08] px-[9px] py-1 text-[10px] font-bold text-lav`, matching Task 2's `CHIP_CLASS`. Keep the
  nested designation sub-span (`font-medium text-lavdim`) and its `·` separator — that is
  the DDEX/PRO designation label and must stay legible.
- the member `<li>` (`:394`) gains the bench's row hover: append
  `transition-colors hover:bg-lav/[.06]` (bench `.mrow:hover`, `:247`). Keep
  `bg-card2`, `border-hair`, `rounded-[9px]`, `px-3 py-2` — those already match.

Leave `bg-grad`/`shadow-cta` on the add-form submit buttons (`:575`, `:687`) alone. They
live inside a collapsed section and are outside this restyle.

**Tests (`WorkRoster.test.tsx`).** Keep every existing case. Add static-markup assertions:
- the pending chip is on project tokens: markup contains `text-money2`, and
  `expect(markup).not.toMatch(/amber-/)`
- a pending member's avatar is dimmed: markup contains `opacity-55`
- no retired-lavender literal: `expect(markup).not.toMatch(/rgba\(199,\s*203,\s*247/)`
- **non-vacuity / no-IA-loss guard:** render a manageable non-owner, non-writer member and
  assert the promote affordance still renders, so a future "simplification" of this list
  cannot pass green. Reuse whatever prop fixture the existing suite already uses rather
  than inventing a new shape.

**5. Full Verification Gate.** Run every step CI's `validate` job runs — a weaker gate has
already let a real defect through six consecutive waves here. **Do not run `npm run build`**
(dev server is live on :3000 and a build clobbers `.next`; it is also not part of validate):

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm run audit:gate
```

All five must pass. `lint` runs with `--max-warnings=0`, so any warning is a failure.

**6. PR.** First re-verify the parallel session's working tree is untouched:
`git status --porcelain | grep -v '^??' | wc -l` must still be **10** and
`git status --porcelain | grep '^??' | wc -l` must still be **8** (excluding this task's own
staged files). If either moved, stop and report — do not stage anything you did not change.

Stage exactly `components/catalogue/WorkRoster.tsx` and
`components/catalogue/WorkRoster.test.tsx`. Never `git add -A`. Push
`writers-room-restyle-part1` and open a PR against `main` whose body states, as six
explicit points:

1. This is **part 1 of a deliberate split**.
2. **Part 2 — tabs vs the interleaved canvas — is an open design question that reverses an
   owner-ratified Phase 37 decision** (sketch decision 001, ratified 2026-08-30: C desktop /
   A mobile, "the diary is the canvas"). The bench demotes Lyrics to one of seven peer tabs;
   `LyricsPad.tsx:101-102` documents the shipped interleaved model. It is excluded on purpose
   and must be decided on its own.
3. The three restyled components and what changed in each — including that
   `GuidingLine`'s button was **double-spending the page's one gradient**, against the rule
   stated in its own header comment and named explicitly in `ComposerCard.tsx:118-122`.
4. The **provenance row ("FROM AN IDEA") was cut** because it is not cosmetic — the work has
   no reverse link to its originating idea; `lib/ideas/schema.ts:44` points idea→work only.
   Link the todo written in Task 1.
5. Whether the shipped before-state was **visually verified** — paste Task 1's
   `BEFORE-STATE:` line verbatim. If UNVERIFIED, say so plainly; do not imply a comparison
   that was not made.
6. That the bench's "Writer's Room" wording, right-hand status chips and collapsed `.meta`
   identity line were **not** adopted, with the one-line reason for each.
  </action>
  <verify>
    <automated>npx jest components/catalogue/WorkRoster.test.tsx --runInBand && grep -v '^\s*//' components/catalogue/WorkRoster.tsx | grep -c 'amber-' | grep -qx 0 && grep -q 'text-money2' components/catalogue/WorkRoster.tsx && grep -q 'h-\[34px\]' components/catalogue/WorkRoster.tsx && grep -q 'opacity-55' components/catalogue/WorkRoster.tsx && npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm run audit:gate</automated>
    <human-check>Serve the bench over HTTP at http://127.0.0.1:4321/index.html (never file://) and put it beside the shipped Writer's Room at http://localhost:3000/vault/works/&lt;id&gt;. Confirm: (a) the header reads as the bench's title row with the indigo pill beside the title; (b) the guiding-line card's button is a tinted-border secondary and the page's only full gradient is ComposerCard's primary action; (c) the roster's member rows and chips match the bench's weight and colour; (d) nothing about the tab/module arrangement moved.</human-check>
  </verify>
  <done>
`WorkRoster`'s avatars, pending state, chips and row hover match the bench's row vocabulary
with no per-row affordance removed and no toggle-selector conversion; all five Verification
Gate commands pass; the parallel session's 10 modified / 8 untracked files are unchanged;
the PR is open against `main` carrying all six required disclosures.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| none crossed | Presentational-class changes only. No network call, no route, no query, no auth path, no user input handling, and no prop is added, removed or retyped. The two existing `fetch` calls in `WorkHeader.tsx` are untouched. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-261004-01 | Information Disclosure | `WorkHeader` splits chip | low | mitigate | CAT-Q1a forbids a percentage beside a name. The existing `not.toContain('%')` assertion is retained unchanged and the `splitsStatus` doc comment stays verbatim. |
| T-261004-02 | Tampering | `GuidingLine` single-step contract | medium | mitigate | The `@ts-expect-error` type-level assertion is kept byte-identical; Task 1's grep gate fails if it is removed. A restyle that made the card look stackable is a regression even with nothing stacked today. |
| T-261004-03 | Tampering | `WorkRoster` per-row affordances | medium | mitigate | Task 3 adds a non-vacuity assertion that the promote affordance still renders, and the action explicitly forbids the `.msrow` selector conversion. |
| T-261004-04 | Tampering | parallel session's working tree | high | mitigate | Explicit-path staging only in every task; `git add -A` forbidden; Task 3 re-verifies the 10/8 counts before the PR. |
| T-261004-SC | Tampering | npm/pip/cargo installs | n/a | accept | No dependency is added or changed by this plan. No package-manager install task exists, so the Package Legitimacy Gate does not apply. |
</threat_model>

<verification>
- All five CI `validate` commands pass (`security:migrations:verify`, `typecheck:strict`,
  `lint` at `--max-warnings=0`, `test -- --runInBand`, `audit:gate`). `npm run build` is
  **not** run.
- `__tests__/palette-single-source.test.ts` passes — no new dark blue-dominant literal was
  introduced (it is a rule, not a list).
- `git diff --stat main...HEAD` touches only the six `components/catalogue/` files and the
  one `.planning/todos/pending/` file.
- `grep -rn "roomModules" components/catalogue/LyricsPad.tsx components/catalogue/WorkPage.tsx`
  is unchanged from `main`; neither file appears in the diff.
- No component's exported props type changed: `git diff main...HEAD -- components/catalogue/`
  contains no change inside a `export type *Props = {` block.
</verification>

<success_criteria>
- Three components restyled to the bench, expressed entirely in `tailwind.config.ts` token
  names — zero bench CSS literals ported.
- The page's single gradient spend is back on `ComposerCard`'s primary action, satisfying
  the rule both `GuidingLine.tsx:23-28` and `ComposerCard.tsx:118-122` already state.
- `GuidingLine`'s single-step contract and type-level assertion survive intact.
- No IA change: no prop, no data, no tab/module/`LyricsPad`/`WorkPage` structural edit, and
  no per-row affordance removed from `WorkRoster`.
- Full Verification Gate green; parallel session's 10 modified / 8 untracked files unchanged.
- PR open against `main` carrying all six required disclosures, including an honest
  VERIFIED/UNVERIFIED verdict on the shipped before-state.
</success_criteria>

<output>
Quick-mode record is handled by `/gsd-quick`. No SUMMARY.md is required for this plan.
</output>

