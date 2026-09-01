# Writer's Room Section Soft Locks — Build Summary

## Outcome

Stage 2 Writer's Room collaboration is implemented in code. Multiple writers can edit different lyric sections at the same time, while a collision on the same section becomes visible and intentional instead of silently overwriting someone else's work.

Migration 144 was applied on 2026-09-01. Automated production UAT against the live Supabase project passed every lease, authorization, attribution, canonical-data and private-broadcast check. A signed-in, three-session visual acceptance test remains the final UI gate.

## What shipped

- A server-only `work_lyric_block_locks` lease table with one active 30-second lease per lyric block.
- Atomic database functions for claim, same-tab renewal, explicit takeover, exact-session release and lease-enforced lyric saves.
- Authenticated lyric saves preserve the editing collaborator as the diary actor while still requiring the exact server-issued user-and-tab lease.
- Authenticated lock-list and lock claim/release API routes using the existing canonical work owner/member authorization decision.
- A canonical lyric-block GET path so remote clients re-read saved words from Funūn instead of trusting browser broadcasts.
- Private Realtime broadcast authorization on the same strictly parsed Writer's Room work topic used for Presence.
- Per-tab lock identities, ten-second visible-tab renewal and automatic expiry for dropped, hidden or abandoned sessions.
- Lyric-card states for Available, Reserving, You're editing and “Maya is editing.”
- Wait behavior plus a two-step warned takeover action.
- A blur sequence that flushes pending lyric text before releasing the section lease.
- Live `lock_changed` and `lyric_saved` invalidation hints. Receivers fetch authenticated canonical state; broadcasts never carry trusted lyric or rights data.
- Reconnect reconciliation re-reads every visible lyric section and current leases; a ten-second canonical lock check also repairs a missed lock broadcast.
- Presence heartbeats and 45-second stale-meta filtering to bound the ghost-presence edge case found during production UAT of migration 143.

## Product boundary preserved

This live system controls lyric text only. It does not collaboratively mutate split percentages, contracts, legal names, identities, rights, approved metadata, release identifiers, audio files or executed agreements. Those facts remain under explicit review and approval workflows.

The feature is deliberately section-level, not character-level. Funūn does not claim Google Docs-style merging. If two writers want the same section, one waits or intentionally takes over after a warning.

## Why this implementation

Short database leases make the server—not a potentially stale browser—the authority on who may save a section. A tab session ID distinguishes two tabs owned by the same user. Soft locks keep parallel creative work fast while eliminating silent same-section overwrites without the cost and risk of a CRDT/OT text engine.

Realtime is used as a fast notification layer only. Re-fetching the canonical lock or lyric row after a live hint protects the room from malformed, stale or untrusted client payloads and keeps the database as the source of truth.

## User impact

- Peter can edit Verse 1 while Maya edits the Chorus immediately.
- Each writer sees who is working in the room and who currently holds a lyric section.
- Opening a free section reserves it automatically.
- Opening a held section shows “Maya is editing Verse 1” and offers wait or an intentional, warned takeover.
- Saved lyric changes appear for collaborators without a manual refresh.
- A disconnected editor stops renewing; the section becomes available after the short lease expires.
- If a save loses its lease race, the local words remain visible with a warning so the writer can copy them instead of seeing them disappear.

## Verification

- Focused collaboration tests: 27/27 passed across six suites.
- TypeScript: `npm run typecheck` passed.
- Focused ESLint: passed with zero warnings.
- Production build: `npm run build` passed, including the new lock routes.
- Full repository Jest: 3,668/3,671 passed. The only three failures are pre-existing stale `WorkPage` copy expectations for “Add to this song —” and “Next for this song:” while the current UI already renders changed copy. They are unrelated to section locking and were left untouched to preserve concurrent user/Claude work.

### Production UAT — 2026-09-01

Passed against the live Supabase project after migration 144:

- migration/table availability;
- two writers claiming different lyric sections;
- same-section collision refusal with the current holder identified;
- explicit takeover;
- rejection of a displaced writer's stale save;
- exact-user-and-tab release, including refusal of a wrong-session release;
- automatic recovery after the 30-second lease expires;
- non-member denial;
- direct authenticated access to the server-only lock table denied;
- authorized private `lock_changed` broadcast delivered between members;
- outsider private-room subscription denied;
- owner, collaborator and takeover edits attributed to the correct diary actor;
- canonical final lyric text matched the accepted save order.

The UAT used three temporary users and one temporary work. Final cleanup verification returned zero remaining test works, zero remaining test users and no cleanup failures.

## Activation gate

Completed:

1. Migration 144 applied.
2. Automated three-user database and private-channel UAT passed.

Remaining:

1. Confirm the deployment containing commit `985d589` is live.
2. Run signed-in visual UAT in three browser sessions:
   - three users enter one Writer's Room;
   - two users edit different sections and both save;
   - two users collide on one section and verify wait/takeover;
   - one user disconnects and the lease expires without overwriting another writer;
   - a saved lyric appears in the other sessions without refresh;
   - splits, contracts, metadata and rights remain outside live editing.

## Follow-on safety layer

Recoverable lyric snapshots and version restoration are now implemented in code. See `.planning/quick/260901-writers-room-lyric-snapshots/SUMMARY.md` for the build report, product boundary, verification and production activation gate. Migration 145 and signed-in production UAT remain before the snapshot feature can be described as live.

After that activation gate, comments, suggestions and intentional alternate lyric versions are the next creative-collaboration slice. Do not widen live editing or recovery into legal or release facts.
