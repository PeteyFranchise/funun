# Split-document upload build

**Captured:** 2026-10-04 (filed during the Phase 50 adversarial-review re-plan) · **Status:**
roadmapped, deliberately deferred
**Owner framing:** *"Nice. Bring it in and it rides with the song from here"* is the line we want
to be able to say — it just is not true yet.

## Why this is deferred rather than dropped

Question 3 of the (optional) submit-a-song questionnaire asks *"Are the splits agreed?"* The
"agreed and written down" answer's draft reply promised a capability that does not exist: there is
no `work_documents` table and no upload route, so there is nowhere to put a split sheet somebody
already signed outside Funūn.

**Decided, both halves (`.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md`
§1):**
- **Now, no build (shipped as part of Phase 50's intake/questionnaire slice):** the reply becomes
  *"Good — that's the hard part done. We'll note it on the song so nobody asks you twice."* True
  today, and it still records something useful on the submission.
- **Next, its own build (THIS todo):** accept the existing signed document as an upload. **It must
  land with the song's splits specifically, not in a generic documents pile** — the owner was
  explicit about placement; this is not "add a file upload field," it's "the split sheet lives
  where the split sheet lives." When this ships, the copy can become the originally-drafted line,
  because by then it will be true.

This is the `label-integrity-funun` discipline applied to product copy: say the true thing now,
change the words only when the capability changes — never the other way round.

## What this build needs, not yet scoped

- Where exactly "with the song's splits" means, structurally — likely adjacent to whatever rights
  record Phase 50 Slice 8 (rights-ready assist) ends up using for proposed/confirmed split entries,
  not a new sibling concept.
- Upload validation (file type/size), storage bucket choice, and who can view the uploaded
  document (the artist, staff with queue access, anyone else).
- Whether an uploaded signed document should ALSO satisfy (or just inform) the existing
  `split_sheets` readiness item `isSyncRightsClear()` reads — i.e., does this feed the
  licensing-readiness computation Phase 50 Slice 3 builds, or sit alongside it as a separate,
  staff-visible artifact? This is the kind of question that produces a second, drifting
  "rights-ready" bar if answered implicitly instead of explicitly — see Phase 50's own "one
  definition of done" discipline before building this.

## Related

- `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md` §1
- Phase 50 (`.planning/phases/50-crate-submissions-door-valve-rights-enforcement/50-SLICES.md`,
  Slice 5's copy fix, Slice 8's rights-ready assist) — the natural neighbor once this is scoped,
  not a dependency that blocks Phase 50 from shipping without it.
