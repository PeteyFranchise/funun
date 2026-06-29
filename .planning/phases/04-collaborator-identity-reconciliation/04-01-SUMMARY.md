---
phase: 04
plan: 01
subsystem: collaborator-identity-reconciliation
status: complete
tags: [database, migration, api, middleware, ui, rls, security-definer]
dependency_graph:
  requires: []
  provides:
    - supabase/migrations/026_collaborator_identity_reconciliation.sql
    - app/api/claim-collaborators/route.ts
    - lib/collaborators/index.ts (extended)
    - middleware.ts (extended)
    - app/(artist)/collaborators/page.tsx (extended)
    - components/collaborators/CollaboratorRoster.tsx (extended)
  affects:
    - collaborators table (new columns: claimed_by, archived_at, is_favorite)
    - artist_profiles table (new column: claimed_at)
    - user_profiles table (new)
    - auth flow (handle_new_user extended)
tech_stack:
  added: []
  patterns:
    - SECURITY DEFINER PostgreSQL functions for cross-user writes
    - Additive-only COALESCE back-fill pattern
    - Functional index on LOWER(email) for case-insensitive claim scan
    - Fire-and-forget middleware claim hook with claimed_at sentinel gate
    - Cross-user RLS SELECT policy (claimed_by = auth.uid())
    - Two-tab layout with role=tablist / role=tabpanel accessibility
key_files:
  created:
    - supabase/migrations/026_collaborator_identity_reconciliation.sql
    - app/api/claim-collaborators/route.ts
  modified:
    - lib/collaborators/index.ts
    - middleware.ts
    - app/(artist)/collaborators/page.tsx
    - components/collaborators/CollaboratorRoster.tsx
decisions:
  - "Middleware uses artist_profiles.claimed_at DB lookup (not user_metadata) as the claim gate — chosen for correctness; per-request cost acceptable at current scale (Pitfall 2 fallback per A2 assumption risk)"
  - "Credits cast through unknown to avoid required created_at/updated_at fields missing from the joined select shape"
  - "hidden attribute used for tabpanel toggling (simpler than conditional rendering for preserving Roster form state)"
metrics:
  duration: 3m
  completed: 2026-06-29
  tasks_completed: 3
  files_changed: 6
---

# Phase 04 Plan 01: Collaborator Identity Reconciliation (Claim Slice) Summary

## One-liner

Email-based claim mechanism with DB trigger, claim API route, middleware gate, and My Credits tab — collaborators are auto-linked to new Funūn accounts on signup.

## What Was Built

### Task 1: Migration 026 — full schema, indexes, RLS, and claim/back-fill functions

Created `supabase/migrations/026_collaborator_identity_reconciliation.sql` with the complete Phase 4 schema:

- `user_profiles` table (id, pro, ipi, publisher, phone, mailing_address, display_name, bio, timestamps) with RLS and `"Users manage own profile"` policy
- `collaborators` gained `claimed_by UUID REFERENCES auth.users`, `archived_at TIMESTAMPTZ`, `is_favorite BOOLEAN NOT NULL DEFAULT false`
- `artist_profiles` gained `claimed_at TIMESTAMPTZ` sentinel
- Functional index `idx_collaborators_lower_email ON collaborators (LOWER(email))` for case-insensitive email scan
- Index `idx_collaborators_claimed_by` for credits query performance
- RLS policy `"Claimed users see own credits"` FOR SELECT USING `auth.uid() = claimed_by`
- `claim_collaborators(p_user_id, p_email)` SECURITY DEFINER function: idempotent `WHERE claimed_by IS NULL` guard + additive-only COALESCE back-fill from user_profiles
- `backfill_claimed_collaborators(p_user_id)` SECURITY DEFINER function for settings-save path
- `handle_new_user()` extended to `PERFORM public.claim_collaborators(NEW.id, NEW.email)` — no new trigger added

### Task 2: Claim API route + middleware claim-fire hook + CollaboratorProfile type extension

