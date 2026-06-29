---
phase: 04-collaborator-identity-reconciliation
plan: "04"
subsystem: collaborator-roster
tags: [gap-closure, security, ux, migration]
status: complete

dependency_graph:
  requires: [04-01, 04-03]
  provides: [wired-roster-callbacks, atomic-delete, exception-isolated-signup, explicit-rls, server-forced-archived-at]
  affects: [collaborators-ui, signup-flow, user-profiles-rls]

tech_stack:
  added: []
  patterns:
    - Atomic DELETE with claim guard in WHERE clause (closes TOCTOU window)
    - Server-forced timestamp — client intent (archive/unarchive) separated from server clock value
    - Nested BEGIN/EXCEPTION WHEN OTHERS block inside SECURITY DEFINER trigger function
    - Explicit per-operation RLS policies (FOR SELECT / FOR INSERT / FOR UPDATE)

key_files:
  created:
    - supabase/migrations/027_fix_handle_new_user_exception_isolation.sql
  modified:
    - components/collaborators/CollaboratorRoster.tsx
    - app/api/collaborators/[id]/route.ts
    - lib/collaborators/index.ts

decisions:
  - handleArchive/handleDelete/handleFavoriteToggle update list state in place (no router.refresh()) matching the existing handleSaved precedent
  - Atomic DELETE returns 200 for not-found/not-owned (idempotent); only 409 for confirmed claimed rows
  - archived_at server-forcing uses new Date().toISOString() in sanitizeCollaborator — no need for future-date comparison branch
  - Migration 027 requires manual supabase db push (no supabase/config.toml in project)

metrics:
  duration: "2m"
  completed_date: "2026-06-29"
  tasks_completed: 5
  tasks_total: 5
  files_modified: 4
---

# Phase 04 Plan 04: Gap Closure — Callbacks, Exception Isolation, Atomic Delete, RLS, archived_at Summary

Gap-closure pass wiring the CollaboratorRoster Archive/Delete/Favorite callbacks, adding exception isolation to handle_new_user(), making the collaborator DELETE atomic, adding explicit user_profiles RLS policies, and server-forcing the archive timestamp.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wire onArchive, onDelete, onFavoriteToggle in CollaboratorRoster | a355989 | components/collaborators/CollaboratorRoster.tsx |
| 2 | Migration 027 — exception-isolated handle_new_user() + explicit user_profiles RLS | 235509b | supabase/migrations/027_fix_handle_new_user_exception_isolation.sql |
| 3 | Atomic claim-guarded DELETE (CR-01 TOCTOU race) | 0d9f04e | app/api/collaborators/[id]/route.ts |
| 4 | Server-force archived_at to reject future timestamps (CR-03) | d8d7ff3 | lib/collaborators/index.ts |
| 5 | Push migration 027 to the database | — | (manual push required — see below) |

## Outcomes

### BLOCKER WR-03, WR-04 — Roster callbacks wired
`handleArchive`, `handleDelete`, and `handleFavoriteToggle` are added to `CollaboratorRoster` and passed as props to every `CollaboratorCard` at the grid render site. All three buttons now invoke real handlers that call the API and update list state. No button calls `undefined` at runtime.

### BLOCKER CR-04 — handle_new_user() exception-isolated
Migration 027 wraps `PERFORM public.claim_collaborators(NEW.id, NEW.email)` in a nested `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END` block. A claim failure can no longer roll back the `artist_profiles` and `subscriptions` inserts, so a new account can never be orphaned by a claim error.

### CR-01 — Atomic DELETE (no TOCTOU)
The DELETE handler now uses a single `.delete().is('claimed_by', null)` chain. The claim guard is part of the DELETE statement itself — no separate SELECT step exists before the DELETE, so a concurrent `claim_collaborators()` call cannot slip in between the check and the delete.

### CR-02 — Explicit user_profiles RLS policies
Migration 027 drops the ambiguous `"Users manage own profile"` policy (no FOR clause) and replaces it with three explicit policies: `FOR SELECT`, `FOR INSERT`, and `FOR UPDATE`, all scoped to `auth.uid() = id`. First-time settings upserts now persist unambiguously.

### CR-03 — Server-forced archived_at
`sanitizeCollaborator` now replaces any non-empty client-supplied `archived_at` string with `new Date().toISOString()`. A client sending `2099-12-31T00:00:00.000Z` gets server `now()` persisted instead. The unarchive path (`null`) is unchanged.

## Migration Push (Task 5 — Manual Required)

The project has no `supabase/config.toml` — the Supabase CLI is not initialized for local dev. Migration 027 must be applied manually:

```bash
# If not already linked:
supabase link --project-ref <your-project-ref>

# Apply the migration:
supabase db push
```

Alternatively, apply the contents of `supabase/migrations/027_fix_handle_new_user_exception_isolation.sql` directly in the Supabase dashboard SQL editor.

After the push, verify:
- `SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user'` shows the nested EXCEPTION block
- `SELECT policyname FROM pg_policies WHERE tablename = 'user_profiles'` shows the three explicit policies

## Deviations from Plan

None — plan executed exactly as written. Task 5 surfaces the manual push as the plan instructs (no silent skip).

## Known Stubs

None.

## Threat Flags

No new security surface introduced beyond what is addressed in this plan's threat model.

## Self-Check: PASSED

- [x] `components/collaborators/CollaboratorRoster.tsx` exists and modified — FOUND
- [x] `supabase/migrations/027_fix_handle_new_user_exception_isolation.sql` exists — FOUND
- [x] `app/api/collaborators/[id]/route.ts` exists and modified — FOUND
- [x] `lib/collaborators/index.ts` exists and modified — FOUND
- [x] Commit a355989 exists (Task 1)
- [x] Commit 235509b exists (Task 2)
- [x] Commit 0d9f04e exists (Task 3)
- [x] Commit d8d7ff3 exists (Task 4)
