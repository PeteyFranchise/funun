---
status: testing
phase: 10-connections-notifications
source: [10-VERIFICATION.md]
started: 2026-07-12T00:00:00Z
updated: 2026-07-12T00:00:00Z
---

## Current Test

number: 1
name: Auto-follow-seed on accept (D-05)
expected: |
  With two accounts A and B: A sends B a Connect request, B accepts. Two follows rows
  (A→B and B→A) are seeded by the connections_on_accept trigger; exactly one
  connection_accepted notification reaches A; no new_follower notifications fire for the
  seeded rows.
awaiting: user response

## Tests

### 1. Auto-follow-seed on accept (D-05)
expected: A requests, B accepts → both follow directions (A→B and B→A) seeded by the migration-050 SECURITY DEFINER trigger; exactly one connection_accepted notification to A; no new_follower for the seeded rows. (Migration is live + was DB-smoke-verified during 10-02 execution; this confirms the end-to-end app path route UPDATE → trigger → follows.)
result: [pending]

### 2. Bell renders app-wide, badge live + accurate, no channel leak
expected: Sign in and navigate dashboard/vault/a profile — header row + bell render on every authenticated route. From a second account, follow / send a connect request / post on the wall → badge increments within ~25s (or instantly via Realtime) to the correct count, capped 9+ at ≥10; browser console shows NO TooManyChannels error after navigating.
result: [pending]

### 3. Open panel does not clear badge; Mark all read clears it
expected: Clicking the bell opens the panel and the badge persists on open (D-09); clicking Mark all read clears the badge to nothing and rows lose the unread treatment.
result: [pending]

### 4. Panel inline Accept/Decline on connection_request rows act in place
expected: On a connection-request row in the panel, click Accept → row updates in place (inline buttons gone, title reflects accepted) without closing the panel or navigating; requester's Connect button reads Connected.
result: [pending]

### 5. Panel loads 20 + cursor-paginates older on scroll
expected: With >20 notifications seeded, scrolling the panel list to the bottom auto-loads older ones (Loading… briefly) with no duplicates or skips.
result: [pending]

### 6. ConnectButton order/skin, note composer, Pending persistence, Withdraw
expected: On B's profile as A — order is Connect/Follow/Message with Connect as the gradient primary CTA and Follow as ghost; Connect opens a note composer (n/200 counter); Send request → Pending; reload → Pending persists (state from DB); hover → reads Withdraw (neutral, no rose styling); click → reverts to Connect.
result: [pending]

### 7. Addressee inline Accept/Decline on the profile (D-02) with note callout
expected: As B (addressee of a pending inbound request), open A's profile → inline Accept/Decline render in place with the requester's note shown above them when present; Accept establishes the connection.
result: [pending]

### 8. #wall / #endorsements anchors scroll to sections
expected: Visiting /u/{handle}#wall and /u/{handle}#endorsements scrolls the page to the Wall and Endorsements sections respectively (scroll-mt offset keeps them clear of the sticky header).
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