- `POST /api/claim-collaborators`: validates session via `createApiClient().auth.getUser()` (never trusts client-supplied IDs), runs `claim_collaborators` RPC via service role, sets `claimed_at` sentinel — returns 401 with no session
- `middleware.ts` extended: after auth guard blocks, reads `artist_profiles.claimed_at` via `maybeSingle()`; when null, fires `POST /api/claim-collaborators` fire-and-forget forwarding the cookie header (no user id in custom headers per T-04-01)
- `CollaboratorProfile` type extended with `claimed_by?`, `archived_at?`, `is_favorite?`
- `COLLABORATOR_EDITABLE_FIELDS` extended with `is_favorite` and `archived_at` (claimed_by deliberately excluded)
- `sanitizeCollaborator` handles `is_favorite` (boolean-only) and `archived_at` (string|null)
- `isClaimedCollaborator(c)` predicate exported: returns `Boolean(c.claimed_by)`

### Task 3: My Credits section on /collaborators (two-section layout + cross-user query)

- `collaborators/page.tsx` runs second query for credits (`claimed_by = user.id`, `archived_at IS NULL`, limit 20, joined with `split_sheet_parties → split_sheets`)
- Reads `tab` search param and forwards as `initialTab` to support `/collaborators?tab=credits` deep-link from dashboard
- `CollaboratorRoster.tsx` restructured with `role="tablist"` tab switcher ("My Roster" | "My Credits") with `aria-selected` and `role="tabpanel"`
- My Roster tab: preserves all existing behavior (card grid, create form, empty state)
- My Credits tab: read-only `ul`/`li` list with song name, role chip (neutral chip pattern), split %, split sheet link
- Credits empty state: "No credits yet" heading with exact UI-SPEC body copy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Credits query shape missing required CollaboratorProfile fields**
- **Found during:** Task 3 TypeScript check
- **Issue:** The credits query selects a subset of columns (no `created_at`, `updated_at`) but the cast target is `CollaboratorProfile[]` which requires those fields — caused TS2352
- **Fix:** Cast `creditsData` through `unknown` first (`as unknown as CollaboratorProfile[]`) — the missing timestamp fields are not rendered in the Credits tab and the CollaboratorRoster receives them typed through the extended `CreditRow` interface
- **Files modified:** `app/(artist)/collaborators/page.tsx`
- **Commit:** d52692f

### Architectural Notes

None. All plan items executed as designed.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-04-01 (T-claim-spoof) | Route calls `createApiClient().auth.getUser()` — user id/email from session only, never from body/headers |
| T-04-02 (T-mass-assign) | `claimed_by` excluded from `COLLABORATOR_EDITABLE_FIELDS`; written only inside SECURITY DEFINER functions |
| T-04-03 (T-rls-leak) | `"Claimed users see own credits"` policy scoped to `auth.uid() = claimed_by` — row-scoped, not table-wide |
| T-04-04 (T-backfill) | All back-fill UPDATEs use `COALESCE(existing_column, new_value)` with existing value first — additive only |
| T-04-05 (DoS) | Middleware hook is fire-and-forget `.catch()`, gated behind `claimed_at IS NULL` sentinel |

## Known Stubs

None. All data is live from the database; no hardcoded empty values or placeholder text in rendered paths.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is documented in the plan's threat model.

## Self-Check

Checking created and modified files exist and commits are present:

- [x] `supabase/migrations/026_collaborator_identity_reconciliation.sql` — created, commit 2e8c24e
- [x] `app/api/claim-collaborators/route.ts` — created, commit a70b563
- [x] `lib/collaborators/index.ts` — modified, commit a70b563
- [x] `middleware.ts` — modified, commit a70b563
- [x] `app/(artist)/collaborators/page.tsx` — modified, commit d52692f
- [x] `components/collaborators/CollaboratorRoster.tsx` — modified, commit d52692f

## Self-Check: PASSED
