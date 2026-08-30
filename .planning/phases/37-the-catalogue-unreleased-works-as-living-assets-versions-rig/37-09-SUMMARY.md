---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 09
subsystem: ui
tags: [typescript, react, mediarecorder, next.js, ddex, ai-disclosure, jest]

requires:
  - phase: 37-03
    provides: "lib/catalogue/ai-entries.ts — AI_ENTRY_COMPONENT_LABELS/AI_ENTRY_MODE_LABELS/isFirstEverAiEntry()/Receipt type, consumed verbatim by AiEntryFlow, never reimplemented"
  - phase: 37-06
    provides: "lib/catalogue/audio.ts's EXT_BY_MIME (cross-checked, not restated) and POST /api/works/[workId]/versions + POST /api/works/[workId]/ai-entries, the two routes this plan's components post to"
  - phase: 37-10
    provides: "components/catalogue/ComposerCard.tsx's supportsCapture contract — HumCaptureButton is the component that resolves that boolean at runtime"
provides:
  - "lib/catalogue/hum-capture.ts — pickSupportedMimeType(), the runtime (never UA-sniffed) codec chooser, cross-checked against plan 06's upload allow-list"
  - "components/catalogue/HumCaptureButton.tsx — the microphone: request, record, post, and release on every exit path"
  - "components/catalogue/HumFirstMoment.tsx — the full-screen once-per-song deliberate minute (003-B)"
  - "components/catalogue/ReauthorPrompt.tsx — the inline, recurring re-author nudge (003-A)"
  - "components/catalogue/AiEntryFlow.tsx — conversational-first / two-door-after AI-entry flow with the server-composed receipt (002-B then 002-A)"
affects: [37-12, 37-13]

tech-stack:
  added: []
  patterns:
    - "Browser-API injection for testability: pickSupportedMimeType()'s predicate parameter, and HumCaptureButton's isTypeSupported/initialError props, let a component that touches MediaRecorder/getUserMedia be exercised by renderToStaticMarkup with zero jsdom and zero real browser API"
    - "typeof-guarded default for an undeclared global: `typeof MediaRecorder !== 'undefined' ? ... : () => false` — the one safe way to reference a DOM-only identifier from a module that also loads under Jest's node test environment"
    - "Test-seam props for state otherwise unreachable without jsdom (initialError, initialResult) — documented inline as production-never-sets-this, mirroring the codebase's existing injectable-predicate convention rather than inventing a new pattern"

key-files:
  created:
    - lib/catalogue/hum-capture.ts
    - lib/catalogue/hum-capture.test.ts
    - components/catalogue/HumCaptureButton.tsx
    - components/catalogue/HumCaptureButton.test.tsx
    - components/catalogue/HumFirstMoment.tsx
    - components/catalogue/HumFirstMoment.test.tsx
    - components/catalogue/ReauthorPrompt.tsx
    - components/catalogue/ReauthorPrompt.test.tsx
    - components/catalogue/AiEntryFlow.tsx
    - components/catalogue/AiEntryFlow.test.tsx
  modified: []

key-decisions:
  - "extensionForMime() is re-exported from lib/catalogue/hum-capture.ts (imported from lib/catalogue/audio.ts, not reimplemented) so HumCaptureButton and this module's own test both name a single source of truth for MIME→extension mapping — a drift between the codec candidate list and the upload allow-list would otherwise silently produce a recording the server rejects"
  - "The component's own support/error states are driven by injectable props (isTypeSupported, initialError on HumCaptureButton; initialResult on AiEntryFlow) rather than simulated browser interaction — this repo runs Jest with testEnvironment: 'node' (no jsdom, no @testing-library, no react-test-renderer), so a click-driven state transition cannot be exercised at all; every test-only prop is documented inline as never set by a production caller"
  - "AiEntryFlow's conversational-mode Q1 answer bubble reads 'Yes — AI was involved' (generic) rather than reproducing sketch 002-B's specific worked example ('an AI singer on the demo') — inventing a specific instrumentation claim not grounded in the actual component/version this flow instance concerns would itself be exactly the kind of unearned specificity the receipt-composition rule exists to prevent"
  - "'Not sure' in conversational mode, once HumFirstMoment produces a captured take, submits immediately as mode:'performance' with that take's id as humanSourceVersionId — doubt is resolved by the recording that was just made, not by a follow-up question, matching the plan's own comment instruction for this path"

