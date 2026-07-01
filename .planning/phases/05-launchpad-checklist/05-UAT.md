---
status: complete
phase: 05-launchpad-checklist
source: [05-VERIFICATION.md]
started: 2026-07-01T00:00:00Z
updated: 2026-07-01T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Completion persistence round-trip (LAUNCH-04)
expected: Sign in as an artist, open /launchpad/[projectId], check one item, then hard-reload (Cmd+Shift+R). The checked item remains checked. Uncheck it, reload again — it shows unchecked.
result: pass

### 2. Before release section auto-collapses when release_date is in the past (LAUNCH-01 / LAUNCH-02)
expected: Visit /launchpad/[projectId] for a project whose release_date is in the past. The "Before release" section starts collapsed as a "Did you handle this before release?" confirmation block with compact checkboxes; a chevron button expands the full item list.
result: pass

### 3. Approved tip renders in TipPanel; unapproved tip does not (LAUNCH-03)
expected: Set tip_approved=true on one item via /admin/tips approve — the tip body appears in the artist TipPanel. An unapproved item shows only "Steps for this item are coming soon."
result: pass

### 4. Non-admin authenticated user is redirected away from /admin/* routes (LAUNCH-05 / security)
expected: Visiting /admin/checklist while signed in as a regular artist (not is_admin) redirects to /.
result: pass

### 5. Admin drag-reorder persists and survives reload; artist-facing order updates (LAUNCH-05)
expected: Drag a row in /admin/checklist — PATCH /api/admin/checklist fires with the full order array, sort_order updates in the DB, and visiting /launchpad/[projectId] shows the new order.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
