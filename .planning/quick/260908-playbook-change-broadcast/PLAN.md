# Release 16 — Internal Playbook Change Broadcast

## Objective

Close the internal doctrine lifecycle by giving Funūn Team Members a targeted, searchable place to understand newly published Playbook guidance and revisions. The surface must remain inaccessible to Member, guest, signature-recipient, and Client Partner identities.

## Scope

- Add a human-gated candidate schema for revision-linked change broadcasts, role/person targeting, and per-Team-Member read state.
- Add server-side audience and room-access filtering helpers with tests.
- Add a staff-only Updates page and navigation entry.
- Add an authoring control for Leadership and Playbook room leads to publish a structured update containing what changed, why it matters, effective date, urgency, and required action.
- Connect required broadcasts to the existing revision-specific reading-assignment system instead of inventing a second acknowledgement mechanism.
- Add a personalized preview of unread updates to My Playbook.
- Fail gracefully while the candidate schema remains unapplied.

## Files Expected to Change

- `.planning/quick/260908-playbook-change-broadcast/205_playbook_change_broadcasts.sql`
- `lib/playbook/change-broadcasts.ts` and tests
- `app/api/admin/playbook/updates/**`
- `app/(admin)/admin/playbook/updates/page.tsx`
- `components/playbook/ChangeBroadcastCenter.tsx`
- `components/playbook/ChangeBroadcastForm.tsx`
- `app/(admin)/admin/playbook/[room]/[slug]/page.tsx`
- `app/(admin)/admin/playbook/my/page.tsx`
- `components/playbook/MyPlaybookWorkspace.tsx`
- `components/playbook/Rail2.tsx`

## Validation Plan

- Unit-test audience filtering, urgency ordering, unread classification, and schema-missing detection.
- Route-test strict payload validation and Team-Member-only authorization where practical.
- Run targeted Jest, TypeScript, ESLint, and migration text checks.
- Run the full Jest suite if targeted checks pass.

## Risks / Coordination Notes

- The shared worktree contains ongoing, uncommitted Playbook work. Changes will be additive and limited to the Release 16 surface.
- Migration 200 is applied for Antenna hardening; 203 is permanently retired; 208–209 belong to Phase 38.0.3; 210 is reserved for Phase 38.0.3 Tier 3; and Phase 38.2 moves to 211–212. Playbook candidates 201, 202, 204, and 205 remain unapplied; candidate 205 stays outside `supabase/migrations` until the owner explicitly approves the sequence.
- No migration, commit, push, or deployment is authorized by this build request.
