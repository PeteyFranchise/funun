---
status: complete
commit: 485dbbe
date: 2026-06-28
slug: mlc-per-party-rights
---

# MLC Per-Party Rights — Summary

## What was delivered

Added the MLC (Mechanical Licensing Collective) as a first-class section on the Rights & Registrations page, reframed the entire page around per-party registration independence, added a collaborator callout sourced from the latest split sheet, and added an amber nudge inside SplitSheetForm.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/025_mlc_registered.sql` | New migration — adds mlc_registered BOOLEAN DEFAULT false to vault_projects |
| `types/index.ts` | Added mlc_registered: boolean or null to VaultProject; updated comment to migrations 024-025 |
| `app/api/vault/[projectId]/rights/route.ts` | Added 'mlc_registered' to ALLOWED_FIELDS |
| `components/vault/RightsStatusPatch.tsx` | Widened field prop union to include 'mlc_registered' |
| `components/vault/MlcGuideCard.tsx` | New pure display component — MLC guide card with two external links |
| `app/(artist)/vault/[projectId]/rights/page.tsx` | Per-party subtitle, collaborators callout, mlc_registered in SELECT, mlcBadge derivation, MLC section (section 5) |
| `components/vault/ToolSidePanel.tsx` | Amber nudge after indigo reconciliation callout in SplitSheetForm |
| `lib/vault/demo-store.ts` | Added mlc_registered: null to demo project initializer (Rule 1 fix) |
| `lib/vault/demo.ts` | Added mlc_registered: null to demo row defaults (Rule 1 fix) |

## Deviations

Two demo files (lib/vault/demo.ts and lib/vault/demo-store.ts) were missing mlc_registered in their VaultProjectRow initializers, causing TypeScript build errors. Both were fixed inline as Rule 1 (auto-fix bug) before committing.

## Notes

- Migration 025 must be run against the Supabase production instance via the SQL Editor before the MLC "Mark as registered" toggle will persist. The column defaults to false so existing rows are safe.
- The collaborator callout in the PRO section only renders when the latest split sheet has 2 or more named contributors.