patterns-established:
  - "A hygiene component that must degrade rather than break exposes its own runtime-detection seam as an injectable prop with the identical shape as the pure lib function it wraps (HumCaptureButton's isTypeSupported mirrors pickSupportedMimeType's own parameter) rather than a bespoke test-only flag"

requirements-completed: [S-01]

coverage:
  - id: D1
    description: "pickSupportedMimeType() asks the browser (never sniffs the user agent), is injectable, returns null when nothing is supported, and its full candidate list is proven — via an imported allow-list, not a restated one — to map to a known plan-06 upload extension"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/hum-capture.test.ts#pickSupportedMimeType"
        status: pass
    human_judgment: false
  - id: D2
    description: "HumCaptureButton renders the record affordance when supported, renders nothing when no codec is supported at all, and renders an inline error with an upload fallback on a denied/unavailable microphone"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/HumCaptureButton.test.tsx (idle / unsupported / denied states)"
        status: pass
    human_judgment: true
    rationale: "Structural/markup assertions only — there is no jsdom in this repo to drive a real getUserMedia/MediaRecorder recording sequence (start, stop, mic-release-on-unmount) end to end. Needs a manual hum-capture smoke test on a real browser, which is exactly what plan 13's owner device test (Chrome desktop + iPhone Safari) is for."
  - id: D3
    description: "HumFirstMoment reproduces 003-B's full-screen card with the owner's verbatim headline and rule line, folds the why behind LearnWhy (collapsed on first paint), keeps an honest skip, names no tool, and mounts HumCaptureButton for the actual take"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/HumFirstMoment.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "ReauthorPrompt reproduces 003-A's inline card: the owned-by-no-one chip, re-author as the primary (gradient) action, keep-as-is as the secondary, and the note-for-note-does-not-count closing line"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/ReauthorPrompt.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "AiEntryFlow renders conversational pacing (002-B) for isFirstEverAiEntry()===true and the two-door form with all five component chips (002-A) otherwise, keeps a walk-me-through-it-again link in two-door mode only, and names no AI tool/vendor in either mode"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/AiEntryFlow.test.tsx — AiEntryFlow — mode routing"
        status: pass
    human_judgment: false
  - id: D6
    description: "The receipt block renders exactly the four server-returned statements (citation, splits, release, Crate) verbatim, renders the server's re-author guidance when the safe citation was refused, and composes no citation of its own"
    requirement: S-01
    verification:
      - kind: unit
        ref: "components/catalogue/AiEntryFlow.test.tsx — AiEntryFlow — the receipt block"
        status: pass
    human_judgment: true
    rationale: "The receipt-rendering markup is fully unit-tested via the initialResult test seam, but the actual POST /api/works/[workId]/ai-entries round trip (fetch call, response shape, error path) is not exercised — this repo has no jsdom/fetch-mocking harness. Needs a manual filed-entry smoke test once plan 12 wires this flow into a live page, alongside 37-06's own already-flagged D2 for that same route."

duration: ~25min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 09: Hum Capture + the AI-Entry Flow + the Hygiene Nudges Summary

**Runtime-asked (never UA-sniffed) MediaRecorder codec selection feeding a mic-safe HumCaptureButton, the full-screen once-per-song deliberate minute and its recurring inline re-author sibling, and a conversational-first/two-door-after AI-entry flow whose receipt is always the server's own words.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-30T10:1x:xx-04:00 (context read — no explicit start marker recorded)
- **Completed:** 2026-08-30T10:34:15-04:00
- **Tasks:** 3/3 completed
- **Files modified:** 10 created (5 components/modules + 5 test suites)

## Accomplishments

