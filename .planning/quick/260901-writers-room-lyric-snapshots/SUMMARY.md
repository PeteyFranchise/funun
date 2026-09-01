# Writer's Room Recoverable Lyric Snapshots — Build Summary

## Outcome

Stage 3 Writer's Room safety is live in production. Every editable lyric section now has a private recovery history, and a writer can restore an earlier accepted version without silently destroying the current one.

Migration 145 was applied on 2026-09-01. Automated production checks and a signed-in browser acceptance test passed against the deployed Funūn application. A separate multi-member visual session remains useful follow-up evidence for the live-refresh experience, but the recovery-history and restore capability itself is production-verified.

## What shipped

- An append-only `work_lyric_block_snapshots` store scoped to a specific work and lyric section.
- One recovery baseline per continuous section-editing reservation, even though the pad may autosave several times during that session.
- A fresh edit-cycle identity whenever a writer leaves a section and returns later, the lease expires, or another writer intentionally takes over.
- Snapshot capture only when accepted text actually changes; opening a section or saving identical text creates no surveillance-style noise.
- A private history API that rechecks owner/member access, verifies the block belongs to the requested work and returns at most 50 newest recovery points.
- Member-friendly attribution such as “Saved before Maya edited this section,” without exposing internal capture keys.
- An atomic restore API and database function that require the restoring tab to hold the exact active section soft lock.
- A database guard that rejects direct lyric-text updates outside the approved locked-save, restore and detach functions, closing the old RLS-only bypass around section leases.
- A scoped detach function that preserves “Detach to vary” without reopening general direct-text writes or adding a duplicate ordinary-edit diary event.
- Pre-restore preservation: the current lyric text becomes another recovery point before an older version replaces it.
- A distinct song-diary line such as “Maya restored Verse,” with the plain consequence that the displaced words remain recoverable.
- A `History` action on each original lyric section, current and prior text previews, empty/loading/error states, a two-step restore confirmation and a success toast.
- Canonical live-room invalidation after a restore so collaborators re-fetch the restored words without manually refreshing.
- Pending lyric autosave is flushed before History opens, ensuring the newest accepted baseline is available in the panel.

## Why this implementation

The Writer's Room should protect meaningful creative work without recording every thought a writer briefly types. Capturing one baseline per continuous editing session creates useful undo points while preserving the product's anti-surveillance doctrine and keeping storage and diary noise bounded.

Restoration uses the existing section lease instead of inventing a second concurrency rule. That means a restore cannot race Maya's active Verse edit, cannot bypass membership, and cannot overwrite a newer canonical value from a stale browser. Preserving the displaced current text first makes restore reversible rather than destructive.

RLS still decides who belongs in the work, while the new database write-path guard decides how lyric text may change. Both are required: membership alone is not proof that a tab owns the current section lease.

## User impact

- A writer sees `History` directly on Verse, Chorus, Bridge and other original sections.
- The panel shows the current words and earlier accepted versions with a writer and time attached.
- Selecting an earlier version requires a deliberate confirmation.
- If another writer is currently editing that section, the restore waits rather than overwriting them.
- After restore, everyone in the Writer's Room receives the canonical updated lyrics without refreshing.
- The version that was replaced remains available, so a mistaken restore can be safely reversed.
- The song diary records the meaningful restore without exposing every keystroke or abandoned phrase.

## Product boundary preserved

Snapshots cover lyric text on an existing, original section only. They do not make split percentages, contracts, legal names, identity records, rights, approved metadata, release identifiers, uploaded audio or executed agreements collaboratively restorable. Linked repeats continue to inherit their source's words and do not pretend to own a separate lyric history.

Deleted-section recovery and whole-song rollback are not claimed in this slice.

## Verification

- Focused snapshot, API, diary and lyric UI tests: 44/44 passed across six suites.
- TypeScript: `npm run typecheck` passed.
- Focused ESLint for every touched source/test file: passed with zero warnings.
- Production build: `npm run build` passed and included both new snapshot routes.
- Full repository Jest: 333/334 suites passed and 3,683/3,686 tests passed. The only three failures are existing stale `WorkPage.test.tsx` expectations for the removed “Add to this song —” and “Next for this song:” copy. The current UI already renders different copy, those assertions are unrelated to lyric snapshots, and they were left untouched to preserve concurrent user/Claude work.

### Production UAT — 2026-09-01

Passed against the live Supabase project and deployed Funūn application:

- migration 145's snapshot table and edit-cycle column are available;
- repeated autosaves create one baseline per continuous editing reservation;
- leaving and returning to a section creates a fresh baseline;
- another writer cannot restore across an active section lock;
- members can read history while non-members cannot read or restore it;
- direct lyric-table updates fail closed outside the approved save, restore and detach paths;
- restore preserves the displaced current words and records the correct diary actor;
- “Detach to vary” remains functional without creating a duplicate edit event;
- the deployed snapshot API returns the expected authenticated-route response;
- the live Writer's Room visibly exposes `History` on the lyric section;
- the recovery panel shows current words, prior words, writer attribution and the two-step restore confirmation;
- a production restore changed the visible canonical lyric, added the correct “restored Verse” diary entry and kept the displaced version available in History.

The UAT used disposable, clearly labeled accounts and works. Cleanup verification passed; no synthetic users, invites, works, lyrics or snapshots remain.

## Activation gate

Completed:

1. Migration 145 applied.
2. Deployment containing commit `14cdb31` confirmed live through both the authenticated snapshot route and signed-in Writer's Room UI.
3. Production edit-cycle, autosave-deduplication, restore, displaced-version preservation, diary attribution, lock collision, membership and non-member checks passed.
4. Signed-in visual acceptance passed for History, recovery-point presentation, two-step restore, canonical lyric replacement and reversible recovery.
5. All disposable UAT data was removed and cleanup verified.

Follow-up acceptance evidence:

1. In a separate signed-in member browser, visually confirm that a restored lyric appears without refresh. The private broadcast path was already production-tested in the preceding soft-lock stage, and the snapshot build reuses that same `lyric_saved` invalidation path.

## Claude/GSD handoff

- Primary implementation: migration 145, the two nested snapshot API routes, `LyricHistoryPanel`, the lyric-card/pad wiring, WorkPage restore orchestration and restored-event diary formatting.
- The database remains the canonical text and lock authority; Realtime carries invalidation hints only.
- Do not turn snapshots into a keystroke log or expand them into legal/release facts.
- The recoverable lyric-history feature may now be described as live. Keep the narrower multi-member visual follow-up above visible; do not turn that open acceptance item into a broader Google Docs-style collaboration claim.
- After activation, the next creative-collaboration slice is comments, suggestions and intentional alternate lyric versions; it should build on these immutable recovery points rather than overload them.
