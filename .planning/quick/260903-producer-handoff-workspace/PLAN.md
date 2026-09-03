# Producer Handoff Workspace — Plan

## Objective

Turn the existing producer send/receive/return loop into an optional, action-oriented production workspace inside the Writer's Room and producer inbox, without converting creative collaboration into a required approval pipeline.

## Scope

- Add a compact in-room handoff timeline with Sent → Received/Working → Returned → Reviewed stages, version lineage, needs-attention summary, current-first ordering, and collapsed history.
- Capture an optional production brief: round label, BPM, musical key, reference URL, existing freeform direction, and selected unresolved timed comments.
- Let the producer respond to each selected feedback item on return with Done, Tried another way, Let's discuss, or no response.
- Add optional Working on it and cooldown-protected Nudge actions with private notifications.
- Add returned-mix playback/download/compare actions, deep links from notifications, a mobile priority action, a copyable private recap, and a technical manifest.
- Add privacy-limited activity indicators for listening and comparing; store only the latest timestamp per actor/action and never place this activity in the diary.
- Add an opt-in approximate loudness-match control to A/B comparison, computed in the browser and never persisted as an audio or mastering fact.

## Files expected to change

- `supabase/migrations/168_producer_handoff_workspace.sql` and migration contract tests
- Producer handoff/return helpers and tests
- Handoff complete, return, progress, nudge, and activity API routes
- `RecordOverBeatStudio`, `ProducerInbox`, `VersionComparisonPanel`, `WorkPage`, and their tests
- Writer's Room and producer inbox server pages
- New `ProducerHandoffTimeline` component and tests
- This quick task's `SUMMARY.md`

## Validation plan

- Unit-test brief normalization, feedback response validation, status/attention derivation, recap/manifest output, loudness gain calculation, and nudge cooldown presentation.
- Static-test least-authority migration grants, recipient/member validation, append-only feedback snapshots, private activity, and the absence of formal approval/master fields.
- Test server route identity binding and notification deep links.
- Run focused Jest, TypeScript, zero-warning ESLint, the complete Jest suite, production Next.js build, and `git diff --check`.

## Risks and coordination notes

- Migration 168 depends on migrations 165–167 and remains a human-applied deployment step.
- Every new field and action is optional. Missing brief metadata, feedback responses, progress, or review must never block return uploads or continued songwriting.
- Reference links accept only `http`/`https`; user text is rendered by React and copied as plain text.
- Activity is room-private, low-resolution, latest-only context—not an analytics or surveillance log.
- Review language remains creative direction only: no Approved, Rejected, Final, Master, rights, splits, registration, or release state.
- Manual GSD quick fallback is used because Codex cannot invoke Claude's native `/gsd-quick` command in this environment.
