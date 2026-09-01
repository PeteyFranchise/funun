---
title: Apply and verify migration 142 for delivery-safe files
area: metadata-studio
phase: 37.3
status: pending
owner: owner-or-claude
---

# Apply and Verify Migration 142

Apply `supabase/migrations/142_metadata_delivery_exports.sql` through Funūn's human-gated production migration process, then verify:

- one tagged MP3 is generated at a unique non-overwriting path;
- one metadata sidecar is generated at a unique non-overwriting path;
- each action creates one `metadata_delivery_exports` row;
- source and artifact SHA-256 values are present and distinct when bytes differ;
- manifest and receipt downloads require the owning session;
- the original source hash is identical before and after generation;
- failed ledger persistence removes only the new artifact;
- no browser role can query the evidence table directly.

Reference: `.planning/quick/260901-delivery-safe-files-build/SUMMARY.md`.
