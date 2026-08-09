---
phase: 27-artist-invite-only-onboarding
plan: 03
subsystem: ui
tags: [react, nextjs, tailwind, collaborators]

requires:
  - phase: 27-artist-invite-only-onboarding (plan 01)
    provides: artist_invites/artist_waitlist schema + signup gate
  - phase: 27-artist-invite-only-onboarding (plan 02)
    provides: shared rate-limit/turnstile/esc primitives
provides:
  - "Default-on collaborator-side invite prompt (D-08a) — the third of D-08's three invite pathways"
  - "CollaboratorRoster wiring that mounts the prompt only for newly-created, email-bearing collaborators"
affects: [collaborators, invite-flow]

tech-stack:
  added: []
  patterns:
    - "Inline (non-modal) transient panel convention, matching CollaboratorForm's inline-swap style"
    - "UI component delegates all network I/O to an injected callback prop (onSend) rather than owning fetch — keeps the send action single-sourced in CollaboratorRoster.handleInvite"

key-files:
  created:
    - components/collaborators/CollaboratorInvitePrompt.tsx
  modified:
    - components/collaborators/CollaboratorRoster.tsx

key-decisions:
  - "New-vs-edit detection for the post-save prompt reads membership from the pre-save `list` closure state (not the setList updater), avoiding a mutate-inside-updater anti-pattern while staying correct for the roster's single-user, sequential save flow."
  - "Prompt mounts at the top of the roster list (above the card grid) rather than inline per-row, matching the plan's explicit \"or at the top of the roster list\" fallback — simpler and avoids needing to track row position after the list's alphabetical re-sort."

requirements-completed: [INVITE-04]

coverage:
  - id: D1
    description: "CollaboratorInvitePrompt renders default-checked, uses the reserved bg-grad/shadow-cta gradient for Send invite and a text-only Not now, and delegates sending entirely to its onSend prop"
    requirement: "INVITE-04"
    verification:
      - kind: unit
        ref: "npm run build (Next.js production build, compiles clean)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (clean)"
        status: pass
    human_judgment: true
    rationale: "Visual/interaction correctness (default-on checkbox state, gradient rendering, dismiss/send/error UX) requires a human or browser-driven check — no test framework exists in this repo to assert rendered DOM/visual state."
  - id: D2
    description: "CollaboratorRoster.handleSaved mounts the prompt only for newly-created collaborators with a non-empty email, never for edits or email-less collaborators, and never blocks the save"
    requirement: "INVITE-04"
    verification:
      - kind: unit
        ref: "npm run build (Next.js production build, compiles clean)"
        status: pass
    human_judgment: true
    rationale: "Behavioral branching (new-vs-edit, email presence) is best confirmed by exercising the actual create/edit flow in the running app; no test framework exists in this repo."

duration: 8min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 03: Collaborator-side Invite Prompt Summary

**Default-on "Invite {first name} to Funūn?" prompt that appears inline after saving a new collaborator with an email, reusing the existing `/api/collaborators/[id]/invite` send action via a new `CollaboratorInvitePrompt` component.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-09T02:31:00-04:00
- **Completed:** 2026-08-09T02:35:02-04:00
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Built `CollaboratorInvitePrompt.tsx`: inline (non-modal) panel with a pre-checked toggle, brand-gradient "Send invite" primary action, text-only "Not now" secondary action, present-participle "Sending…" state, rose error block, and auto-dismissing "Invite sent ✓" confirmation.
- Wired `CollaboratorRoster.handleSaved` to detect a newly-created collaborator with a non-empty email and mount the prompt without gating the save — the row is committed to `list` in the same call regardless of prompt outcome.
- Prompt's `onSend` delegates to the existing `handleInvite(id)` function, which already POSTs to `/api/collaborators/[id]/invite` — no new send mechanism introduced (per UI-SPEC surface 4 and threat T-27-09's disposition).

## Task Commits

Each task was committed atomically:

1. **Task 1: CollaboratorInvitePrompt.tsx — default-on inline invite prompt** - `23988a5` (feat)
2. **Task 2: Wire the prompt into CollaboratorRoster's post-save flow** - `d2fa69c` (feat)

**Plan metadata:** (this commit) `docs(27-03): complete Collaborator-side Invite Prompt plan`

## Files Created/Modified
- `components/collaborators/CollaboratorInvitePrompt.tsx` - New default-on inline invite prompt component; props `{ collaboratorName, onSend, onDismiss }`.
- `components/collaborators/CollaboratorRoster.tsx` - Added `invitePromptFor` state, new-vs-edit detection in `handleSaved`, and prompt mount point above the roster card grid.

## Decisions Made
- New-vs-edit detection reads from the pre-save `list` closure (`!list.some(c => c.id === saved.id)`) computed before `setList` runs, rather than mutating a flag inside the `setList` updater function — cleaner and avoids relying on updater side effects.
- Prompt renders at the top of the roster list (not per-row) — the plan explicitly allowed either placement ("near the just-saved row (or at the top of the roster list)"); top-of-list is simpler given the list re-sorts alphabetically after every save.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All three D-08 invite pathways for collaborators are now in place: the explicit `CollaboratorCard` "Invite" button (pre-existing), resend via the card's ⋯ menu (pre-existing), and this default-on post-save prompt (new).
- No blockers for subsequent Phase 27 plans; this plan had no dependents declared (`depends_on: []`) and touched only `components/collaborators/*`.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

- FOUND: components/collaborators/CollaboratorInvitePrompt.tsx
- FOUND: components/collaborators/CollaboratorRoster.tsx
- FOUND: commit 23988a5
- FOUND: commit d2fa69c
