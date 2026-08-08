---
status: partial
phase: 26-sync-library-inclusion
source: [26-01-SUMMARY.md, 26-02-SUMMARY.md, 26-03-SUMMARY.md, 26-04-SUMMARY.md, 26-05-SUMMARY.md, 26-06-SUMMARY.md, 26-07-SUMMARY.md, 26-08-SUMMARY.md, 26-09-SUMMARY.md, 26-10-SUMMARY.md]
started: 2026-08-08T05:20:00.000Z
updated: 2026-08-08T05:35:00.000Z
---

## Current Test

[UAT deferred — owner decision 2026-08-08: accept the green automated layer as the current gate; the flow tests
need a running app with real artist/staff auth + data and are blocked pending a live-env UAT (planned on the
deployed environment after the Phase 26 PR merges). Dev server could not boot in the orchestration sandbox
(EPERM uv_cwd), so no live render was captured here.]

## Tests

### 1. Cold Start Smoke Test
expected: Fresh boot with migration 096 live; app starts clean; /sync (public catalogue) loads and reads empty (no admitted songs yet), no schema/500 error.
result: blocked
blocked_by: server
reason: "Live boot/render not observed (dev server EPERM in sandbox). Substance independently confirmed: migration 096 LIVE + Codex smoke (sync_listings count=0, blanket_agreement insert + sync_library/self_applied/admin_invited grant inserts all pass); npm run build green (every route compiles); full jest 146 suites/1723 tests green."

### 2. Vault self-apply (the door)
expected: On a Vault project's songs, each shows a "Submit to Sync Library" action (any artist). Submitting a song creates a listing and the song row shows a status chip (e.g. "Under review").
result: blocked
blocked_by: server
reason: "Needs a running app + a real artist account with a Vault song. Deferred to live-env UAT."

### 3. Withdraw a submission
expected: A submitted (not-yet-admitted) song can be withdrawn from its status control; afterward it's no longer in the sync library and the row returns to the submit action.
result: blocked
blocked_by: server
reason: "Needs a running app + a submitted listing. Deferred to live-env UAT."

### 4. Blanket agreement signing (sign-once)
expected: When a song reaches the agreement step, /sync-library/agreement presents the blanket agreement; signing it once covers all the artist's songs. Later songs skip signing and show "Covered by your Sync Library agreement".
result: blocked
blocked_by: server
reason: "Needs a running app + a live DocuSeal round-trip (explicitly deferred to the phase gate per 26-04). Deferred to live-env UAT."

### 5. Invited spotlight card
expected: An invited artist (pending admin_invited grant, zero listings) sees a non-dismissible "You're invited to the Sync Library" card on their dashboard with a "Review invitation" CTA; it disappears once they've submitted a song.
result: blocked
blocked_by: server
reason: "Needs a running app + a minted admin_invited grant on a real artist. Deferred to live-env UAT."

### 6. Admin — invite an artist
expected: In /admin/sync-library (staff: leadership/AE), the invite panel lets staff pick an artist and send an invite, which mints the grant so that artist then sees the spotlight card.
result: blocked
blocked_by: server
reason: "Needs a running app + a real staff (leadership/AE) session. Deferred to live-env UAT."

### 7. Admin — admit / reject curation queue
expected: The curation queue lists submitted songs (labeled invited vs self-applied). Staff can admit a song (it goes live in the catalogue) or reject with an optional short reason, which the artist is notified of and sees on the rejected song.
result: blocked
blocked_by: server
reason: "Needs a running app + real staff session + a submitted listing. Deferred to live-env UAT."

### 8. Leadership-only removal
expected: On an admitted song, a "Remove from Sync Library" action is visible ONLY to leadership (not AE/BD). Removing it takes the song down and notifies the artist.
result: blocked
blocked_by: server
reason: "Needs a running app + a leadership session + an admitted song; verify AE/BD do NOT see the control. Deferred to live-env UAT."

### 9. Catalogue admission gate
expected: Browse the Catalogue shows ONLY admitted songs. An admitted song appears; withdrawn/removed/never-admitted songs do not.
result: blocked
blocked_by: server
reason: "Needs a running app + at least one admitted song. Code-confirmed: single isAdmittedToSyncLibrary helper replaces both is_public checks (grep-verified, tests green); catalogue correctly reads empty with nothing admitted. Live render deferred to UAT."

### 10. Sync Library hub unlock (progressive disclosure)
expected: Before any admission the artist has NO "Sync Library" nav item. After their first song is admitted, a "Sync Library" item appears directly under "Deals" (with a "New" dot until first opened); the hub page leads with "In progress", then "Admitted songs", then "Your agreement".
result: blocked
blocked_by: server
reason: "Needs a running app + a real artist crossing 0→1 admitted songs. Deferred to live-env UAT."

### 11. Nav reorder — Split Sheets under Contract Locker
expected: In the artist sidebar, "Split Sheets" now sits directly under "Contract Locker" (both before and after admission).
result: blocked
blocked_by: server
reason: "Code-confirmed in ArtistNav.tsx ITEMS order; live render deferred to UAT (lowest-risk item — pure reorder)."

## Summary

total: 11
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 11

## Gaps

[none — no code issues found; all tests blocked pending a live-env UAT, not failed]
