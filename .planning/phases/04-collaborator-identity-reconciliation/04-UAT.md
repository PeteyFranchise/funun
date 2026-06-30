---
status: partial
phase: 04-collaborator-identity-reconciliation
source: [04-VERIFICATION.md]
started: 2026-06-29T22:52:36Z
updated: 2026-06-29T23:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. End-to-end signup claim with live Supabase
expected: Create a collaborator row with email X under Artist A's account. Sign up a new Funūn account with email X. Query `collaborators WHERE email = X` and verify `claimed_by = new_user_uuid`. Navigate to /collaborators as the new user and confirm the My Credits tab lists the credited project. All four checks pass; artist_profiles row created; claimed_at set after first navigation.
result: skipped

### 2. Claim failure isolation (CR-04) with live Supabase
expected: Temporarily inject a fault into claim_collaborators() and attempt signup. artist_profiles and subscriptions rows still commit; claim is silently swallowed; on next navigation middleware retries via /api/claim-collaborators.
result: skipped

### 3. Archive button fires PATCH and card leaves active roster
expected: In the roster UI, click Archive on a claimed collaborator card. PATCH fires to /api/collaborators/:id with archived_at set; card disappears from the active roster immediately (optimistic state update). No TypeError thrown.
result: skipped

### 4. Delete button fires DELETE and card is removed; claimed row returns 409
expected: Click Delete on an unclaimed collaborator card; also attempt Delete on a claimed card. Unclaimed card: DELETE fires; card removed from list. Claimed card: 409 returned; card stays in place.
result: skipped

### 5. Favorite star fires PATCH and appears in picker Favorites group
expected: Star a collaborator via the favorite button in the roster, then open the MetadataStudio CollaboratorPicker. PATCH fires with is_favorite toggled; star fills immediately. Picker shows starred collaborator in FAVORITES group at the top.
result: skipped

### 6. Rights Identity settings save propagates to claimed collaborator rows
expected: As a claimed user, go to Settings, enter PRO=ASCAP and IPI=12345, save Rights Identity section. 200 OK; user_profiles row updated; claimed collaborator row has pro=ASCAP and ipi=12345 (if previously NULL); artist-entered non-NULL values unchanged.
result: skipped

### 7. PATCH /api/user-profiles mass-assignment rejection
expected: Send `PATCH /api/user-profiles` with body `{"claimed_by": "fake-uuid", "id": "different-id", "pro": "ASCAP"}`. 200 OK; only pro is persisted; claimed_by and id are silently dropped.
result: skipped

## Summary

total: 7
passed: 0
issues: 0
pending: 0
skipped: 7
blocked: 0

## Gaps
