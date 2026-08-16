---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 01
subsystem: watermark
tags: [typescript, watermark, content-protection, interface, decision-record]

# Dependency graph
requires: []
provides:
  - "lib/watermark/provider.ts — WatermarkProvider interface (async renderStreamPreview / renderForensicDownload), WatermarkRenderStatus union, share-token-keyed forensic input (D-03)"
  - "lib/watermark/README.md — LOCKED approach + audible-tag decision record (owner-approved 2026-08-16)"
provides-decision:
  - "Watermark approach LOCKED: in-house (no package installed), async/pre-computed renders; Vercel Hobby confirmed (async required)"
affects: [31-12, 31-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-protection contract as an interface-only module (no method bodies) that both the render pipeline (31-12) and player (31-13) import — the render input takes the master path but returns a NEW private-bucket path, making the R12 'never a clean master' guarantee expressible at the type boundary (T-31-01)"

key-files:
  created: [lib/watermark/provider.ts, lib/watermark/README.md]
  modified: []

key-decisions:
  - "OWNER-LOCKED (2026-08-16): stream preview = soft sub-audible tonal pulse; forensic download = inaudible encode carrying the Selects + recipient share-token (D-03). In-house (ffmpeg-class tone injection + spread-spectrum/LSB encode) chosen over a third-party forensic service — no vendor lock-in, no per-render cost, payload shape under our control. No watermarking package installed."
  - "Renders are async/Promise-returning and PRE-COMPUTED (once per (track, share_token), stored to a private bucket, served by signed URL) — never inline in a request handler. Vercel tier confirmed Hobby (10s cap), so this is a hard requirement for 31-12 (Pitfall 5)."
  - "Sequencing (A2) accepted by owner: the stream-preview tag + play/react/approve player flow ships first; the forensic-download feature is a fast-follow if the in-house spike runs long."

patterns-established:
  - "lib/watermark/ is the content-protection module home; 31-12 implements WatermarkProvider against provider.ts and the player (31-13) signs only the returned render path, never the master path."

requirements-completed: [R12, D-01, D-03]

coverage:
  - id: D1
    description: "A single named module declares the WatermarkProvider async render contract (stream-preview + share-token-keyed forensic download); the approach + audible-tag character are an explicit owner-locked decision; no watermarking dependency was installed before the Package Legitimacy Gate cleared."
    requirement: "R12, D-01, D-03"
    verification:
      - kind: static
        ref: "npx tsc --noEmit (interface type-checks, no missing-import errors)"
        status: pass
      - kind: manual
        ref: "Task 2 blocking-human checkpoint — owner approved the recommended default + confirmed Vercel Hobby (2026-08-16)"
        status: pass
    human_judgment: true

duration: 5min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 01: Watermark Contract + Approach Lock Summary

**`WatermarkProvider` async render contract (stream-preview + share-token-keyed forensic download) plus an owner-locked approach decision — in-house, async/pre-computed, no package installed — so 31-12 (render) and 31-13 (player) build against a stable, content-protection-safe interface.**

## Performance

- **Duration:** ~5 min (Task 1) + blocking-human checkpoint (Task 2)
- **Tasks:** 2 (1 auto + 1 blocking-human checkpoint, resolved)
- **Files modified:** 2 (all new)

## Accomplishments
- `lib/watermark/provider.ts` — the `WatermarkProvider` interface with two async methods (`renderStreamPreview`, `renderForensicDownload`), a `WatermarkRenderStatus` union (pending/ready/failed), and a forensic input carrying `shareToken` (D-03). Interface-only (no method bodies), no import of any not-yet-installed package; `npx tsc --noEmit` clean.
- `lib/watermark/README.md` — the approach + audible-tag decision record, now **LOCKED** (owner-approved) rather than flagged A2.
- The type boundary makes the "never a clean master" guarantee (R12/T-31-01) expressible: the render input takes the master path but returns a NEW private-bucket path — the player may sign only the returned path.

## Task Commits

1. **Task 1: Define the WatermarkProvider interface + approach decision** - `bb3e4b4` (feat)
2. **Task 2: Approach lock + Package Legitimacy checkpoint** - resolved at checkpoint (owner approved the recommended in-house/async default; Vercel Hobby confirmed; no package proposed or installed, so the Package Legitimacy Gate had nothing to clear)

Plus the decision-record lock-in commit (README status → LOCKED, Vercel tier confirmed).

## Files Created/Modified
- `lib/watermark/provider.ts` - `WatermarkProvider` interface + `WatermarkRenderStatus` + async render contract
- `lib/watermark/README.md` - approach + audible-tag decision record (LOCKED 2026-08-16)

## Decisions Made
- **Approach (owner-locked):** in-house watermarking — soft sub-audible tonal pulse for the stream preview, inaudible forensic encode (Selects + share-token payload) for the download; chosen over a third-party service. No package installed.
- **Architecture:** async, pre-computed renders stored to a private bucket and served by signed URL; Vercel Hobby (10s cap) confirmed, so this is required (not optional) for 31-12.
- **Sequencing (A2):** stream-preview + play/react/approve ships first; forensic download is a fast-follow.

## Deviations from Plan

None — plan executed as written; the checkpoint resolved with the recommended default approved as-is.

## Issues Encountered

None.

## User Setup Required

None — no package installed, no external service configured. (If a third-party watermarking package is ever named for 31-12, it must clear the Package Legitimacy Gate before install.)

## Next Phase Readiness

31-12 can implement `WatermarkProvider` against `provider.ts` using the locked in-house async approach; 31-13 signs only the returned render path. No blockers.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: lib/watermark/provider.ts
- FOUND: lib/watermark/README.md
- FOUND: bb3e4b4 (feat — WatermarkProvider contract + approach decision)
- CONFIRMED: Task 2 blocking-human checkpoint resolved (owner-approved default, Vercel Hobby, 2026-08-16)
