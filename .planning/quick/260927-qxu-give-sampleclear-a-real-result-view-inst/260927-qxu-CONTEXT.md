# Quick Task 260927-qxu: A real result view for SampleClear - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Task Boundary

SampleClear is **already shipped and already reachable**. Do not build a page, a route,
or a registry entry. The gap is that its structured output renders through a generic
field renderer, so the two clearance letters it drafts cannot be copied and the risk
level gets no treatment.

Give it a dedicated result view, mirroring the `splitsheet` precedent that already
exists in the same file.

</domain>

<decisions>
## Implementation Decisions

### The path that already works (verified, do not re-litigate)

1. `lib/vault/stage3.ts:267-289` — for **any track with `has_sample`**, Stage 3 pushes a
   requirement `{ tool: 'sampleclear', title: 'Sample clearance', severity: 'required',
   scope: 'track', prefill: { song_name, sample_details } }`.
2. `components/vault/DocumentStage.tsx:128` renders every required requirement.
3. Selecting one opens `components/vault/ToolSidePanel.tsx`.
4. Generate posts to `app/api/vault/[projectId]/documents/generate/route.ts`, whose
   `VALID_TOOLS` already contains `'sampleclear'` (route.ts:13-19).
5. `lib/tools/documents.ts:56` dispatches to `buildSampleClearPrompt`.
6. The result is persisted and rendered by `JsonOutput` in `ToolSidePanel.tsx:379`.

**Step 6 is the only thing this task changes.**

### The precedent to follow

`ToolSidePanel.tsx:159-178` special-cases exactly one tool:

```
req.tool === 'splitsheet' ? (output ? <SplitSheetResult …/> : <SplitSheetForm …/>)
                          : (output ? <JsonOutput …/> : <generic blurb>)
```

Add a `sampleclear` branch for the **output** side only. Do **not** add a bespoke input
form — the prefill (`song_name`, `sample_details`) already comes from the track, and the
generic pre-generate blurb is fine. Keep `JsonOutput` as the fallback for `hireright`,
`copyrightkit` and `contentid`; this task does not touch those.

### The output contract (from `lib/tools/sampleclear.ts:7-15`)

```ts
type SampleClearOutput = {
  assessment: string
  master_rights: { likely_holder: string; how_to_contact: string }
  publishing_rights: { likely_holder: string; how_to_contact: string }
  master_request_letter: string
  publishing_request_letter: string
  alternatives: string[]
  risk_level: 'low' | 'medium' | 'high'
}
```

The API returns `Record<string, unknown>`. **Read it defensively** — this is model
output, so any field may be missing or the wrong shape. Follow the repo convention in
`lib/metadata/schema.ts` (`readComposers` / `readLyrics`): type-guard each field,
coerce, and render only what is actually present. A missing letter must degrade to
"not drafted", never to a crash or the string "undefined". Falling back to `JsonOutput`
for an unrecognisable payload is acceptable and preferable to rendering nothing.

### What the view must show

Designed on the bench at `private/bench/shot-sampleclear.html` (gitignored; read it for
the layout, do not import from it):

1. **Risk chip** — `risk_level` as a coloured pill. Use the existing gate-chip colours
   from `components/antenna/OpportunityCard.tsx:8-12`: low = emerald, medium = amber
   (`text-money2 bg-money/10 border-money/30`), high = rose. Do not invent new colours.
2. **`assessment`** as body copy.
3. **Two owner blocks, visually parallel and clearly separate** — "Master — the
   recording" and "Publishing — the composition", each with `likely_holder` and
   `how_to_contact`. Their separateness IS the product's point; do not merge or nest
   them.
4. **The two letters, each individually copyable.** This is the single most important
   addition — a drafted letter you cannot copy is not a drafted letter. Reuse the
   existing copy affordance pattern rather than inventing one; `components/tools/
   PitchCard.tsx` has a `CopyButton` worth reading first (do not import across that
   boundary if it is not exported — replicate the pattern).
5. **`alternatives`** as a list, introduced as what to do if clearance is refused.
6. A line making the limit explicit: **we help you clear it, we cannot clear it for
   you.** Owner instruction 2026-09-26: say "help", never "clear". Some samples never
   clear.

### Wording that is NOT negotiable

`lib/tools/sampleclear.ts:47` instructs the model: *"Do not fabricate specific company
names, contacts, or fees as if confirmed — frame likely holders as 'likely'."* The view
must not undercut that. Label the holders as **likely** and keep a visible "verify
before sending" cue. Never render a holder as a confirmed counterparty.

### Styling

Neutral-black tokens, already on `main` as of `1728a221` — `bg-card`, `bg-card2`,
`border-hair`, `border-hairstrong`, `text-lav`, `text-lavdim`. **No literal palette
hexes and no `rgba(199,203,247,…)`** — `__tests__/palette-single-source.test.ts` guards
both and will fail the build.

</decisions>

<specifics>
## Specific Ideas

**Branch:** create `sampleclear-result-view` off `origin/main` fresh. NOTE: another
quick task (`neutral-lavender-washes`, 260927-qka) may still be in flight in this
checkout — confirm the working tree is clean and on the right branch before starting.

**Tests.** `ToolSidePanel` is a client component and this repo has **no jsdom**, so
component tests cannot observe interaction state (see
`reference_jest_harness_constraints`). Do not write a test that pretends to. Test the
**pure parsing/normalising helper** instead — extract the "read the model's payload into
a typed shape" logic as an exported pure function and unit-test it hard: missing fields,
wrong types, empty strings, a totally unexpected payload. That is the part that can
actually break, and it is testable without a DOM.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

Do NOT run `npm run build` (live dev server on :3000). `main` is protected — ship
through a PR. Never `git add -A`.

**PR body must state:** that SampleClear was already reachable and this changes only how
its output renders; that `JsonOutput` stays the fallback for the other three tools; the
defensive-parsing approach and why (model output); and that the "likely / verify before
sending" framing is required by the prompt, not decoration.

</specifics>

<canonical_refs>
## Canonical References

- `lib/tools/sampleclear.ts` — the output contract and the "likely, not confirmed" rule
- `components/vault/ToolSidePanel.tsx:159-178, 379-397` — the branch to extend and the
  `JsonOutput` fallback
- `components/vault/DocumentStage.tsx:128` — what renders the requirement
- `lib/vault/stage3.ts:267-289` — where the requirement is created
- `app/api/vault/[projectId]/documents/generate/route.ts:13-19` — `VALID_TOOLS`
- `components/antenna/OpportunityCard.tsx:8-12` — the chip colours to reuse
- `lib/metadata/schema.ts` — the defensive-read convention
- `private/bench/shot-sampleclear.html` — the design (gitignored)
- `__tests__/palette-single-source.test.ts` — will fail on any retired palette literal

</canonical_refs>
