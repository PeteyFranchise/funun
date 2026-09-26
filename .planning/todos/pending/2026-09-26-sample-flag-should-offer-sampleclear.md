# Flagging a sample should hand you SampleClear

**Captured:** 2026-09-26 · **Status:** open — small; a link, not a build
**Size:** one prop and a handler, both sides already exist
**Found while:** cutting the sample question from the "Submit a song" onboarding, on the owner's
instruction that the question must still live in the Release Report *"so it can pass clearances or
let us know if we need to search for clearances."*

## What happens today

`components/vault/SampleFlagToggle.tsx` — *"This track contains a sample"* — is a per-track control
on `/vault/[projectId]/documents`. Flipping it on:

- writes `tracks.has_sample` and `tracks.sample_details`
- **creates a required Sample Clearance requirement and caps the readiness score** until the
  clearance is signed (the component's own header states this)
- feeds `sampleBlock`, which at `lib/sync-library/gate.ts:51` routes a buyer to `'contact'` rather
  than a clean licence, and produces the catalogue label decided 2026-09-09: *"Contains a sample —
  licensing needs clearance first."*

So the artist is told they have a problem, and the whole downstream chain reacts correctly.

**They are not told how to solve it.** `SampleFlagToggle` contains no reference to SampleClear —
grepped, nothing. The artist gets a requirement, a capped score and a buyer-side block, with no
route to the thing that would clear it.

## The tool that should be offered

`lib/tools/sampleclear.ts` — **SampleClear**:

> *"Assesses a sampled track: identifies master vs publishing rights holders (usually different),
> drafts a clearance request to each, and offers legal alternatives if clearance is unlikely."*

Output: `assessment`, `master_rights` + `publishing_rights` (likely holder and how to contact each),
a `master_request_letter`, a `publishing_request_letter`, `alternatives[]`, and a `risk_level`.
Files as a `sample_clearance` document — the exact document the requirement is waiting on.

That "master vs publishing holders are usually different parties" line is the part an artist most
often gets wrong on their own, which is the argument for putting the tool in front of them at the
moment they raise their hand.

## Why this is small

**Both components already render on the same page.** `components/vault/DocumentStage.tsx` imports
and renders `SampleFlagToggle` (line 183) *and* `ToolSidePanel` (line 273). The panel is driven by
a request object with a `prefill` bag and a `trackTitle` — `ToolSidePanel.tsx:108` already does
`song_name: req.prefill.song_name ?? req.trackTitle`. Tools run through the generic
`POST /api/tools/[slug]` route (`getTool(slug)`), so nothing new is needed server-side.

So the work is: on a successful toggle-on PATCH, set `DocumentStage`'s `active` request to a
SampleClear one, prefilled with the track title and the `sample_details` the artist just typed.

## Constraints

- **Offer, do not auto-run.** Tool runs are recorded outputs and cost an AI call; the artist raising
  a flag is not the same as asking for a letter to be drafted.
- **Never promise a clearance timeline.** From
  `.planning/deliberations/sync-catalogue-entry-and-samples.md`: an earlier draft floated *"typically
  4-8 weeks"*, which *"was invented by the assistant and the owner nearly adopted it. Sample
  clearance routinely takes months and a meaningful share never clears. Any timeline on the
  catalogue must come from Funūn's own completed cases, not from an estimate."*
- **A flagged sample does not exclude the song.** Same deliberation: sampled tracks **ARE** in the
  default browse — *"Sample-based music is a large share of what supervisors actually place."* The
  offer should read as help, not as a warning that they have disqualified themselves.

## Related, worth deciding separately

The toggle lives on the **documents** page, so the question is met late — after audio, artwork and
metadata. Worth asking whether the Release Report should raise it earlier, since a sample changes
what the whole release needs.
