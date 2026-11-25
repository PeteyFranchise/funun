# The marketing bench and the shipped artifact have diverged — the freeze cannot see it

**Found:** 2026-10-07, while trying to finish Phase 46
**Severity:** the next legitimate re-freeze silently reverts a shipped mobile + accessibility fix
**Status:** NOT fixed. Two defects found alongside it are also NOT shipped, deliberately.
**In flight:** a Codex review of Phase 46 was commissioned 2026-10-07 with this finding as its
brief. Read its answer before acting.

---

## The page is already live

`middleware.ts` (~186-200) rewrites `/` to `/marketing-document` for anonymous visitors via
`shouldRewriteRootToMarketing(pathname, hasUser)`. **No feature flag, no gate.** The roadmap still
describes shipping as a future step with an owner decision attached; it has already happened.

All five work units of `2026-09-30-ship-marketing-page-at-root-scope.md` appear complete: route
handler, 7 self-hosted woff2, `public/marketing/` assets, sanitized artifact, verify script. The
verifier passes.

## The finding

The pipeline's premise is **bench = source of truth, artifact = generated**. That is currently
false, and nothing in the pipeline can detect it.

- `FROZEN_SHA256` pins **only the bench's own hash**. It says nothing about whether the generated
  artifact was edited by hand afterwards.
- Rebuilding from the **unchanged** bench produces an artifact differing from the committed, live
  one in **14 hunks (~87 lines lost)**.
- Those hunks are PR #150 — *"mobile sphere fix"*, commit `0230e1e1`, 2026-10-04: the whole
  mobile/accessible sphere implementation. `div` → `button` nodes, `aria-label` /
  `aria-pressed`, tap/pin state, press tracking, `-webkit-user-select` /
  `-webkit-touch-callout`, and the "Tap or hover anyone…" copy.
- Counts: bench has **0** occurrences of `-webkit-touch-callout`; the live artifact has **3**.
- `scripts/build-marketing-artifact.ts` has **not changed** since the artifact was committed, so
  this is not build drift. The fix was applied to the generated file and never back-ported.

**Consequence:** whoever next re-freezes legitimately reverts a shipped mobile and accessibility
fix, and every existing check passes while they do it. This is the same shape as the defects that
cost us time all week — see [[reference_structural_checks_pass_while_wrong]].

## Two defects found, deliberately NOT shipped

**a) A 404 on the live homepage.** `assets/marketing/landing.html:894`

```html
<a class="btn ghost" href="crate-ready.html">What makes a song Crate-ready</a>
```

`crate-ready.html` exists only at `private/bench/crate-ready.html`, which is gitignored and never
served. At `/` this 404s. The button sits **inside** the crate section, so repointing it at
`#crate` would scroll to itself. Options: remove the button, port the explainer as a second
document, or point somewhere real. Note `2026-09-26-submit-a-song-onboarding-questionnaire.md`
already contemplates retiring that explainer.

**b) The marketing CTA does not reach the flow it advertises.** Both "Submit a song" buttons point
at `/signup`, not `/signup?next=%2Fvault%2Fnew%2Fsong`. The submit-a-song questionnaire shipped in
PRs #177–#182 is unreachable from the page that sells it. The deep link is verified same-origin
safe (`__tests__/submit-song-entry-deeplink.test.ts`).

## Why neither was shipped

Both fixes were applied through the documented pipeline — edit bench, re-pin `FROZEN_SHA256` and
`FROZEN_LINE_COUNT`, `marketing:assets` → `marketing:build` → `marketing:verify`. It worked. It
also produced a **93-line diff**, because the rebuild reverted PR #150 as a side effect.

Everything was reverted. Bench matches the freeze, the committed artifact is untouched, the
verifier is green. **Shipping an 87-line regression to fix a dead link is a bad trade.**

## The fork someone has to decide

**(A) Back-port** the artifact-only changes into the bench, re-freeze, and prove it by rebuilding
to **byte-equality** with today's live artifact — then apply the two fixes. Restores the pipeline's
premise and the proof is clean. Cost: 14 hunks ported by hand, adjusted for sanitization (the
artifact has comments stripped and asset paths rewritten, so chunks cannot be copied verbatim).

**(B) Declare the generated artifact the source of truth**, demote the bench to a scratchpad, and
rewrite the pipeline and its docs. Cheaper now; changes who can edit this page and how.

Weigh **Phase 48** (a marketing-page editor for the marketing team) — it presumably assumes one
authoritative source, and this decision picks which.

## Regardless of the fork

There is currently **no mechanism that detects a hand-edited artifact.** Whatever is decided, a
guard that fails when the committed artifact is not reproducible from the frozen bench would have
caught this on the day. Candidate homes: the verify script, a Jest test, or CI.

## Still open in Phase 46 beyond this

- **46.1 hero art** — three slides still carry placeholder ribbons. Owner generates the Midjourney
  plates; the phase does integration.
- **46.3 "continue the 21st.dev harvest"** — discretionary, no acceptance criteria.
- **Publishing blockers, now live.** The pricing section says *"The free plan stays free. Move up
  when you need more audio, more tools…"* plus an Entourage tier. Per the roadmap: no enforced
  storage cap (migration 222 explicitly does not enforce), no tiers in code, PitchPlug metered
  with no stated quota, Team service promises with no implementation. **Phase 47 is the
  dependency, and these claims are public today.**

## Related

- `.planning/ROADMAP.md` → "### Phase 46" — note its "Blocks publishing, not building" framing
  predates the page going live
- `.planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md`
- [[project_marketing_artifact_refreeze]] — the pipeline and its four traps
