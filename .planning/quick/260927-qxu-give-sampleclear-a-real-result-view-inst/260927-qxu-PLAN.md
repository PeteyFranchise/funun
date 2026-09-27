---
phase: 260927-qxu
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [QXU-01, QXU-02, QXU-03, QXU-04]
files_modified:
  - lib/tools/sampleclear.ts
  - __tests__/sampleclear-output-parse.test.ts
  - components/vault/ToolSidePanel.tsx

must_haves:
  truths:
    - A generated sample-clearance result renders as a dedicated view — risk chip, assessment, two visually separate owner blocks, two individually copyable letters, alternatives, and the "we help, we cannot clear" limit line — instead of the generic field renderer (QXU-02).
    - Each of the two drafted letters has its own copy control; copying one does not copy the other (QXU-02).
    - Every rights holder renders as a *likely* lead with a visible verify-before-sending cue. No holder renders as a confirmed counterparty (QXU-02).
    - A payload with missing, empty or wrong-typed fields degrades to an omitted section or an explicit "not drafted", never to a thrown error and never to the literal text of an undefined value (QXU-01).
    - An unrecognisable payload falls back to the existing generic renderer rather than rendering an empty panel (QXU-01, QXU-03).
    - The "letter drafted" affordance is true of the data — shown only when a non-empty letter string is actually present, never merely because a response arrived (QXU-02).
    - The other three AI tools still render through the generic renderer; exactly one generic call site survives and the split-sheet arm is byte-unchanged (QXU-03).
    - The parsing logic is an exported pure function unit-tested against missing fields, wrong types, empty strings, an unrecognisable payload, and a full-coverage sentinel payload that would catch a mistyped key (QXU-01).
    - The full CI validate job passes on the branch tip and `npm run build` was never run (QXU-04).
  artifacts:
    - lib/tools/sampleclear.ts — `SampleClearView` type and exported pure `readSampleClearOutput`
    - __tests__/sampleclear-output-parse.test.ts — the unit suite, including a non-vacuity field-coverage test
    - components/vault/ToolSidePanel.tsx — `SampleClearResult`, a local copy control, and one new branch arm
  key_links:
    - "`readSampleClearOutput` returning null is the ONLY path to the generic fallback. If it never returns null the fallback is dead code; if it returns null too eagerly the new view never renders. Both directions must be tested."
    - "The letter-drafted pill is a label. Drive it from the parsed letter being non-null, not from a response having arrived — an unconditional pill is the `owner_segment` failure shape: a name nothing checks."
    - "GATE_CHIP at components/antenna/OpportunityCard.tsx:8-12 has exactly three rows (`qualifies`/`almost`/`locked`) and NONE is rose. low and medium are verbatim copies; high is an extrapolation of the same class shape onto rose-400."
    - "The copy control in components/tools/PitchCard.tsx:8 is NOT exported. Replicate the pattern locally in ToolSidePanel; do not add an export to PitchCard."
    - "The non-splitsheet footer (ToolSidePanel.tsx:227-242) already renders Regenerate + Done when output exists. It needs no change for this tool."
    - "__tests__/palette-single-source.test.ts scans RAW text including comments, so a retired colour literal named in a code comment fails the same gate the code does."
---

<objective>
SampleClear already runs end to end: Stage 3 raises the requirement, the panel opens, the
route generates, the result persists. The last hop renders it through the generic field
renderer, so the two clearance letters it drafts cannot be copied and the risk level gets
no treatment. A drafted letter you cannot copy is not a drafted letter.

Purpose: give the tool's output a dedicated view that makes the two letters usable and
keeps the prompt's "likely, not confirmed" framing structural rather than decorative.

Output: an exported pure parser with a real unit suite, a `SampleClearResult` view in the
panel, and one new branch arm. No new page, route, nav entry or registry entry — the tool
is already reachable.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260927-qxu-give-sampleclear-a-real-result-view-inst/260927-qxu-CONTEXT.md
@.claude/CLAUDE.md
@lib/tools/sampleclear.ts
@components/vault/ToolSidePanel.tsx
</context>

