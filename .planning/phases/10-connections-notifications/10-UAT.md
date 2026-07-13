---
status: complete
phase: 10-connections-notifications
source: [10-VERIFICATION.md]
started: 2026-07-12T00:00:00Z
updated: 2026-07-13T08:14:36Z
---

## Current Test

number: 8
name: #wall / #endorsements anchors scroll to sections
expected: |
  Visiting /u/{handle}#wall and /u/{handle}#endorsements scrolls the page to the Wall
  and Endorsements sections respectively.
result: passed

## Tests

### 1. Auto-follow-seed on accept (D-05)
expected: A requests, B accepts → both follow directions (A→B and B→A) seeded by the migration-044 SECURITY DEFINER trigger; exactly one connection_accepted notification to A; no new_follower for the seeded rows. (Migration is live + was DB-smoke-verified during 10-02 execution; this confirms the end-to-end app path route UPDATE → trigger → follows.)
result: pass
evidence: Live Supabase UAT accepted two pending requests (A→B via profile inline accept, C→B via panel inline accept). DB verification found both mutual follow pairs (A→B/B→A and C→B/B→C), exactly one connection_accepted notification to each requester, and zero new_follower notifications from the trigger-seeded follows.

### 2. Bell renders app-wide, badge live + accurate, no channel leak
expected: Sign in and navigate dashboard/vault/a profile — header row + bell render on every authenticated route. From a second account, follow / send a connect request / post on the wall → badge increments within ~25s (or instantly via Realtime) to the correct count, capped 9+ at ≥10; browser console shows NO TooManyChannels error after navigating.
result: pass
evidence: Bell rendered in the authenticated header on tested routes. With 28 unread rows the badge displayed 9+. After mark-all-read, a wall post from A to B updated B's badge to 1 immediately via Realtime. Browser console showed no Realtime/channel/TooManyChannels errors.

### 3. Open panel does not clear badge; Mark all read clears it
expected: Clicking the bell opens the panel and the badge persists on open (D-09); clicking Mark all read clears the badge to nothing and rows lose the unread treatment.
result: pass
evidence: Opening the bell panel preserved the 9+ badge. Clicking Mark all read cleared the badge and removed unread row treatment.

### 4. Panel inline Accept/Decline on connection_request rows act in place
expected: On a connection-request row in the panel, click Accept → row updates in place (inline buttons gone, title reflects accepted) without closing the panel or navigating; requester's Connect button reads Connected.
result: pass
evidence: B accepted C's pending request from the notification panel. The row updated in place to an accepted title, the panel remained open, and the inline action buttons disappeared.

### 5. Panel loads 20 + cursor-paginates older on scroll
expected: With >20 notifications seeded, scrolling the panel list to the bottom auto-loads older ones (Loading… briefly) with no duplicates or skips.
result: pass
evidence: Initial UAT reproduced a timestamp-tie failure: 25 seeded notifications shared the same created_at and the panel stayed at 20 rows. Fixed pagination to use a compound created_at/id cursor, retested, and the panel grew from 20 to 29 rows on bottom scroll with no observed duplicates.

### 6. ConnectButton order/skin, note composer, Pending persistence, Withdraw
expected: On B's profile as A — order is Connect/Follow/Message with Connect as the gradient primary CTA and Follow as ghost; Connect opens a note composer (n/200 counter); Send request → Pending; reload → Pending persists (state from DB); hover → reads Withdraw (neutral, no rose styling); click → reverts to Connect.
result: pass
evidence: A saw Connect/Follow/Message, composed and sent a note, saw Pending persist after reload, and clicked Pending to withdraw back to Connect. Initial UAT found Follow incorrectly used the gradient primary style; FollowButton was fixed to remain ghost, and retest showed Connect as the only gradient CTA with Follow ghost.

### 7. Addressee inline Accept/Decline on the profile (D-02) with note callout
expected: As B (addressee of a pending inbound request), open A's profile → inline Accept/Decline render in place with the requester's note shown above them when present; Accept establishes the connection.
result: pass
evidence: B opened A's profile, saw A's request note with inline Accept/Decline, clicked Accept, and the profile state changed to Connected.

### 8. #wall / #endorsements anchors scroll to sections
expected: Visiting /u/{handle}#wall and /u/{handle}#endorsements scrolls the page to the Wall and Endorsements sections respectively (scroll-mt offset keeps them clear of the sticky header).
result: pass
evidence: Browser checks confirmed both deep links landed with their target sections visible below the sticky header.

## Summary

total: 8
passed: 8
issues: 2 fixed
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Two UAT failures were found, fixed, and retested:

1. Follow rendered as a second gradient CTA instead of ghost.
2. Notification pagination skipped same-timestamp rows because the cursor used only created_at.