- `lib/catalogue/hum-capture.ts` — `pickSupportedMimeType()` asks `MediaRecorder.isTypeSupported` at runtime (never the user agent) over an RESEARCH-ordered candidate list (Opus/WebM → MP4/AAC → bare AAC), with an injectable predicate so the suite runs with zero browser API present. `extensionForMime()` is re-exported from plan 06's `lib/catalogue/audio.ts` rather than reimplemented, and the module's own test imports `EXT_BY_MIME` to prove every candidate maps to an extension the upload route actually accepts.
- `components/catalogue/HumCaptureButton.tsx` — requests the mic, records with the picked (or browser-default) codec, posts the resulting blob to `POST /api/works/[workId]/versions` with `source: 'hum'` and the measured duration, and hands the created `WorkVersion` back via `onCaptured`. The microphone track is stopped on all four required exit paths (success, cancel, error, unmount); an unsupported browser renders nothing and tells the parent via `onUnsupported`; a denied/unavailable mic renders an inline error with an upload fallback, never a dead end.
- `components/catalogue/HumFirstMoment.tsx` — sketch 003-B's full-screen card, with the owner's verbatim headline ("Save and protect your idea by just humming or singing right now") and rule line ("Hum every melody you want to own, and the song is entirely yours."), the portable-asset framing with no tool named, the why folded behind the existing `LearnWhy` pattern (collapsed on first paint), and a skip that names its own cost. Mounts `HumCaptureButton` for the actual take and offers "attach an existing take" as the second path. The once-per-song gate is owned entirely by the parent (plan 12) — this component renders whenever mounted.
- `components/catalogue/ReauthorPrompt.tsx` — sketch 003-A's inline, recurring card: the "owned by no one" chip, "Re-author it" (primary, gradient) vs. "Keep as-is, disclosed" (secondary), and the note-for-note-replay-doesn't-count doctrine line.
- `components/catalogue/AiEntryFlow.tsx` — one component, two presentations, switched by `isFirstEverAiEntry()` (plan 03): sketch 002-B's chat pacing for the account's first-ever AI entry, sketch 002-A's two honest doors plus the five DDEX component chips (labels sourced from `lib/catalogue/ai-entries.ts`, never retyped) for every later entry, with a "walk me through it again" link back to the pacing in two-door mode only. "Not sure" routes into `HumFirstMoment`'s hum-evidence check rather than a softer label. The receipt block renders exactly what `POST /api/works/[workId]/ai-entries` returned — four statements, plus the server's re-author guidance on a refusal — and composes no citation of its own; DDEX vocabulary appears nowhere else in the file.
- All five suites (`hum-capture`, `HumCaptureButton`, `HumFirstMoment`, `ReauthorPrompt`, `AiEntryFlow`) pass via `renderToStaticMarkup` (this repo has no jsdom). Full repo suite: **315 suites / 3545 tests, all green** (baseline was 3475, climbing). `npx tsc --noEmit`: 0 errors. `npm run lint --max-warnings=0`: clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/catalogue/hum-capture.ts + HumCaptureButton.tsx** — `7e9eaa3` (feat)
2. **Task 2: HumFirstMoment.tsx + ReauthorPrompt.tsx** — `3c7da6e` (feat)
3. **Task 3: AiEntryFlow.tsx** — `1001a9d` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `lib/catalogue/hum-capture.ts` — `CANDIDATE_MIME_TYPES`, `pickSupportedMimeType()`, re-exported `extensionForMime()`
- `lib/catalogue/hum-capture.test.ts` — predicate injection, MP4-only branch, null-on-nothing-supported, no-browser-API-present, allow-list cross-check
- `components/catalogue/HumCaptureButton.tsx` — the microphone: request/record/post/release, with `isTypeSupported`/`initialError` test seams
- `components/catalogue/HumCaptureButton.test.tsx` — idle/unsupported/denied smoke states
- `components/catalogue/HumFirstMoment.tsx` — the full-screen once-per-song moment, mounting `HumCaptureButton`
- `components/catalogue/HumFirstMoment.test.tsx` — verbatim copy, honest skip, collapsed read-more, no-vendor-name
- `components/catalogue/ReauthorPrompt.tsx` — the inline, recurring re-author card
- `components/catalogue/ReauthorPrompt.test.tsx` — chip, both actions (primary first), closing line, no-vendor-name
- `components/catalogue/AiEntryFlow.tsx` — conversational/two-door routing, the shared `ReceiptBlock`
- `components/catalogue/AiEntryFlow.test.tsx` — mode routing, five chips, walk-me-through-it-again scoping, four-statement receipt, guidance rendering, no-vendor-name

## Decisions Made

