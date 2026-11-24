---
phase: 261118-ryb
plan: 01
subsystem: security
tags: [csp, middleware, content-security-policy, nextjs, dev-only]

requires: []
provides:
  - "lib/security/csp.ts exporting buildContentSecurityPolicy({ nonce, allowUnsafeEval }) — pure CSP builder"
  - "Dev-only 'unsafe-eval' relaxation gated on process.env.NODE_ENV !== 'production', wired at the single middleware.ts call site"
  - "Full-string-equality test pinning the production CSP against a policy captured from the running app before this change"
affects: [middleware, marketing-root-route]

tech-stack:
  added: []
  patterns:
    - "CSP directive list extracted to a pure builder function; middleware.ts owns only the per-request nonce and the environment gate argument"

key-files:
  created:
    - lib/security/csp.ts
    - lib/security/csp.test.ts
  modified:
    - middleware.ts
    - __tests__/marketing-root-route.test.ts

key-decisions:
  - "Extracted the policy into lib/security/csp.ts rather than inlining a ternary in middleware.ts, per the plan's design_notes decision 1 — behavioural verification requires the actual emitted policy string for both modes, and middleware.ts cannot be invoked directly without substantial @supabase/ssr + next/server mocking"
  - "allowUnsafeEval is a single explicit parameter, read nowhere else; the builder is pure and never reads process.env itself, so there is no second place the dev/prod decision can hide (label-integrity: the parameter must actually decide the outcome)"
  - "middleware.ts delegates with allowUnsafeEval: process.env.NODE_ENV !== 'production' — the same NODE_ENV expression the file already relies on elsewhere"

requirements-completed: [261118-ryb]

coverage:
  - id: D1
    description: "lib/security/csp.ts exports buildContentSecurityPolicy; production-mode output is byte-for-byte identical to the pre-change policy captured from the running dev server"
    verification:
      - kind: unit
        ref: "lib/security/csp.test.ts#matches the frozen production policy byte-for-byte when allowUnsafeEval is false"
        status: pass
      - kind: unit
        ref: "lib/security/csp.test.ts#does NOT contain unsafe-eval in the production-mode string"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dev-mode output appends exactly one token, 'unsafe-eval', to script-src and no other byte changes"
    verification:
      - kind: unit
        ref: "lib/security/csp.test.ts#appends 'unsafe-eval' to script-src when allowUnsafeEval is true"
        status: pass
      - kind: unit
        ref: "lib/security/csp.test.ts#stripping the single token \" 'unsafe-eval'\" from the dev-mode string yields the production-mode string exactly"
        status: pass
    human_judgment: false
  - id: D3
    description: "middleware.ts wires the dev-only gate at a single call site (process.env.NODE_ENV !== 'production'), source-text locked so a later edit can't hardcode it on"
    verification:
      - kind: unit
        ref: "__tests__/marketing-root-route.test.ts#keeps script-src nonce-based, pins the exact script-src and frame-src source lists, and pins the dev-only unsafe-eval gate at the call site"
        status: pass
    human_judgment: false
  - id: D4
    description: "React hydrates on localhost (no EvalError), and the sign-in form submits through its client handler instead of a native page reload"
    verification: []
    human_judgment: true
    rationale: "Only a browser can confirm the DOM-hydration symptom the user reported; the dev server serving localhost:3000 is the primary checkout, not this worktree, so this executor cannot curl the post-merge header or load the browser itself. Deferred to Task 3 (checkpoint:human-verify, gate=\"blocking\"), to run after this branch merges into the primary checkout."

duration: ~25min
completed: 2026-11-20
status: complete
---

# Phase 261118-ryb: Dev-only CSP unsafe-eval guard Summary

