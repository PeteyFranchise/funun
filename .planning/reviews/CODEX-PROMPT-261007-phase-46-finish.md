# Codex prompt — review Phase 46 and recommend how to finish it

**Sent:** 2026-10-07 · **Answer:** pending at the time of writing
**Why it exists:** two things found while trying to finish Phase 46 are not reflected in the
roadmap, and one of them makes the documented pipeline unsafe to run.

Findings in full: `.planning/todos/pending/2026-10-07-marketing-bench-artifact-divergence.md`

The prompt below was sent verbatim. Record it so the eventual answer can be read against exactly
what was asked — and so a reviewer can see which claims were presented as verified versus
reported.

---

Review Phase 46 ("The marketing page — finish it and ship it") in the Funūn repo and recommend
the best way to finish it. Return your report in a single copy-paste-ready fenced block.

READ FIRST: `.planning/ROADMAP.md` "### Phase 46"; the ship-scope todo
`2026-09-30-ship-marketing-page-at-root-scope.md`; `scripts/marketing-assets.ts`,
`build-marketing-artifact.ts`, `verify-marketing-artifact.ts`; `app/marketing-document/route.ts`,
`lib/marketing/rootRewrite.ts`, `middleware.ts` (~186-200); `assets/marketing/landing.html` and
`manifest.json`. Note `private/bench/marketing.html` is gitignored and absent from a fresh
checkout — where a claim depends on it, say so and treat the measurements as reported, not
verified.

VERIFIED STATE 2026-10-07: (1) the page is ALREADY LIVE — middleware rewrites `/` to
`/marketing-document` for anonymous users, no flag; the roadmap still frames shipping as future.
(2) All five ship-scope work units appear complete and the verifier passes.

THE FINDING: the pipeline's premise (bench = source, artifact = generated) is false and the
freeze cannot detect it. `FROZEN_SHA256` pins only the bench's hash. Rebuilding from the
unchanged bench differs from the committed live artifact by 14 hunks (~87 lines) — PR #150's
mobile/accessible sphere fix (`0230e1e1`, 2026-10-04): div→button nodes, aria attributes,
tap/pin state, `-webkit-user-select`/`-webkit-touch-callout`, and the "Tap or hover anyone…"
copy. Bench has 0 `-webkit-touch-callout`; the live artifact has 3. The build script has not
changed since the artifact was committed, so this is not build drift. The next legitimate
re-freeze silently reverts a shipped mobile and accessibility fix while all checks pass.

TWO DEFECTS FOUND, NOT SHIPPED: (a) `landing.html:894` links to `crate-ready.html`, which exists
only on the gitignored bench — a 404 on the live homepage; the button sits inside the crate
section so `#crate` would scroll to itself. (b) Both "Submit a song" CTAs point at `/signup`, not
`/signup?next=%2Fvault%2Fnew%2Fsong`, so the questionnaire shipped in PRs #177–#182 is
unreachable from the page advertising it. Both fixes were applied through the documented
pipeline, produced a 93-line diff because the rebuild reverted PR #150, and were reverted.

STILL OPEN: 46.1 hero art (owner generates plates, phase integrates); 46.3 "continue the 21st.dev
harvest" with no acceptance criteria; and the publishing blockers, which are now LIVE claims —
pricing says "The free plan stays free. Move up when you need more audio…" plus an Entourage
tier, while migration 222 explicitly does not enforce a storage cap, there are no tiers in code,
PitchPlug is metered with no stated quota, and the Team service promises have no implementation.
Phase 47 is the dependency.

ASKED FOR: (1) verify or refute each claim, naming what could not be checked without the bench.
(2) The fork, with a recommendation: (A) back-port artifact-only changes into the bench,
re-freeze, prove by rebuilding to byte-equality, then apply the two fixes; or (B) declare the
artifact the source of truth and rewrite the pipeline — considering cost, who edits this page
later, Phase 48 (marketing-page editor), and whether hand-edits can be detected at all.
(3) Whether a guard should fail when the committed artifact is not reproducible from the frozen
bench, where it lives, and what it costs. (4) For defect (a): remove, port the explainer, or
something else. (5) A finish-line definition separating "built" from "publishable" given the page
is already published, and whether anything live makes a claim the product cannot keep.
(6) Anything in the five work units marked done but not done.

Be adversarial. I have been wrong twice this week in ways that passed every check: a migration
guard whose IF condition was NULL so it never fired, and a test that restated my own column list
back to me instead of measuring against the schema. Assume similar errors here.
