---
created: 2026-09-01
title: Activate and production-test Writer's Room lyric snapshots
area: writers-room
status: pending
source: .planning/quick/260901-writers-room-lyric-snapshots/SUMMARY.md
---

# Activate and production-test Writer's Room lyric snapshots

## Current status

Migration 145 is applied, the build is deployed, automated production checks passed and the signed-in History/restore browser flow passed. The recovery-history feature itself is live. This TODO remains open only for one additional multi-member visual confirmation of the reused private live-refresh path.

## Close only when

- [x] Migration 145 is applied.
- [x] The deployment containing commit `14cdb31` is live.
- [x] Separate editing reservations create separate useful recovery points; repeated autosaves inside one reservation do not.
- [x] Restoring an earlier version preserves the displaced current words.
- [x] The signed-in production UI displays History, prior versions, attribution and the two-step restore flow.
- [x] The production diary attributes restore correctly.
- [x] An active lock held by another writer prevents restore.
- [x] A non-member cannot list or restore snapshots.
- [x] All disposable production UAT data was removed and cleanup verified.
- [ ] In a separate signed-in member browser, visually confirm that the restored canonical lyric appears without refresh.

The build summary contains production evidence and the deployed commit. Move this TODO to completed after the final cross-browser visual confirmation.
