---
created: 2026-09-01
title: Activate and production-test Writer's Room lyric snapshots
area: writers-room
status: pending
source: .planning/quick/260901-writers-room-lyric-snapshots/SUMMARY.md
---

# Activate and production-test Writer's Room lyric snapshots

## Why this remains open

The snapshot and restore build, focused tests, type-check, lint and production build are complete. The feature cannot be described as live until migration 145 is applied, the build is deployed and signed-in multi-session behavior passes in production.

## Close only when

- Migration 145 is applied.
- The deployment containing the snapshot build is confirmed live.
- Separate editing reservations create separate useful recovery points; repeated autosaves inside one reservation do not.
- Restoring an earlier version preserves the displaced current words.
- A second member sees the restored canonical lyric without refresh and the diary attributes the restore correctly.
- An active lock held by another writer prevents restore.
- A non-member cannot list or restore snapshots.

Record production evidence and the deployed commit in the build summary before moving this TODO to completed.