- **`extensionForMime()` re-exported, not reimplemented.** `hum-capture.ts` imports plan 06's own MIME→extension mapper from `lib/catalogue/audio.ts` and re-exports it, so `HumCaptureButton` and this module's own test both reach for one name. A second, independently-maintained copy of that lookup would be exactly the kind of drift the plan's own key-link ("its output must map to an extension plan 06's `EXT_BY_MIME` accepts") warns against.
- **Test-only injectable props, documented as never-set-by-production.** With `testEnvironment: 'node'` and no jsdom/@testing-library/react-test-renderer anywhere in this repo, a click-driven state transition (denied permission, a filed receipt) cannot be exercised at all through `renderToStaticMarkup`. `HumCaptureButton.initialError` and `AiEntryFlow.initialResult` seed those states directly, mirroring `pickSupportedMimeType()`'s own injectable-predicate convention rather than inventing a bespoke mechanism, and are commented inline as test-only in both files.
- **AiEntryFlow's conversational Q1 reply bubble is generic ("Yes — AI was involved"), not sketch 002-B's specific worked example.** The sketch's own text ("an AI singer on the demo") is a worked illustration, not a fact this component instance actually knows about the artist's specific take. Inventing that specificity here would be the same failure mode the receipt-composition rule exists to prevent, just one level up — a plausible-sounding claim the component made up rather than one grounded in what it was actually told.
- **A captured hum from the "Not sure" path submits immediately as `mode: 'performance'` with that take's id as `humanSourceVersionId`.** The plan's own task-3 comment instruction frames "Not sure" as the when-in-doubt rule's UI expression — doubt resolved by work, not by wording — so once the work (the recording) exists, there is nothing left to ask; submitting immediately is the literal enactment of that rule rather than a judgment call layered on top of it.

## Deviations from Plan

None — plan executed exactly as written. All four items above are documented as decisions rather than deviations because none contradicts an explicit plan instruction; each fills in something the plan's task text left to implementation judgment (RESEARCH's own candidate order, the no-jsdom test environment's constraints, and the plan's own worked-example vs. grounded-claim distinction already implicit in the receipt-composition rule).

## Issues Encountered

**No jsdom, no `@testing-library/react`, no `react-test-renderer` in this repo.** Every component in this plan touches either a browser-only API (`MediaRecorder`, `getUserMedia`) or state that in a real app is reached only through a click (a denied permission, a filed receipt). `renderToStaticMarkup` — the pattern every prior `components/catalogue/*.test.tsx` file in this phase already established — only exercises a single, synchronous first render. Resolved by giving each affected component small, explicitly-documented injectable props (`isTypeSupported`, `initialError`, `initialResult`) that a production caller never sets, rather than attempting to fake DOM interaction the test harness cannot support.

## User Setup Required

None — no external service configuration required. `MediaRecorder`/`getUserMedia` are native browser APIs; no package-manager install was needed anywhere in this plan (threat T-37-SC: accepted, no install task exists).

## Next Phase Readiness

- `HumCaptureButton` is ready for plan 12's page to mount directly (from `ComposerCard`'s hum tile) and inside `HumFirstMoment`.
- `HumFirstMoment` is ready for plan 12 to gate on its own per-song "has this fired yet" fact — this component itself makes no such decision, by design.
- `ReauthorPrompt` is ready for plan 12's page to mount next to a specific AI-generated diary entry, outside `DiaryFeed` itself (which stays clean per its own header comment).
- `AiEntryFlow` is ready for plan 12 to mount from the add-audio/add-lyrics flows, supplying `priorAiEntryCount` from its own already-fetched data and `humanSourceVersionId` from whichever version the artist is pointing at.
- **Owner device test still pending (plan 13, not this plan's scope).** RESEARCH's own assumption log (A1/A2) flags the WebM/MP4 codec-support and cross-browser-playback claims behind `CANDIDATE_MIME_TYPES`' order as sourced from secondary references, not a live device this session — `pickSupportedMimeType()`'s runtime-ask design means the worst case of a wrong assumption is a suboptimal codec pick, never a broken recorder, but real-device verification (Chrome desktop, iPhone Safari) remains plan 13's job, not this one's.
- No blockers.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 10 created files verified present on disk; all 3 task commits (7e9eaa3, 3c7da6e, 1001a9d) verified present in `git log --oneline --all`.
