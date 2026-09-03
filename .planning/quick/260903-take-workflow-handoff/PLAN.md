# Take Workflow and Producer Handoff — Quick Build Plan

## Objective

Ship the three approved small Writer's Room builds as one coherent path: name a take, choose the room's current working take, and hand an aligned dry vocal plus its rough mix to a specific room member.

## Scope

- Add contributor-authorized take-label editing while keeping archival authority with the take creator or room owner.
- Add one work-level `working_version_id` pointer, validate it belongs to the same work and is active, and keep it explicitly separate from Song Passport master designation or approval.
- Put the working take first in the room, mark it clearly, use it as the preferred A/B comparison side, and make its record-over action easiest to reach.
- Let a vocal-session creator select a claimed Writer's Room member, add an optional note, and save/send the rough take with a dry WAV stem aligned from `0:00`.
- Persist an immutable producer-handoff record, notify the selected recipient, and render secure rough/stem downloads in the private song diary.
- Preserve raw microphone clips, the original beat, version history, comments, rights, splits, and formal master state.

## Files Expected to Change

- `components/catalogue/WorkPage.tsx`, `TimedTrackPlayer.tsx`, `RecordOverBeatStudio.tsx`, `DiaryFeed.tsx`, and comparison UI
- `app/(artist)/vault/works/[workId]/page.tsx`
- Version and recording-session API routes plus new handoff upload routes
- Catalogue audio/take/handoff helpers, shared catalogue types, and tests
- `supabase/migrations/165_writer_room_take_workflow_handoff.sql`
- This plan and its completion summary

## Validation Plan

- Unit-test take ordering/labels, preferred comparison defaults, handoff path validation, dry-stem rendering, and diary presentation.
- Add a static migration contract test for same-work working-take validation, immutable member-only handoffs, diary capture, and least-authority grants.
- Run focused tests, full Jest, TypeScript, zero-warning lint, production build, and `git diff --check`.

## Risks and Coordination

- Migration 165 depends on migrations 162–164 and must be applied before the updated page/API is deployed.
- A working take is a shared creative pointer only; it must never write Song Passport master, split, rights, registration, metadata approval, or release state.
- Handoff objects use short-lived signed URLs after access is resolved; no public link or permanent storage credential is created.
- A recipient must be a currently claimed owner/member of the work. Pending invitees cannot receive a handoff notification yet.
- The dry stem applies comp placement, trims, mute state, and timing compensation at unity vocal gain without adding the backing track.