<preflight>
## Claim verification — every CONTEXT assertion read against source today

The CONTEXT's line numbers were gathered quickly. They were re-measured against the tree
at `origin/main` = `1728a221`. **The reachability chain holds exactly as described.** Six
claims carry drift or error; three matter.

### Correct, exact

| Claim | Verified |
|---|---|
| `VALID_TOOLS` contains the slug, route.ts:13-19 | exact |
| `lib/tools/documents.ts:56` dispatches to the prompt builder | exact (case at :55, call at :56) |
| Output contract at `lib/tools/sampleclear.ts:7-15` | exact, all seven fields as quoted |
| `components/vault/DocumentStage.tsx:128` renders each required requirement | correct (`<DocumentCard` inside `required.map`) |
| Neutral tokens on main at `1728a221` | correct — `origin/main` **is** `1728a221`; tailwind.config.ts:13-23 |
| The copy control in PitchCard.tsx:8 is not exported | correct — `function CopyButton(`, no `export` |
| No jsdom | correct — jest.config.js sets a node test environment |

### Drift (harmless, but do not trust the numbers)

- **`lib/vault/stage3.ts:267-289`** → the block is actually **266-286**. Contents exactly
  as described, including `prefill: { song_name, sample_details }` at :285.
- **`ToolSidePanel.tsx:159-178`** → the split-sheet branch spans **159-179**. Shape is
  exactly the ternary quoted in the CONTEXT.
- **`JsonOutput` at ToolSidePanel.tsx:379** → :379 is its *definition*. The **edit point is
  the call site at line 172**.

### Wrong — three findings

1. **`lib/tools/sampleclear.ts:47` is the wrong line.** The "do not fabricate … frame
   likely holders as likely" instruction is at **line 44**, inside the long prose
   paragraph. Line 47 is the `{` opening the JSON shape example. The *instruction text*
   the CONTEXT quotes is verbatim correct; only the citation moved.

2. **"high = rose" cannot be copied from `OpportunityCard.tsx:8-12`.** That map has
   exactly three rows and none of them is rose:
   - `qualifies: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'`
   - `almost: 'text-money2 bg-money/10 border-money/30'`  ← the amber the CONTEXT quotes, exact
   - `locked: 'text-lavdim bg-white/[.04] border-hairstrong'`

   So `low` and `medium` are verbatim copies; **`high` is an extrapolation**, not a reuse.
   The nearest in-repo rose idiom is ToolSidePanel.tsx:182. This plan extrapolates the
   `GATE_CHIP` class *shape* onto rose-400 so the three chips are structurally identical.
   Task 2 states the resulting string; do not invent a different one.

