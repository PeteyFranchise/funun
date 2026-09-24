# Plan: Writer's Room Live Sessions and DAW Bridge

**Date:** 2026-09-23
**Type:** planning-only documentation
**Implementation:** out of scope for this task

## Objective

Lock the owner's approved Writer's Room direction and create Claude-executable phase plans for room
members/presence, persistent room chat, managed video and DAW screen sharing, synchronized stored-take
playback, direct DAW audio transfer through Funūn Bridge, and research-gated native plugin/recording work.

## Scope

- Promote the existing presence/chat discussion record from exploratory to owner-approved direction.
- Add the video-provider, cost-control, screen-sharing, audio-quality, and no-recording-v1 decisions.
- Correctly distinguish the shipped DAW marker-export direction from a new native DAW connector.
- Plan a desktop companion that removes manual file handling while retaining a safe temporary spool.
- Add roadmap phases and detailed execution slices with dependencies, acceptance tests, and human gates.

## Files expected to change

- `.planning/reviews/CODEX-DESIGN-260923-writers-room-presence-and-chat.md`
- `.planning/reviews/CODEX-PLAN-260923-writers-room-live-sessions-daw-bridge.md`
- New phase context/plan files under phases 44, 44.1, 44.2, 45, 45.1, and 45.2.
- `.planning/ROADMAP.md`.
- This quick task's `PLAN.md` and `SUMMARY.md`.

## Hard boundaries

- Production remains at migration 227. Migration 228 is reserved and unavailable.
- Every migration is human-gated and unassigned until execution-time preflight.
- No video provider, native application, plugin dependency, schema, or product code is installed here.
- Managed video infrastructure only; no self-hosted SFU for the beta.
- Video is on-demand, not joined automatically; session recording is off and research-gated.
- Screen-share/call audio is reference-quality and cannot become a master, approval, or uploaded take.
- Generic chat/video activity cannot establish authorship, credit, split, ownership, or approval.
- Large automated audio ingestion cannot ship before storage attribution/admission controls are ready.
- Preserve unrelated work already present in the worktree.

## Validation

- Confirm every roadmap plan identifier maps to an existing plan file.
- Confirm contexts distinguish locked decisions from human/research gates.
- Confirm recording/plugin work is explicitly not approved for implementation.
- Confirm all migration plans say unassigned, human-gated, and migration 228 unavailable.
- Confirm no application code, package dependency, migration, or production state changes.
- Run `git diff --check`.
