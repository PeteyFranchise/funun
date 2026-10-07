# Submit-a-song has never been used by a human

**Captured:** 2026-10-07 · **Status:** shipped and unexercised
**Shipped:** PRs #177–#182, six slices, all merged to `main`

## What exists

`/vault/new/song` → statement ("It's in your Sound Vault, and it's private") → six skippable
questions → summary with all four doors. Real writes behind the two promises that make one:

- Q2 records collaborators (name alone is enough; email optional) as **membership only**
- Q3 "not yet" promotes the artist **and** every captured collaborator onto the living-draft
  sheet at equal shares, via `planWriterPromotion`
- Q4/Q5 file a real `ai_entries` row where the answers determine it, and deliberately do **not**
  where they would require guessing a component or a human-take id

## Why this todo exists

**Every migration this week was proved by asking production to refuse a real write. This had no
equivalent step.** It is covered by unit tests only, and app code fails in ways unit tests do not
see: hydration, auth redirects, a fetch that 404s because a route group changed, a button that
never enables.

It is the single most likely thing to embarrass us in front of a beta user.

## What a browser pass must actually check

Not "does it render". These:

1. **Capture precedes every question.** Arrive via `/signup?next=%2Fvault%2Fnew%2Fsong`, confirm
   the work is created and the Writer's Room is reachable before any question appears.
2. **Skip works** — individually and "skip the rest" — and skipping does not discard an earlier
   answer.
3. **Q3 "not yet" actually produces a sheet.** Answer it, then open the song and confirm the
   living-draft split sheet has the artist on it at 100%, or at even shares with collaborators.
   The promised response should only appear once that write landed.
4. **Add a collaborator with no email.** That is the case the copy promises ("Add who you
   remember") and the case the one-call members endpoint could not serve.
5. **Q4 "whole track"** files an `ai_entries` row — check the song's diary, and check the summary
   says "cited, not hidden" rather than "citation still owed".
6. **Q4 "some of it" + "built from a take"** files NOTHING and the summary says the citation is
   still owed, with a working link. This is correct behaviour, not a bug.
7. **All four doors render in the ineligible verdict.** That is decision #10's whole point.

## Known gap, by design

`partial` AI with a human take cannot be filed from the questionnaire — it needs a take
selection, which is `AiEntryFlow`'s job. Some artists will land on "citation still owed". That is
intended; do not "fix" it by guessing a component.

## Related

- `lib/onboarding/submit-song-copy.ts` — the four doctrine rules, under test
- `.planning/todos/pending/2026-09-26-submit-a-song-onboarding-questionnaire.md` — the design
- `2026-09-30-ship-marketing-page-at-root-scope.md` — the CTA still does not point here
