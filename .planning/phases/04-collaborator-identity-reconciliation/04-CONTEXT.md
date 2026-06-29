# Phase 4: Collaborator Identity Reconciliation - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

When a non-Funūn collaborator who was added to a split sheet or collaborator roster (before having a Funūn account) later signs up, their existing contributions are automatically linked to their new profile — no re-entry, no orphaned records.

This phase also introduces a universal `user_profiles` table (covering all Funūn user types), a comprehensive Credits view on the /collaborators page, and Favorites + Most Recent collaborator UX for the picker flow.

</domain>

<decisions>
## Implementation Decisions

### Claim Trigger Placement

- **D-01:** A Supabase DB function triggered on `auth.users` INSERT handles the signup case atomically. This function matches `collaborators.email` (case-insensitive) against the new user's auth email and sets `claimed_by = auth.users.id` for all matching rows, regardless of which artist owns those rows.
- **D-02:** A nullable `claimed_at` timestamp is added to `artist_profiles`. When `claimed_at IS NULL`, middleware re-runs the claim function on the next request (handles "first post-signup login"). Once set, middleware skips further claim checks entirely.
- **D-03:** The claim function is idempotent — it only writes when `claimed_by IS NULL`. Safe to run on every login until claimed. Multiple artists with the same email in their roster all get their rows claimed.

### Collaborations Section (Credits View)

- **D-04:** The `/collaborators` page is restructured into two sections:
  1. **Credits** — every song/project where the logged-in user is credited (writer, producer, any role), regardless of whether they or someone else created the project. Filterable by role. Each entry shows: project name, artist name, role, and links to the split sheet.
  2. **My Roster** — people the artist has added to their own projects (existing Phase 1 behavior). Cards, IPI status badges, edit modal — unchanged.
- **D-05:** The dashboard shows a compact **Credits preview** below the existing stats cards. Visible only when claimed records exist. Includes a "View all" link to the full `/collaborators` Credits section.
- **D-06:** Credits entries are permanent (not an onboarding card that fades). The section grows as more artists credit the user on their work.

### Settings Back-fill Mechanics

- **D-07:** A new `user_profiles` table (keyed by `auth.users.id`) is created for all Funūn users — artists and non-artists alike. Fields: PRO affiliation, IPI/CAE number, publisher, phone, address, display name, bio, social links. The settings page writes to this table.
- **D-08:** Back-fill runs at two moments:
  1. **At claim time** — immediately when collaborator rows are linked, the claim function reads the new user's `user_profiles` record and fills any NULL fields on matching collaborator rows.
  2. **On every settings save** — when a user saves their profile settings (updating `user_profiles`), a back-fill job re-runs for any collaborator rows they own via `claimed_by`, filling remaining NULLs.
- **D-09:** Back-fill fields: `pro`, `ipi`, `publisher`, `phone`, `address`. Never overwrites existing non-NULL values. Name and email are excluded (already on the collaborator row, managed by the inviting artist).

### Soft-delete UX (Claimed Collaborators)

- **D-10:** For collaborator cards where `claimed_by IS NOT NULL`, the delete button is replaced by an **Archive** button. Hard delete is blocked at the API level for claimed records.
- **D-11:** Archived collaborators are hidden from the active roster. An **Archived** toggle/filter on the /collaborators page reveals them. Artist can unarchive.
- **D-12:** The `/collaborators` My Roster section adds **Favorites** — a star toggle on each card. A **Most Recent** group is shown at the top of the MetadataStudio picker and split sheet signer picker for quick access when starting a new song.

### Claude's Discretion

- Exact DB migration structure for `user_profiles` — whether it coexists with or partially supersedes `artist_profiles` for rights-identity fields is left to the planner.
- Exact UI layout of the two-section /collaborators page (tabs vs. sections within one scroll view).
- Pagination/limit behavior for the Credits section if a user has many credits.
- Exact Favorites storage mechanism (boolean column on `collaborators` row, or a separate join table).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Collaborator Data Model
- `lib/metadata/schema.ts` — `Composer` type (name, role, pro, ipi, email, phone, split) in track metadata JSONB. `PRO`, `PRO_LABELS`, `PRO_VALUES`, `ComposerRole` — reuse for user_profiles and back-fill.

