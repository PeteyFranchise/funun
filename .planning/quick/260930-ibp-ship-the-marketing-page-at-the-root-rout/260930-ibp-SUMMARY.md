---
phase: quick/260930-ibp-ship-the-marketing-page-at-the-root-rout
plan: 260930-ibp
subsystem: routing
tags: [nextjs, middleware, csp, marketing, anonymous-routing, jest, sanitizer]

requires: []
provides:
  - "Anonymous GET of `/` serves the approved marketing document instead of redirecting to `/signin`"
  - "A reproducible, regenerable sanitizer (`scripts/build-marketing-artifact.ts`) that turns the gitignored bench source into a committed, CSP-clean artifact"
  - "A verifier (`scripts/verify-marketing-artifact.ts`) that fails closed on bench chrome, internal commentary, or any inline event-handler attribute"
  - "An anonymous-only middleware rewrite that never disturbs authenticated role routing or the collaborator-claim side effect"
affects: [marketing, middleware, csp, public-site]

tech-stack:
  added: []
  patterns:
    - "Anchored string-replacement sanitizer with fail-closed assertOccurrences/removeBetween/removeAllMatches primitives -- no HTML parser, no reserializer, byte-identical regeneration"
    - "Capture-phase document-level error listener replacing inline onerror attributes that a nonce-only CSP cannot authorize"
    - "Anonymous-only middleware rewrite placed after supabase.auth.getUser(), below the protected-route block, so the authenticated collaborator-claim branch is structurally unreachable to bypass"

key-files:
  created:
    - scripts/marketing-assets.ts
    - scripts/build-marketing-artifact.ts
    - scripts/verify-marketing-artifact.ts
    - scripts/marketing-artifact.test.ts
    - scripts/__fixtures__/marketing-sanitizer/
    - assets/marketing/landing.html
    - assets/marketing/manifest.json
    - app/marketing-document/route.ts
    - __tests__/marketing-root-route.test.ts
    - public/marketing/img/ (43 files)
    - public/marketing/fonts/ (7 woff2)
  modified:
    - middleware.ts
    - next.config.mjs
    - package.json

key-decisions:
  - "onerror=\"this.remove()\" (F2, 2 occurrences) converted to a single capture-phase document-level 'error' listener rather than left as a CSP violation -- checkpoint decision 3, option (b)"
  - "No favicon/OG image added (F5) -- none exists in the repo and none has been chosen; recorded as an outstanding pre-launch item, not a port defect"
  - "Parity is orchestrator-verified (pixel diff, masked bench-only chrome), not yet human-verified against the deployed Vercel preview"

requirements-completed: [UNIT-2, UNIT-3, UNIT-4, UNIT-5]

coverage:
  - id: D1
    description: "Browser-derived asset manifest reconciling static analysis (43 paths) against a real HAR capture; only manifest-listed files copied into public/marketing/"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts (Task 1 describe blocks: verifyFrozenSource, extractLiteralImagePaths, extractSelSlugs/expandSelArtPaths, getStaticImageCandidateSet, parseHarAssetPaths, reconcileAssetSets)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Reproducible, anchored-string sanitizer producing assets/marketing/landing.html; verifier asserts zero bench chrome, zero internal commentary, zero inline event-handler attributes, byte-identical regeneration"
    verification:
      - kind: unit
        ref: "scripts/marketing-artifact.test.ts (49 tests: primitives, sanitize-pipeline building blocks, onerror/listener injection, verifyArtifact, real-artifact assertions)"
        status: pass
      - kind: other
        ref: "npx tsx scripts/build-marketing-artifact.ts && npx tsx scripts/verify-marketing-artifact.ts (run twice, byte-identical output)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Route handler + anonymous-only middleware rewrite; authenticated role routing and collaborator-claim side effect demonstrably unchanged; middleware matcher excludes /marketing/ static assets"
    verification:
      - kind: unit
        ref: "__tests__/marketing-root-route.test.ts"
        status: pass
      - kind: other
        ref: "npm run security:migrations:verify && npm run typecheck:strict && npm run lint && npm test -- --runInBand (full repo, 638 suites / 7893 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pixel parity between the frozen bench render (shipped state) and the locally served / at 1440/1024/768/430px"
    verification:
      - kind: other
        ref: "orchestrator-run headless capture, bench-only chrome masked; see Parity Evidence below"
        status: pass
    human_judgment: true
    rationale: "No jsdom exists in this repo and no automated check can substitute for a human comparing the deployed Vercel preview against the frozen design render -- the orchestrator's pixel-diff numbers are evidence, not a replacement for that human look."