3. **The styling instruction does not match the file it lands in.** `ToolSidePanel.tsx`
   uses **none** of `bg-card` / `bg-card2` / `border-hair` / `border-hairstrong` /
   `text-lav` / `text-lavdim`. All 465 lines are written in `bg-ink` / `border-white/10` /
   `text-white/40` / `bg-white/[0.03]`. Nothing breaks — the tokens are legal and nearly
   identical in value (`hair` is white at .08 against the file's `border-white/10`) — but
   the new block will read in a different idiom from its neighbours. **Resolution: follow
   the locked brief and use the tokens for the new component only.** Do not repaint the
   surrounding file; Task 2 carries a diff-size gate that enforces this.

### Working-tree state — checked, and better than the CONTEXT feared

The checkout is **on branch `neutral-lavender-washes`** (the 260927-qka quick task), two
commits ahead of `origin/main`, with four untracked planning paths. Tracked tree is clean.

**There is no file conflict.** qka's `files_modified` does not include
`components/vault/ToolSidePanel.tsx` or `lib/tools/sampleclear.ts`. It does touch
`components/antenna/OpportunityCard.tsx`, but only line 36 (a conic-gradient) — `GATE_CHIP`
at 8-12 is untouched, so the chip strings read above are stable. Branching off
`origin/main` is safe.

### One thing the CONTEXT does not say, that the bench implies

`private/bench/shot-sampleclear.html` exists (read it — it is a 1120×700 three-column
marketing shot, **not** a panel layout; the panel is `max-w-md`, so only the content model
and the wording transfer, not the grid). It shows a **"Letter drafted"** pill on each owner
card. Rendered unconditionally that pill is a label asserting more than the data carries —
the same shape as `owner_segment` and the document status `'signed'`. It is therefore a
must-have below that the pill is driven by the parsed letter actually being non-empty.
</preflight>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Branch off origin/main, then add the exported pure parser and its unit suite</name>
  <files>lib/tools/sampleclear.ts, __tests__/sampleclear-output-parse.test.ts</files>
  <behavior>
Write `__tests__/sampleclear-output-parse.test.ts` FIRST and watch it fail. The parser is
the only part of this task that can actually break, and it is the only part testable
without a DOM. Cover at minimum:

- **Full valid payload** → every field present and trimmed; the risk level survives.
- **Non-vacuity / field coverage.** Build a payload whose seven fields carry seven
  *distinct sentinel strings*, then assert each sentinel appears in the parsed result.
  This is the test that catches a mistyped key name — without it, a single character
  typo silently renders a real letter as "not drafted" and every other test still passes.
- **Empty object** → the function returns null (unrecognisable).
- **Non-object inputs** — null, undefined, a string, a number, an array → null each.
- **All-wrong types** — a number where the assessment goes, a bare string where a rights
  object goes, a string where the alternatives array goes, a number for the risk level →
  null, because nothing usable survived.
- **Whitespace-only strings** are absent, not present: a payload whose only field is an
  assessment of spaces returns null.
- **Partial payload** — only one letter present → a result is returned, that letter is
  present, and every other field is null or an empty array. This is the direction that
  proves the fallback is not swallowing usable output.
- **Half-filled rights object** — a holder with no contact → holder present, contact null.
  A rights value of null → both null, no throw.
- **Alternatives hygiene** — a mixed array containing a good string, an empty string, a
  whitespace string and a non-string → only the real strings survive, trimmed, in order.
- **Risk level normalisation** — an upper-case value with surrounding whitespace maps to
  its lower-case member; a value outside the three members maps to null rather than being
  passed through. A null risk level must NOT become a default; the view omits the chip.
  </behavior>
  <action>
**Step 0 — branch hygiene, before touching anything.** This checkout is currently on the
260927-qka branch with untracked planning files present. Confirm `git status --porcelain`
shows no *tracked* modifications, `git fetch origin`, then create the branch fresh:
`git checkout -b sampleclear-result-view origin/main`. Confirm HEAD resolves to the same
commit as `origin/main`. The untracked planning paths will follow across the switch; that
is expected and harmless. **Never `git add -A`** — parallel sessions leave files in this
tree, and this branch must contain only the three files named above.

**Step 1 — write the failing test**, per `<behavior>`. Put it at
`__tests__/sampleclear-output-parse.test.ts`, matching the repo's kebab-case convention
in that directory. Import the parser by its `@/lib/tools/sampleclear` path alias.

**Step 2 — add the parser to `lib/tools/sampleclear.ts`**, below the existing output type.
Export a view type and a pure reader function. Signature:
`readSampleClearOutput(raw: unknown): SampleClearView | null`.

The view type is the *rendered* shape, deliberately weaker than the wire type: every
string slot is nullable, the two rights blocks each have two nullable slots, the
alternatives slot is a plain string array (empty, never null), and the risk slot is the
three-member union or null. Name the two rights slots for what the panel shows rather
than echoing the wire names, so a reader of the component cannot confuse the parsed
value with the raw payload.

Follow the defensive-read convention in `lib/metadata/schema.ts` (`readComposers` at :465,
`readLyrics` at :514) exactly — this is model output, so any field may be missing or the
wrong shape:

- Reject a non-object or array input up front and return null.
- For each string slot: accept only a genuine string, trim it, and treat the empty result
  as absent. Never coerce a number or object into a string; that is how a rendered
  `[object Object]` gets shipped.
- For each rights block: if the value is not a plain object, both slots are absent. Read
  each slot with the same string rule.
- For the alternatives: accept only an array, map each entry through the same string rule,
  and drop the absent ones. A non-array yields an empty array, not null.
- For the risk slot: accept only a string; lower-case and trim it; accept it only if it is
  one of the three members. Anything else is absent. **Do not default it** — a defaulted
  risk level is a claim the data does not make, and the view omits the chip when it is
  absent.
- Finally, return null if *nothing* usable was found: no assessment, no holder, no
  contact, no letter, no alternative, no risk level. That null is the only trigger for the
  generic fallback, so it must be reachable and must not fire while any usable field
  survives.

Add a short section header comment in the file's existing dashed style explaining WHY the
reader exists — that the route returns an untyped record because it is parsed out of model
text, so the wire type is an aspiration and the reader is what makes it safe to render.
Do not name any colour value in that comment; the palette guard scans raw text including
comments.

Do not change `buildSampleClearPrompt`, `SAMPLECLEAR_META`, `SampleClearInput`, or the
existing output type. Do not touch any other tool module.

Commit the test and the parser together, staging the two paths by name.
  </action>
  <verify>
    <automated>git rev-parse --abbrev-ref HEAD | grep -qx 'sampleclear-result-view' && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" -o -n "$(git log --oneline origin/main..HEAD)" && echo "on the right branch, rooted on origin/main"</automated>
    <automated>test -z "$(git log --oneline origin/main..HEAD -- ':!lib/tools/sampleclear.ts' ':!__tests__/sampleclear-output-parse.test.ts' --name-only | grep -E '^[a-z]' || true)" && echo "no unrelated file carried onto the branch"</automated>
    <automated>npx jest __tests__/sampleclear-output-parse.test.ts --runInBand</automated>
    <automated>test "$(npx jest __tests__/sampleclear-output-parse.test.ts --runInBand 2>&1 | grep -cE 'Tests:[[:space:]]+[0-9]+ passed')" = "1" && npx jest __tests__/sampleclear-output-parse.test.ts --runInBand 2>&1 | grep -oE 'Tests:[[:space:]]+[0-9]+ passed' | grep -qE '(1[1-9]|[2-9][0-9])' && echo "suite is substantive, not a single smoke test"</automated>
    <automated>grep -c 'export function readSampleClearOutput' lib/tools/sampleclear.ts | grep -qx 1 && grep -c 'export type SampleClearView' lib/tools/sampleclear.ts | grep -qx 1</automated>
    <automated>grep -v '^\s*//' lib/tools/sampleclear.ts | grep -c 'buildSampleClearPrompt' | grep -qx 1 && echo "prompt builder untouched, still exactly one definition"</automated>
    <automated>npm run typecheck:strict</automated>
  </verify>
  <done>
The branch `sampleclear-result-view` exists off `origin/main` and carries only the two
files from this task. `readSampleClearOutput` and `SampleClearView` are exported from
`lib/tools/sampleclear.ts`. The unit suite is green with a double-digit test count and
covers all eleven behaviours listed above, including the sentinel field-coverage test that
would catch a mistyped key. Both directions of the null contract are asserted: a payload
with nothing usable returns null, and a payload with a single usable letter does not.
`typecheck:strict` passes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Render the dedicated view and wire the one new branch arm</name>
  <files>components/vault/ToolSidePanel.tsx</files>
  <action>
Everything here lands in `components/vault/ToolSidePanel.tsx`, mirroring the split-sheet
precedent that already lives in this file. Do not create a new component file, do not add
a route, and do not touch `components/tools/PitchCard.tsx`.

**A — a local copy control.** The one in `PitchCard.tsx:8` is not exported; replicate the
pattern rather than exporting it. Same behaviour: a button that writes the given text to
the clipboard, flips its label to a confirmation for about a second and a half, then
reverts. `useState` is already imported in this file. Style it to the file's existing
small-button idiom.

**B — `SampleClearResult`.** Place it immediately after `SplitSheetResult` (currently
ending at line 373) and before the generic-renderer section header. Props: the same
`{ output: Record<string, unknown> }` shape `SplitSheetResult` takes, so the two arms
read identically at the call site. It calls `readSampleClearOutput` from
`@/lib/tools/sampleclear` — this file already imports from `@/lib/tools/splitsheet`, so
importing from a sibling tool module is established and crosses no server boundary.

If the reader returns null, render the generic renderer with the raw payload. That is the
specified degradation and it must be inside this component, so the call site stays a
single clean arm.

Otherwise render, top to bottom:

1. **The risk chip** — a pill reading the level followed by the words "release risk", e.g.
   a medium level reads "Medium release risk". Class strings, and these exact strings:
   - low → `text-emerald-400 bg-emerald-400/10 border-emerald-400/30`
   - medium → `text-money2 bg-money/10 border-money/30`
   - high → `text-rose-400 bg-rose-400/10 border-rose-400/30`

   The first two are verbatim from `GATE_CHIP` (OpportunityCard.tsx:8-12). The third is
   **not** in that map — see the preflight — it is that map's class shape extrapolated
   onto rose-400 so all three chips are structurally identical. Do not substitute a
   different rose spelling. **When the level is absent, render no chip at all.** Do not
   emit a neutral "unknown" pill: that is a claim the payload did not make.

2. **The assessment** as body copy, whitespace preserved, omitted entirely when absent.

3. **Two owner blocks, visually parallel and clearly separate.** Their separateness is the
   product's whole point — do not merge them, do not nest one inside the other, and do not
   collapse them into a two-column table. Each block carries:
   - An uppercase eyebrow: `Master — the recording` / `Publishing — the composition`.
   - A drafted-state pill, aligned opposite the eyebrow. **Its text is driven by whether
     that block's letter parsed to a non-empty string** — drafted when it did, not drafted
     when it did not. It must never be shown unconditionally just because a response came
     back. A pill that says a letter exists when none does is a label asserting more than
     the data carries, which is the exact defect class this repo has already shipped twice.
   - A small label reading `Likely rights holder`, then the holder value beneath it. The
     word "likely" belongs to the view, not to the model — do not prefix the model's own
     string with it, or a holder the model already hedged reads as hedged twice. When the
     holder is absent, say it is not identified yet rather than leaving a blank slot.
   - A short cue, visible and not hover-only, stating that this is a lead to verify before
     sending and not a confirmed counterparty. This is required by the prompt at
     `lib/tools/sampleclear.ts:44`, which forbids presenting holders as confirmed. It is
     load-bearing, not decoration — do not shorten it away.
   - A `How to contact` label and value, omitted when absent.
   - The letter itself, in a scrollable pre-wrapped block, with **its own copy control**
     for that letter and no other. When the letter is absent, render the not-drafted state
     instead of an empty box.

4. **The alternatives** as a list, introduced as what to do if clearance is refused.
   Omitted entirely when the array is empty.

5. **The limit line**, last: we help you clear it, we cannot clear it for you. Owner
   instruction 2026-09-26 — the verb is "help", never "clear", because some samples never
   clear.

Render every model-supplied string as an ordinary React text child. Do not use the
raw-HTML escape hatch anywhere in this file; this is untrusted model output and React's
default escaping is the only thing standing between it and the DOM.

**C — the branch arm.** At the body ternary (currently lines 159-179), insert one new arm
for this tool ahead of the generic arm, so the chain reads: split sheet first, then this
tool when output exists, then the generic renderer when output exists, then the
pre-generate blurb. **Insert; do not restructure.** The split-sheet arm and the generic arm
must survive byte-identical, and the pre-generate blurb stays shared — the prefill already
comes from the track, so this tool gets no bespoke input form. Leave the footer alone: the
non-splitsheet footer at 227-242 already renders Regenerate and Done once output exists,
which is correct here.

**D — one stale comment.** The file header at lines 13-15 currently claims the AI tools
render a generate button and then their JSON output. That stops being true the moment this
arm lands. Correct it in place — a comment that misdescribes the code is a stale claim,
and this repo's own palette guard treats comments as claims for exactly that reason. Keep
the edit to those lines; do not rewrite the header.

**Do not repaint the file.** The new component uses the neutral tokens per the locked
brief (`bg-card`, `bg-card2`, `border-hair`, `border-hairstrong`, `text-lav`, `text-lavdim`);
the surrounding 465 lines keep their existing idiom. The removed-line gate below enforces
this: a repaint would blow past it immediately.

Stage the single path by name and commit.

<!-- planner-discipline-allow: JsonOutput -->
<!-- planner-discipline-allow: SplitSheetResult -->
<!-- planner-discipline-allow: humanize -->
<!-- planner-discipline-allow: dangerouslySetInnerHTML -->
  </action>
  <verify>
    <automated>grep -c "req.tool === 'sampleclear'" components/vault/ToolSidePanel.tsx | grep -qx 1 && echo "exactly one new branch arm"</automated>
    <automated>test "$(grep -c '<CopyButton' components/vault/ToolSidePanel.tsx)" = "2" && echo "two copy controls — one per letter, neither shared"</automated>
    <automated>test "$(grep -c '<JsonOutput' components/vault/ToolSidePanel.tsx)" = "2" && echo "generic renderer survives at the shared arm plus the unrecognisable-payload fallback"</automated>
    <automated>grep -c 'readSampleClearOutput' components/vault/ToolSidePanel.tsx | grep -qx 1</automated>
    <automated>test "$(git diff origin/main -- components/vault/ToolSidePanel.tsx | grep '^-' | grep -vc '^---')" -le 4 && echo "insert-only: at most the four header-comment lines were removed, the file was not repainted"</automated>
    <automated>test "$(git diff origin/main -- components/vault/ToolSidePanel.tsx | grep '^-' | grep -v '^---' | grep -cE 'SplitSheetResult|JsonOutput|humanize|splitsheet')" = "0" && echo "split-sheet arm and generic renderer are byte-unchanged"</automated>
    <automated>test "$(grep -c 'dangerouslySetInnerHTML' components/vault/ToolSidePanel.tsx)" = "0" && echo "model output is rendered as escaped text only"</automated>
    <automated>test "$(grep -oE 'text-(emerald-400|money2|rose-400) bg-(emerald-400|money|rose-400)/10 border-(emerald-400|money|rose-400)/30' components/vault/ToolSidePanel.tsx | sort -u | wc -l | tr -d ' ')" = "3" && echo "all three risk chips present in the GATE_CHIP class shape"</automated>
    <automated>npx jest __tests__/palette-single-source.test.ts --runInBand</automated>
    <automated>npx jest __tests__/placements-client-server-boundary.test.ts --runInBand</automated>
    <automated>npm run typecheck:strict</automated>
    <automated>npm run lint</automated>
  </verify>
  <done>
The panel renders a dedicated view for this tool: a risk chip in one of the three verified
class strings (or no chip when the level is absent), the assessment, two visually separate
owner blocks each with a data-driven drafted pill, a likely-holder label, a visible
verify-before-sending cue, a contact line and its own copy control for its own letter, then
the alternatives list and the limit line. An unrecognisable payload falls through to the
generic renderer from inside the component. Exactly one new branch arm was inserted; the
split-sheet arm, the generic arm and the footer are byte-unchanged; at most four lines were
removed from the file in total and all of them were the corrected header comment. The
palette guard, the client/server boundary guard, `typecheck:strict` and `lint` all pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run the full CI validate gate, eyeball the real panel, open the PR</name>
  <files>(no source changes — verification and PR only)</files>
  <action>
**Run every step CI's `validate` job runs**, in order, all green. A weaker gate is what let
a real defect through six consecutive waves in Phase 39 — `lint` at `--max-warnings=0` is
load-bearing, not cosmetic:

- `npm run security:migrations:verify`
- `npm run typecheck:strict`
- `npm run lint`
- `npm test -- --runInBand`
- `npm audit --omit=dev --audit-level=moderate`
- `npm audit --audit-level=high`

**Do not run `npm run build`.** It is not part of validate and there is a live dev server
whose `.next` it would clobber.

Then look at the thing. The automated gates above prove structure, not meaning — no test in
this repo can observe the rendered panel, because there is no jsdom. Open a vault project
that has a track flagged as containing a sample, open the sample-clearance requirement from
the Required section, generate, and read the result with your own eyes. Specifically check
the two failure modes the unit tests cannot reach: that neither letter renders the text of
an undefined value, and that copying one letter puts *that* letter on the clipboard and not
the other one.

Push and open a PR against `main`. `main` is protected — never push it directly.

The PR body must state all six of these, because none is recoverable from the diff:

1. That the tool was **already reachable** end to end — Stage 3 requirement, panel, route,
   persistence — and this PR changes only how its output renders. No page, route, nav entry
   or registry entry was added.
2. That the generic renderer **stays** the renderer for the other three AI tools, and is
   also the in-component fallback when the payload does not parse.
3. The defensive-parsing approach and **why**: the route returns an untyped record because
   the payload is parsed out of model text, so the declared output type is an aspiration.
   The parser is an exported pure function precisely because this repo has no jsdom and a
   component test would verify nothing.
4. That the "likely holder / verify before sending" framing is **required by the prompt**
   at `lib/tools/sampleclear.ts:44`, which forbids presenting holders as confirmed. It is a
   correctness constraint, not copy polish.
5. That the drafted-state pill is driven by the letter actually being present, and why that
   mattered enough to write down — an unconditional pill would be a label asserting more
   than the data carries, the same defect shape this repo has already shipped twice.
6. That the CONTEXT's chip-colour citation was **partly wrong**: the referenced map has no
   rose row, so the low and medium chips are verbatim reuse while the high chip is that
   map's class shape extrapolated onto rose-400. A reviewer should agree with that
   extrapolation or say so.
  </action>
  <verify>
    <automated>npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand && npm audit --omit=dev --audit-level=moderate && npm audit --audit-level=high</automated>
    <automated>test "$(git diff --name-only origin/main | sort)" = "$(printf '%s\n' __tests__/sampleclear-output-parse.test.ts components/vault/ToolSidePanel.tsx lib/tools/sampleclear.ts | sort)" && echo "branch touches exactly the three intended files"</automated>
    <automated>gh pr view --json body --jq '.body' | grep -qiE 'already reachable' && gh pr view --json body --jq '.body' | grep -qiE 'rose' && gh pr view --json body --jq '.body' | grep -qiE 'jsdom|pure function'</automated>
    <human-check>Open a vault project with a sample-flagged track, open the sample-clearance requirement, generate, and read the panel. Confirm: the risk chip matches the level the assessment describes; the two owner blocks read as separate parties, not one; each holder reads as a lead to verify, never as a confirmed counterparty; each letter's copy button puts that letter and only that letter on the clipboard; no field renders the text of an undefined value; and the limit line says we help you clear it, not that we clear it.</human-check>
  </verify>
  <done>
All six validate steps pass locally and `npm run build` was not run. The branch diff against
`origin/main` contains exactly the three intended files. The panel has been generated and
read by eye, including a real clipboard round-trip on each letter independently. A PR is
open against `main` whose body covers all six required points.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| model → rendered UI | The payload originates in Claude's text output, is loosely parsed by the generate route, persisted, and now rendered into a view the artist is expected to act on. Untrusted and unstructured in both shape and content. |
| rendered UI → artist's outbound legal correspondence | The two letters are drafted for the artist to send to a real rights holder. What this view asserts about a counterparty becomes what the artist believes. |
| rendered UI → system clipboard | Copy controls move model-authored text into the OS clipboard. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qxu-01 | Spoofing | `SampleClearResult` owner blocks | high | mitigate | A hallucinated holder rendered as a confirmed counterparty leads the artist to send a clearance request — a legal communication — to the wrong party, or to believe rights are traceable when they are not. Mitigated structurally: the word "likely" is owned by the view rather than the model, the verify-before-sending cue is always visible and never hover-only, and the holder slot renders an explicit not-identified state rather than a blank when absent. Enforced by the Task 3 human-check. |
| T-qxu-02 | Repudiation | the drafted-state pill | medium | mitigate | A pill claiming a letter exists when the field is empty is a label nothing checks — the `owner_segment` and document-status-`signed` failure shape this repo has already shipped twice. An artist who trusts it ships believing a request was drafted. Mitigated by deriving the pill from the parsed letter being non-null, called out as a must-have and re-stated in the PR body so a reviewer can see the reasoning, not just the boolean. |
| T-qxu-03 | Tampering | model strings rendered into the DOM | medium | mitigate | Model output reaching the DOM through a raw-HTML path would be a script-injection vector via prompt influence. Mitigated by rendering every string as an ordinary React text child; the Task 2 gate asserts the raw-HTML escape hatch appears zero times in the file. |
| T-qxu-04 | Denial of Service | `readSampleClearOutput` | low | mitigate | A pathological payload should not hang or throw during render. Mitigated by a flat, non-recursive parser with no unbounded loops, and by the unit suite's non-object, wrong-type and mixed-array cases. |
| T-qxu-05 | Information Disclosure | clipboard copy controls | low | accept | The copied text is the artist's own drafted letter, written to their own clipboard on their own click. No third-party data crosses. |
| T-qxu-06 | Tampering | dependencies | low | accept | No package is installed, upgraded or removed, so the package legitimacy gate does not apply. Both `npm audit` thresholds still run in Task 3 as a standing check. |
</threat_model>

<verification>
- Branch `sampleclear-result-view` created fresh off `origin/main`, carrying exactly three files.
- `readSampleClearOutput` exported and unit-tested in both null directions, with a sentinel field-coverage test that would catch a mistyped key.
- Exactly one new branch arm inserted; split-sheet arm, generic arm and footer byte-unchanged; at most four lines removed from `ToolSidePanel.tsx` in total.
- Two copy controls, one per letter.
- Three risk chips in the verified class shape; no chip when the level is absent.
- No raw-HTML escape hatch anywhere in the panel file.
- Palette guard and client/server boundary guard both green.
- Full CI validate job green; `npm run build` not run.
- Panel generated and read by eye, including an independent clipboard round-trip on each letter.
- PR open with all six required body points.
</verification>

<success_criteria>
An artist who generates a sample clearance sees the two things the generic renderer was
hiding: that there are two separate owners to chase, and that the letters to each are
drafted and copyable right now. Nothing on the screen claims a holder is confirmed, a
letter exists when it does not, or that Funūn can clear the sample for them.
</success_criteria>

<output>
Create `.planning/quick/260927-qxu-give-sampleclear-a-real-result-view-inst/260927-qxu-SUMMARY.md` when done.
</output>