### Existing UI Entry Points
- `components/vault/MetadataStudio.tsx` — composer row picker where "Most Recent" and "Favorites" quick-access must be added.
- `app/(artist)/collaborators/` — existing collaborators route from Phase 1. Restructure into Credits + My Roster sections.
- `app/(artist)/dashboard/page.tsx` — add compact Credits preview below stats cards.
- `app/(artist)/settings/page.tsx` — settings page that must write to the new `user_profiles` table (currently modified per git status).

### Auth and Middleware
- `middleware.ts` — where the `claimed_at` check and claim re-run must be inserted.
- `lib/supabase/server.ts`, `lib/supabase/client.ts` — auth client factories for server-side claim function calls.

### Phase 1 Decisions
- `.planning/phases/01-collaborator-profiles/01-CONTEXT.md` — collaborators table schema, invite flow, split sheet shared document model. Phase 4 builds on top of all of this.

### Requirements
- `.planning/REQUIREMENTS.md` — COLLAB-05 (the requirement this phase addresses)
- `.planning/ROADMAP.md` — Phase 4 success criteria (5 items) and design notes (idempotency, case-insensitive email, soft-delete, additive-only back-fill)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createServiceClient()` (`lib/supabase/index.ts` or `lib/supabase/server.ts`) — service role client needed for the cross-user claim write (writing to collaborator rows owned by other artists).
- `Resend` integration — already used for missing-IPI and split-approval emails in Phase 1. Extend for any "you've been claimed" notification to the collaborator.
- EditProjectForm modal pattern — the existing edit-collaborator modal from Phase 1 can be extended to show the Archive button for claimed collaborators.
- `router.refresh()` pattern — standard post-mutation revalidation.

### Established Patterns
- API route pattern: `app/api/collaborators/route.ts` and `app/api/collaborators/[id]/route.ts` — extend for archive/unarchive endpoints and favorites toggle.
- Input sanitization with EDITABLE_FIELDS allowlist — follow `app/api/profile/route.ts` pattern for the new settings endpoint writing to `user_profiles`.
- RLS multi-tenancy — `user_profiles` table must have RLS: owner can read/write own row. Claim function needs service role to write to other users' collaborator rows.
- Supabase DB trigger pattern — existing `003_readiness_triggers_full_events.sql` shows the migration pattern for DB functions and triggers.

### Integration Points
- Supabase `auth.users` table — DB trigger attaches to this table's INSERT event. Uses `auth.users.email` for matching.
- `artist_profiles` table — add nullable `claimed_at TIMESTAMPTZ` column.
- `collaborators` table — add nullable `claimed_by UUID REFERENCES auth.users(id)` column + index on `LOWER(email)`. Add nullable `archived_at TIMESTAMPTZ` and `is_favorite BOOLEAN DEFAULT false`.
- Dashboard (`app/(artist)/dashboard/page.tsx`) — server component that needs a new query for claimed credits.

</code_context>

<specifics>
## Specific Ideas

- The Credits section heading on /collaborators could be "My Credits" — clearer than "Credits."
- The Most Recent section in MetadataStudio picker: show the last 5 collaborators added to any of the artist's tracks, ordered by most recent `created_at` on the track metadata. No UI toggle needed — always visible at top of picker.
- Favorites in picker: show starred collaborators in a pinned "Favorites" group above Most Recent.
- The "Funūn member" upgrade on a collaborator card: a small badge or icon change (e.g., a verified-style icon or the collaborator's avatar if their Funūn profile has one) replacing the "External" or pending indicator.

</specifics>

<deferred>
## Deferred Ideas

- **Unified user profile replacing artist_profiles/industry_profiles**: The new `user_profiles` table is additive for now — it coexists with per-role tables. Full unification (deprecating per-role tables) is a future architectural phase.
- **Collaborator self-edit portal**: After joining, collaborators can update their own IPI/PRO directly in Funūn. Deferred from Phase 1. Still deferred — Phase 4 adds the `user_profiles` table which is the foundation; self-edit can build on it in a future phase.
- **"You've been credited" notification email**: Sending the new user an email listing all the projects they've been credited on after claiming. Nice-to-have, not in Phase 4 success criteria.

</deferred>

---

*Phase: 4-Collaborator Identity Reconciliation*
*Context gathered: 2026-06-29*
