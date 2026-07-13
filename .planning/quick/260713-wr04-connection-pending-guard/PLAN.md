---
status: complete
created: 2026-07-13
scope: code-fix
branch: codex/status-reconciliation-clean-main
---

# WR-04 Connection Pending Guard

## Goal

Close the Phase 10 review warning where a repeated accept PATCH can re-update an already accepted connection and emit a duplicate `connection_accepted` notification.

## Tasks

1. Add a route-level regression test for the pending-state guard.
2. Require `connections.status = 'pending'` in the PATCH update query.
3. Run targeted and full validation.
4. Push the existing PR branch and merge PR #35 once checks pass.

## Result

Complete. The route update now requires a pending row before any accept/decline/withdraw transition succeeds, preventing repeat accept side effects from emitting duplicate `connection_accepted` notifications.