**Extracted `lib/security/csp.ts` as a pure CSP builder; appends `'unsafe-eval'` to `script-src` only when `allowUnsafeEval` is true, wired at middleware.ts's single call site via `process.env.NODE_ENV !== 'production'`, with the production policy pinned byte-for-byte against a pre-change capture from the running app.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 of 3 completed (Task 3 is `checkpoint:human-verify`, handed back per plan)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `lib/security/csp.ts` exports `buildContentSecurityPolicy({ nonce, allowUnsafeEval })`, carrying all fourteen directive strings moved verbatim from `middleware.ts`, same order, same `.join('; ')`
- `middleware.ts` now delegates to the builder, passing `allowUnsafeEval: process.env.NODE_ENV !== 'production'` as the single decision point
- `lib/security/csp.test.ts` proves full-string equality against the pre-change production policy (captured from the live dev server via curl before any edit), proves the dev-mode delta is exactly one appended token, and proves the nonce is interpolated into `script-src` and nowhere else
- `__tests__/marketing-root-route.test.ts`'s stale source-text lock was retargeted to `lib/security/csp.ts` for the moved literals, plus two new assertions pinning the `buildContentSecurityPolicy({` call and the `allowUnsafeEval: process.env.NODE_ENV !== 'production'` argument at the `middleware.ts` call site — so a later edit cannot hardcode the relaxation on
- Full automated Verification Gate (the subset runnable inside this isolated worktree) is green: `typecheck:strict`, `lint` (`--max-warnings=0`), `test -- --runInBand` (8451/8451 passing), `security:migrations:verify`

## Task Commits

1. **Task 1: Capture the ground-truth policy, then extract it behind a dev-only gate** - `f479aa3e` (feat) — capture itself was pre-done by the orchestrator before this agent started (see Deviations)
2. **Task 2: Assert the emitted policy for both modes; retarget the stale source-text pin** - `c9e2bb4e` (test)

**Plan metadata:** pre-committed at base `5f21ee57` (docs: pre-dispatch plan) — this plan file was already on disk at the worktree's base commit, so no separate plan-commit was needed here.

_Note: Task 2 is `tdd="true"`; `c9e2bb4e` is a single combined test commit (RED+GREEN together) because the task is a pure assertion-authoring task over an already-implemented builder from Task 1, not a RED→GREEN cycle against not-yet-written behavior._

## Files Created/Modified

- `lib/security/csp.ts` - Pure `buildContentSecurityPolicy({ nonce, allowUnsafeEval })`, fourteen directives verbatim, dev-only `'unsafe-eval'` append
- `lib/security/csp.test.ts` - Byte-for-byte production pin, dev-mode delta proof, nonce-interpolation proof
- `middleware.ts` - Imports and delegates to `buildContentSecurityPolicy`; all downstream logic (`buildForwardedRequestHeaders`, `createPassThroughResponse`, `respondWithAuthState`, matcher) untouched
- `__tests__/marketing-root-route.test.ts` - Retargeted the script-src/frame-src source-text lock to `lib/security/csp.ts`; added the `allowUnsafeEval` call-site pin

## Decisions Made

- Followed all three locked `design_notes` decisions in the plan exactly as written: extraction over inline ternary, single pure-function gate with no second environment read, and comment ownership split between `middleware.ts` (why CSP lives in middleware) and `lib/security/csp.ts` (why each directive exists, including the Turnstile reasoning).
- Per the task 1 amendment, the ground-truth capture (`csp-before.txt`) was not re-run; its content was read and cross-checked byte-for-byte against the prompt's transcription before use — they matched exactly, so no disagreement to report.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2. One procedural amendment, not a deviation from the code: Task 1's capture step was pre-completed by the orchestrator (per `<task_1_amendment__read_this_first>`), so this agent began Task 1 at "THEN create `lib/security/csp.ts`" and only re-verified the capture file's non-emptiness and nonce placeholder before proceeding, as instructed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 3 (`checkpoint:human-verify`, `gate="blocking"`) is the only remaining step: the live post-merge `curl` diff against `csp-before.txt` and the browser confirmation that React hydrates and `/signin` submits through its client handler. Both require the primary checkout's dev server and a human browser session, neither of which this isolated worktree executor can reach — handed back to the orchestrator/owner per the plan's own instruction not to self-approve this checkpoint.
- All four automated gate commands this executor could run (`typecheck:strict`, `lint`, `test -- --runInBand`, `security:migrations:verify`) are green on this branch.

---
*Phase: 261118-ryb*
*Completed: 2026-11-20*
