# Quick Task 260927-s1x: Flagging a sample should offer SampleClear - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning
**Source todo:** `.planning/todos/pending/2026-09-26-sample-flag-should-offer-sampleclear.md`
(read it, but see the correction below — one of its claims is wrong)

<domain>
## Task Boundary

Today, flipping *"This track contains a sample"* tells an artist they have a problem —
a required clearance, a capped readiness score, and a buyer routed to `'contact'`
instead of a clean licence — and never mentions the tool that would solve it.
`SampleFlagToggle` contains no reference to SampleClear.

Close that loop: raising the flag should put SampleClear in front of them.

This became worth doing today. PR #120 gave SampleClear a real result view with
copyable clearance letters; before that, the link would have handed the artist a
generic field dump.

</domain>

<decisions>
## Implementation Decisions

### ⚠️ The source todo is wrong about the route

It says *"Tools run through the generic `POST /api/tools/[slug]` route (`getTool(slug)`)"*.
**They do not.** Verified today:

- `ToolSidePanel.tsx` posts to **`POST /api/vault/{projectId}/documents/generate`**.
- `sampleclear` is **not** in `ToolSlug` in `lib/tools/registry.ts` — that union is
  `epkfyi | soundbait | dropready | distroadvisor | royaltyaudit | spotifypitch`, so
  `getTool('sampleclear')` returns `undefined`.
- The slug it *is* valid for is `Stage3ToolSlug`, allowlisted in the generate route's
  `VALID_TOOLS`.

Nothing new is needed server-side — but for the right reason. Do not follow the todo's
route claim.

### What is verified to exist

- `components/vault/SampleFlagToggle.tsx:36` — PATCHes
  `/api/vault/{projectId}/tracks/{trackId}`; toggle-on sends `{ has_sample: true }`
  (line 65), the details field saves separately (line 70).
- `components/vault/DocumentStage.tsx:35` — holds `const [active, setActive] = useState<DocRequirement | null>(null)`;
  passes `setActive` as `onOpen` to the document cards (lines 133, 150, 221) and
  `req={active}` to `ToolSidePanel` (line 275). It renders `SampleFlagToggle` at line 183.
- `DocumentStage` already calls `router.refresh()` elsewhere (lines 50, 65).
- `lib/vault/stage3.ts` already raises a **required** `sampleclear` requirement for every
  track with `has_sample`, keyed **`sampleclear:{trackId}`**, prefilled with
  `{ song_name, sample_details }`.

So the requirement the panel needs **already gets created by the server**. The work is
getting the artist to it.

### THE CORE DESIGN QUESTION — resolve this first

**Do not synthesise a `DocRequirement` object in the client.** A hand-built one would
drift from whatever `stage3` produces (status, documentId, signers, protects, severity)
and would be a second source of truth for a rights requirement. Open the **real** one.

The problem is timing: after the PATCH, the new requirement only exists once the server
re-renders. `router.refresh()` is not synchronous, and `DocumentStage` receives its
requirements as props.

Work out the honest way to open the real requirement once it arrives — for example a
"pending open" key held in state that a `useEffect` resolves against the refreshed
requirement list, clearing itself once opened or if the key never appears. Whatever the
approach, it must not open a stale or invented object, and it must not hang forever if
the requirement never shows up. **If the only way to make this work is to synthesise the
object, stop and report that rather than doing it.**

### Constraints from the todo and the deliberations — all binding

1. **Offer, do not auto-run.** A tool run costs an AI call and is a recorded output.
   Raising a flag is not the same as asking for a letter to be drafted. Opening the
   panel is the offer; the artist still presses Generate.
2. **Never promise a clearance timeline.** From
   `.planning/deliberations/sync-catalogue-entry-and-samples.md`: an earlier draft
   floated *"typically 4-8 weeks"*, which *"was invented by the assistant and the owner
   nearly adopted it. Sample clearance routinely takes months and a meaningful share
   never clears."* No duration, no "quick", no "soon".
3. **A flagged sample does not disqualify the song.** Same deliberation: sampled tracks
   **are** in the default browse — *"Sample-based music is a large share of what
   supervisors actually place."* The offer must read as help, not as a warning that the
   artist has just excluded themselves.
4. **Say "help", never "clear".** Owner instruction 2026-09-26 — Funūn helps clear; it
   cannot clear. Some samples never do.
5. **Only on toggle-ON.** Turning the flag off, or editing the details text, must not
   open anything.

### Out of scope

- Moving the sample question earlier than the documents page. The todo raises it
  ("worth deciding separately") — leave it alone and do not touch the Release Report.
- Any change to `lib/tools/sampleclear.ts`, `ToolSidePanel`'s result view, or the
  generate route. Those shipped in #120.
- The registry / `ToolSlug` union. Do not add `sampleclear` to it.

</decisions>

<specifics>
## Specific Ideas

**Branch `sample-flag-offers-sampleclear` is already created and checked out**, forked
fresh from `origin/main` at the #120 merge. Do not create a branch.

**Tests.** No jsdom in this repo, so a component test cannot observe the panel opening —
do not write one that pretends to. If the resolution logic can be expressed as a pure
function (given a requirements list and a pending key, return the requirement or null),
export it and test that hard: key absent, key present, list empty, duplicate keys.
If it genuinely cannot be extracted, say so rather than writing a theatrical test.

**Verification Gate** per `.claude/CLAUDE.md` — every step CI's `validate` job runs:

```
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
```

`lint` runs `--max-warnings=0`, and this change adds a `useEffect` — a
`react-hooks/exhaustive-deps` warning will fail the build, and in this repo those
warnings have described real defects (Phase 39 shipped a keydown effect that
re-subscribed on every render through six waves of build+test).

Do NOT run `npm run build`. `main` is protected — ship through a PR. Never `git add -A`.

**PR body must state:** that the source todo's route claim was wrong and why; that the
requirement is the real stage3 one rather than a synthesised object; that the tool is
offered and not auto-run; and that a human still needs to click the toggle on a real
track to confirm the panel opens, since no test can see it.

</specifics>

<canonical_refs>
## Canonical References

- `components/vault/SampleFlagToggle.tsx` — the toggle (line 36 PATCH, line 65 toggle-on)
- `components/vault/DocumentStage.tsx` — `active`/`setActive` (35), cards (133/150/221),
  toggle (183), panel (275), existing `router.refresh()` (50, 65)
- `lib/vault/stage3.ts` — where the `sampleclear:{trackId}` requirement is built
- `.planning/todos/pending/2026-09-26-sample-flag-should-offer-sampleclear.md` — the
  source todo (route claim is wrong)
- `.planning/deliberations/sync-catalogue-entry-and-samples.md` — the timeline and
  browse-inclusion rules
- `.claude/CLAUDE.md` — Verification Gate, branch protection

</canonical_refs>
