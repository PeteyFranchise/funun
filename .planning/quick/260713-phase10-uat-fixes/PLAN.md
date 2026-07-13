---
status: complete
created: 2026-07-13
scope: code-fix
branch: codex/status-reconciliation-clean-main
---

# Phase 10 UAT Fixes

## Goal

Fix the Phase 10 UAT failures found during browser/live-backend verification.

## Failures

1. Follow renders as a gradient primary CTA on public profiles, but Phase 10 requires Connect to be primary and Follow to be ghost.
2. Notification pagination uses only `created_at < before`, which skips rows when more than 20 notifications share the same timestamp.

## Tasks

1. Update FollowButton resting style to ghost.
2. Add a compound notification cursor using `created_at` plus `id`.
3. Add/adjust tests for the cursor contract.
4. Re-run targeted tests/build checks and re-check the failing UAT paths.

## Result

Complete. Both UAT failures are fixed, retested in browser against the live backend, and recorded in Phase 10 UAT/verification docs.