duration: ~2h (across two sessions; this session's onerror fix + full gate re-run: ~25min)
completed: 2026-09-30
status: complete
---

# Quick Task 260930-ibp: Ship the Marketing Page at the Root Route Summary

**Anonymous visitors to `/` now see the approved Funūn marketing page instead of being redirected to `/signin`, served from a byte-reproducible sanitized artifact behind a nonce-only CSP with zero inline event-handler attributes.**

## Performance

- **Duration:** ~2h total across Tasks 1–4 (this session covered Task 4's checkpoint decision 3 implementation and the full re-verification gate, ~25 min)
- **Completed:** 2026-09-30
- **Tasks:** 4/4 (Task 4 = checkpoint + owner decisions + this session's follow-up fix)
- **Files modified this session:** 5 (`scripts/build-marketing-artifact.ts`, `scripts/verify-marketing-artifact.ts`, `scripts/marketing-artifact.test.ts`, `scripts/__fixtures__/marketing-sanitizer/dirty-verifier.html`, `assets/marketing/landing.html`)

## Accomplishments

- `scripts/marketing-assets.ts` — browser-derived asset manifest: static analysis of the frozen bench HTML (43 paths) reconciled against a real HAR capture, closing the gap grep alone could not (grep finds 40; the SEL-array expansion finds 43; the browser observed 53, all explained by the static set)
- `scripts/build-marketing-artifact.ts` — anchored string-replacement sanitizer (no HTML parser, no reserializer) producing `assets/marketing/landing.html` from the gitignored bench source; re-asserts the frozen sha256 and line count and refuses to run against any other revision
- `scripts/verify-marketing-artifact.ts` — fail-closed verifier: zero bench chrome, zero internal decision commentary, zero inline event-handler attributes, nonce placeholder count matches the manifest, every referenced asset path exists in the manifest
- `app/marketing-document/route.ts` + `middleware.ts` — anonymous-only rewrite of `/` to the sanitized document, placed after `supabase.auth.getUser()` and below the protected-route block, with a regression test proving the collaborator-claim branch (`middleware.ts:159-180`) is still reached for authenticated non-auth requests
- **This session:** converted the two `onerror="this.remove()"` inline attributes (F2) into a single capture-phase `document.addEventListener('error', ..., true)` listener, per checkpoint decision 3 option (b) — closes the CSP violation without widening the CSP or dropping the defensive behavior

## Task Commits

1. **Task 1: Browser-derived asset manifest, copy assets** — `5882be79` (feat)
2. **Task 2: Reproducible sanitizer, artifact, verifier** — `d5d462ec` (feat)
3. **Task 3: Route handler, anonymous-only rewrite, file tracing** — `4e82a39d` (feat)
4. **Task 4 follow-up: onerror → capture-phase listener (checkpoint decision 3)** — `771720dd` (fix)

## The `onerror` Fix (this session)

**Registration approach:** a single `document.addEventListener('error', fn, true)` — capture phase, registered once, immediately after the `const ASSET_V=...` declaration (the first statement in the surviving script, already ordering-constrained by an existing comment: "MUST be declared before any renderer uses it").

**Why capture phase covers dynamically inserted images:** the DOM `error` event does not bubble. A normal (bubble-phase) listener on `document` would never see an `<img>` load failure regardless of when the image was inserted. A **capture**-phase listener fires top-down for every matching event on every descendant, present or future, because capture dispatch doesn't depend on the event bubbling back up — it depends on the event occurring on a descendant of the listening node at dispatch time. Registering it once, early, before either renderer runs, means:
- the `buildVoices()` IIFE's one-time `grid.innerHTML = ...` render (testimonial avatars) is covered without any change to that function, and
- the `buildDiffs()` IIFE's `show(i)`, which re-renders `panel.innerHTML` on **every tab switch** (screenshot per differentiator), is covered on every re-render without re-registering a listener each time.

No per-render re-registration is needed or was added — that was the deciding factor between "listener on a container, re-registered after each render" and "one capture-phase listener on `document`, registered once": the second requires touching the two renderer functions not at all, keeping the sanitizer's diff to exactly the two attribute removals, one injection point, and one stale-comment correction.

**Verifier assertion added:** `INLINE_EVENT_HANDLER_RE = /\bon[a-z]+="/g` in `scripts/verify-marketing-artifact.ts`, checked independently of the existing `PROHIBITED_LITERALS` list. Word-boundary + trailing `="` anchored deliberately — an unanchored `on[a-z]+=` also matches `content=`, `font=`, and `controls=` inside this document (verified against the real artifact before landing the check), which are not event-handler attributes at all. Any future edit reintroducing an inline handler (`onclick`, `onload`, …) now fails the verifier loudly instead of shipping a silent CSP violation.

**Unit tests added (6):** removal of both onerror shapes (one closes a JS string literal, one closes the `<img>` tag itself) regardless of what follows; fail-closed behavior when the observed count drifts from 2; the listener is injected after `ASSET_V` and before the next statement; `verifyArtifact` flags the dirty fixture's onerror line independently of the literal list; a document-level `addEventListener` registration is *not* mistaken for an inline handler; `content=`/`font=`/`controls=` do not false-positive. Plus 2 assertions against the real generated artifact (zero `onerror=`, zero `\bon[a-z]+="`, listener text present).

**Incidental find and fix:** the sanitizer's own injected explanatory comment for the listener originally contained the literal string `<script>` (in the phrase "the nonce on `<script>`"), which `injectNoncePlaceholder`'s tag-matching regex then treated as a second real `<script>` tag — `nonceScriptCount` came out as 2 instead of 1 on first build. Caught by the verifier failing, not silently shipped; fixed by rewording the comment to not contain a literal `<script>` substring. A second, smaller instance of the same class of bug: the injected comment's own prose originally contained the literal `onerror="this.remove()"` string (describing what it was replacing), which the onerror-removal regex naturally cannot see (it ran before the comment was inserted) but the verifier's independent `\bon[a-z]+="` check correctly caught as a leftover violation in the final artifact — fixed by rewording to describe the attribute without reproducing its literal form.

## Parity Evidence (from before this session, re-confirmed as still valid)

Method: the frozen bench was regenerated in true shipped state (`data-ship="1"` on `<body>` in a temp copy, since ship mode is a click, not a URL param), the sanitized artifact was served standalone with `public/marketing/` mounted at `/marketing/`, and both were captured headless at 4 widths, 1x DPR.

Raw result: ~1,880 differing pixels at every width, traced to one element — the bench's "Exit ship preview" pill, bench-only chrome correctly absent from the artifact. With that masked in both images:

| width | differing pixels |
|---|---|
| 1440px | 3 of 4,320,000 |
| 1024px | 4 of 3,072,000 |
| 768px | 0 — identical |
| 430px | 3 of 1,290,000 |

Against an earlier same-day control showing 12 pixels of pure capture noise, this is parity. **This session's onerror change does not require re-capturing these numbers**: every line changed by the `fix(marketing)` commit lives inside the `<script>` tag's text content (attribute removal on strings later assigned via `innerHTML`, a new listener registration, one comment edit) — script-tag text is never rendered to pixels, and the two images render with an identical `src` regardless of whether an `onerror` attribute or a capture-phase listener handles their (never-triggered, since every image is present) failure path. The parity numbers above are therefore unaffected by construction, not merely unchanged by re-measurement.

**Still unverified by any human:** the deployed Vercel preview has not been looked at by a person. The numbers above are an orchestrator-run pixel diff, not a human eyeball, and are attributed as such — per the checkpoint answer, this is recorded as parity evidence, not as a substitute for the human look the plan's own verification section requires.

## Verification Gate (full CI `validate` job, re-run this session after the onerror change)

```
$ npm run security:migrations:verify
PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
(clean — tsc --noEmit --noUnusedLocals --noUnusedParameters, no output, exit 0)

$ npm run lint
(ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0 — only an ESLintRCWarning migration notice, zero lint errors/warnings, exit 0)

$ npm test -- --runInBand
Test Suites: 638 passed, 638 total
Tests:       7893 passed, 7893 total
Snapshots:   0 total
Time:        33.157 s

$ npm audit --omit=dev --audit-level=moderate
5 vulnerabilities (1 low, 3 moderate, 1 high) — exit 1

$ npm audit --audit-level=high
12 vulnerabilities (1 low, 3 moderate, 8 high) — exit 1
```

Both `npm audit` invocations exit non-zero. Per the hard constraint for this session: **these findings are pre-existing on this branch and out of scope for this task.** Confirmed `git diff --stat package-lock.json` and `git status --short package-lock.json` both produce zero output on `marketing-page-at-root` — no dependency was added, removed, or re-resolved by this work, so nothing in this diff introduced, worsened, or could fix these findings (they are in `brace-expansion` via `@sentry/*`/`readdir-glob`, `dompurify`, and `fast-uri` via `ajv`/`schema-utils`, all transitive dev/build-tooling dependencies unrelated to the marketing-page work). Not attempted to fix here, as instructed.

`npx tsx scripts/build-marketing-artifact.ts` was also re-run twice back-to-back after the onerror change; the two outputs are byte-identical (`diff` reports no differences), confirming the idempotence property still holds with the new pipeline steps.

## Files Created/Modified (this session)

- `scripts/build-marketing-artifact.ts` — added `ONERROR_ATTR_RE`/`ONERROR_ATTR_COUNT`, `ASSET_V_DECLARATION`, `IMAGE_ERROR_LISTENER` (exported), `VOICES_FALLBACK_COMMENT_ORIGINAL`/`_UPDATED`; wired 3 new pipeline steps (remove both onerror attributes, correct the stale fallback comment, inject the listener)
- `scripts/verify-marketing-artifact.ts` — added `INLINE_EVENT_HANDLER_RE` and its violation check, independent of `PROHIBITED_LITERALS`
- `scripts/marketing-artifact.test.ts` — added a new `describe('onerror removal and image-error listener injection (F2)')` block (3 tests), 3 new `verifyArtifact` tests, 1 new real-artifact assertion (43 → 49 total tests)
- `scripts/__fixtures__/marketing-sanitizer/dirty-verifier.html` — added an `onerror="this.remove()"` line so the dirty fixture exercises the new check
- `assets/marketing/landing.html` — regenerated (121,021 bytes; `nonceScriptCount` unchanged at 1); `assets/marketing/manifest.json` unchanged (`git diff` empty)

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Sanitizer's own injected comment defeated the nonce-count and onerror checks it was written to satisfy**
- **Found during:** first rebuild after adding the listener injection
- **Issue:** the explanatory comment inserted alongside the capture-phase listener contained the literal substrings `<script>` and (separately) `onerror="this.remove()"` in its own prose. `injectNoncePlaceholder`'s tag regex matched the literal `<script>` text and nonced it as a second script tag (`nonceScriptCount` came out 2, not 1); the verifier's new `\bon[a-z]+="` check correctly flagged the literal `onerror="` text in the comment as a remaining violation.
- **Fix:** reworded both phrases to describe the mechanism without reproducing the exact literal strings the pipeline's own regexes match on.
- **Files modified:** `scripts/build-marketing-artifact.ts`
- **Commit:** `771720dd`

**2. [Rule 1 — Bug] Stale comment describing the removed mechanism**
- **Found during:** reviewing the diff for scope creep before committing
- **Issue:** the comment immediately above the first onerror call site ("… onerror removes the `<img>` and the initials show through …") would have shipped describing code that no longer exists, directly as a result of this session's change to the very statement it describes.
- **Fix:** added one `replaceExactly` step rewording it to name the shared listener instead of the removed attribute. Scoped narrowly per the hard constraint against widening the diff: this is the only prose edit the sanitizer makes anywhere; every other comment is either preserved verbatim or stripped as a whole anchored block, unchanged from Tasks 1–3.
- **Files modified:** `scripts/build-marketing-artifact.ts`
- **Commit:** `771720dd`

No other deviations. Tasks 1–3 deviations are documented in their own commit messages (`5882be79`, `d5d462ec`, `4e82a39d`) — notably Task 2 finding a 5th `.flag` paragraph the plan's literal count missed, and Task 3 finding and fixing two middleware-matcher/CSP-header bugs by testing against the running dev server rather than trusting the plan's described mechanism.

## What Remains Unverified

- **The deployed Vercel preview has not been looked at by a human.** All parity evidence above (pixel-diff numbers, both from the earlier session and reasoned-through-construction for this session's change) comes from the orchestrator, not from a person viewing the running site. The plan's own verification section states no automated check substitutes for this.
- **Head metadata gaps (F5):** no favicon/icon and no OG image, by design (none exists in the repo, none has been chosen) — recorded as an outstanding pre-launch item per checkpoint decision 4, not fixed here.
- **The `npm audit` findings** (5 at `--omit=dev --audit-level=moderate`, 12 at `--audit-level=high`) are pre-existing on this branch (zero `package-lock.json` diff) and were not investigated or remediated, per the hard constraint for this session.
- **PR not opened.** Per hard constraint, this session committed locally and stopped; the owner will open the PR.

## Self-Check: PASSED

- `scripts/build-marketing-artifact.ts` — FOUND
- `scripts/verify-marketing-artifact.ts` — FOUND
- `scripts/marketing-artifact.test.ts` — FOUND
- `scripts/__fixtures__/marketing-sanitizer/dirty-verifier.html` — FOUND
- `assets/marketing/landing.html` — FOUND, regenerates byte-identically, verifier passes
- Commit `5882be79` — FOUND in `git log --oneline --all`
- Commit `d5d462ec` — FOUND in `git log --oneline --all`
- Commit `4e82a39d` — FOUND in `git log --oneline --all`
- Commit `771720dd` — FOUND in `git log --oneline --all`
- Full verification gate (6 commands) — all run this session, output recorded verbatim above
