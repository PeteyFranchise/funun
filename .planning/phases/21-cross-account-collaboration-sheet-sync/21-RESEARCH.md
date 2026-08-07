# Phase 21: Cross-Account Collaboration & Split-Sheet ↔ Project Sync - Research

**Researched:** 2026-08-01
**Domain:** Supabase RLS multi-tenancy (shared-ownership rewrite), Postgres SECURITY DEFINER recursion avoidance, Next.js 15 server-component data layer
**Confidence:** HIGH (all findings VERIFIED against this repo's own migrations/code — no external library research was needed; this phase adds no new dependencies)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Access model (①)**
- Shared **visibility**, owner-controlled **editing**. Collaborators see the project and
  their own piece; only owner (or a named co-owner) mutates the project.
- Splits are the exception — always negotiated through the sheet's existing
  approve/counter flow. No new money-mutation path; no silent cross-account split edits.

**Membership foundation (②) — load-bearing, security-critical**
- New `project_members` table: `(project_id, user_id, role)`.
- RLS on `vault_projects` (and child rows: tracks, vault_assets, vault_documents,
  tool_outputs) rewritten from "you own it" to "you own it OR you're on its guest list".
- Four roles from day one:
  - **owner** — view + edit + manage guest list + delete project
  - **co-owner** — view + edit + manage guest list (NOT delete)
  - **editor** — view + edit project (NOT manage guest list)
  - **viewer** — view only
- **Auto-membership:** being a writer on a linked split sheet adds the user as `viewer`.
  Promotion to editor/co-owner is a deliberate owner action.
- Migration must include `NOTIFY pgrst` schema-cache reload + access smoke tests
  (owner sees own; viewer sees shared; non-member is blocked).

**Mine vs shared (③)**
- Separate **"Shared with me"** lane in the vault — not mixed into the owned grid.
- Shared cards badged (e.g. "Shared · Maya's project" + role, "You're a viewer"); no edit
  affordances a viewer cannot use.
- Shared projects stay **OUT** of personal scoreboard math (dashboard counts/averages
  describe the viewer's OWN catalog only).

**Dashboard rework (④)**
- **Remove** the "Avg readiness" headline stat (vanity metric — blends released + draft,
  drives no action, penalizes starting new work).
- **Add "Closest to ready"** — action-oriented: names the nearest-to-deal-ready project +
  gates left + links to it.
- **Add "Your next moves" action feed** — home for cross-account tasks. Inclusion rule:
  **"is this waiting on you?"**, regardless of who owns the song.
  - Launch action set: complete a split-sheet draft · review/approve a split sheet ·
    respond to a counter-proposal · sign a document.
  - Ranking: **money & signatures ALWAYS pinned on top** (locked tier, not reorderable —
    platform protects the user from burying a contract). Softer items rank below.
  - Data designed so per-user prefs (order, muted categories) can bolt onto the flexible
    tier later; configurability UI is a fast-follow, NOT in this cut.

**Identity: dedupe vs claim (keep distinct)**
- **Roster dedupe** — per-owner, keyed on TYPED email; reuses an existing collaborator
  instead of duplicating; auto-fills their PRO/IPI. Trusts the typed email.
- **Claim** — cross-owner, keyed on VERIFIED email at signup; reunites the same real
  person's credits across owners; surfaces credits + shared projects.
- **Cross-account membership grant keys off VERIFIED identity only, never a typed email.**
- When multiple collaborator rows resolve to one new signup: keep each owner's private
  roster notes, but rights data (PRO/IPI/legal name) federates from the verified profile.

**Sync behavior**
- Writers/roles/splits stay linked while the sheet status = `draft`.
- The link **snaps on send-for-signature**: signed sheet frozen forever (migration 062
  lifecycle), project keeps evolving independently.
- Writers ⊆ credits: the project can carry performers/producers the writer sheet never
  mentions; the 100% split math stays the sheet's job.

### Claude's Discretion
- Exact RLS policy SQL shape for child rows under shared access.
- Whether `editor` may trigger sheet actions or only project edits.
- Real-time subscription vs refresh-on-load for the live-sync indicator.
- Table/column naming, index choices, and migration number (next free).
- Component/file layout, matching existing conventions.

### Deferred Ideas (OUT OF SCOPE)
- Per-user configurability UI for the "Your next moves" feed (order, muted categories).
- Additional action-feed types beyond the launch set (invites to accept, audio-missing).
- Rich co-owner/editor promotion management UX (roles exist in data day one).
</user_constraints>

<phase_requirements>
## Phase Requirements

No numbered REQ IDs exist for this phase — the locked scope is the decision record at
`21-SPEC.md` (①–④ + identity rules + build slate). Mapping each locked decision to the
research that supports planning it:

| Decision | Description | Research Support |
|----------|-------------|-------------------|
| ② Membership foundation | `project_members` table + RLS rewrite on `vault_projects` + 4 child tables | §"The RLS recursion trap" + §"project_members table design" + §"Child-table ownership landmine" |
| ② Auto-membership | Writer on linked sheet → viewer | §"Auto-membership from linked-sheet writers" — includes the discovery that the trigger's naive input signal (`split_sheet_parties.user_id`) is dead code today |
| ③ Mine vs shared | "Shared with me" lane, badged cards, scoreboard exclusion | §"Dashboard + vault touchpoints" |
| ④ Dashboard rework | Remove avg readiness, add "Closest to ready", add "Your next moves" | §"Dashboard + vault touchpoints" — reuses the `buildAttentionSections()` precedent |
| Identity: dedupe vs claim | Cross-account access keys off verified identity only | §"Identity: dedupe vs claim — the actual verified-identity signal" |
| Sync behavior | Writers/roles/splits sync while draft; snaps on send-for-signature | §"Sheet ↔ project bidirectional sync" — flags a status-boundary nuance against the existing `lifecycle.ts` vocabulary |
| Migration numbering | Next free migration, human-gate | §"Migration numbering + Phase 20 in-flight state" |
</phase_requirements>

## Summary

This phase's hard problem is not new technology — it's correctly widening an existing,
already-recursion-scarred RLS surface without repeating a bug this codebase has already
paid for once. Migration 064 (`fix_split_sheet_rls_recursion`) is a complete, well-documented
worked example of the EXACT failure mode Phase 21 is at risk of reintroducing:
`split_sheets` ↔ `split_sheet_parties` policies each subquerying the other table caused
`42P17 infinite recursion detected in policy`, breaking every authenticated read AND every
`tracks` insert (because `calculate_vault_readiness()` transitively reads `split_sheets`).
The fix was two `SECURITY DEFINER` helper functions that read the "other" table with RLS
bypassed, each scoped by a predicate already implied by that table's own existing policy.
`project_members` ↔ `vault_projects` is the same shape of relationship (two tables whose
row-visibility rules each need to read the other), so this phase should ship the
SECURITY DEFINER helper pair from the start rather than discover the recursion in
production and patch it later as migration 064 had to.

The second load-bearing finding is more consequential than the RLS shape itself: every
child table under `vault_projects` (`tracks`, `vault_assets`, `vault_documents`,
`tool_outputs`) currently scopes both its RLS policy AND every API route's ownership check
to the **row's own `user_id` column** (`.eq('user_id', user.id)`), not the parent project's
owner. Today `user_id` always equals the project owner because only the owner has ever been
able to write these rows. The instant a second person (an editor, or even an owner writing
via a session that resolves to a different id — not currently possible, but the point is the
column conflates "who created this row" with "who may see/edit it") is allowed into this
tree, that conflation breaks both directions: the owner cannot see rows an editor wrote
under their own `user_id`, and an editor cannot see the owner's pre-existing rows. Rewriting
`vault_projects`' policy to "own it OR on its guest list" without also re-deriving the four
child tables' access rule through the **project's** ownership/membership (not the row's own
`user_id`) will not achieve the sharing goal at all for those four tables — this is the
single most important correction to make going into planning.

Third: `split_sheet_parties.user_id` — the column the "auto-membership from linked-sheet
writers" decision implicitly assumes is the trigger signal for "this writer has a Funūn
account" — is written NOWHERE in the current codebase (verified: not in the create route,
not the PATCH route, not `/api/approve/[token]`, not any migration/trigger). It is only ever
read (by `list.ts`'s party-of query and the `"Party sees own row"` RLS policy), which means
that access path is presently dead for every real user. The actual, live "verified identity"
signal in this codebase is `collaborators.claimed_by`, set exclusively by
`claim_collaborators()` on signup via a case-insensitive email match — this is what
"VERIFIED identity" already means operationally in Funūn, and Phase 21's auto-membership
mechanism should key off it (via `split_sheet_parties.collaborator_id → collaborators.claimed_by`),
not off the unpopulated `user_id` column.

**Primary recommendation:** Build the `project_members` ↔ `vault_projects` RLS pair with two
`SECURITY DEFINER` helper functions from day one (mirroring migration 064's precedent
exactly), rewrite all four child tables' access rule to resolve through the **project's**
owner/membership (not the row's own `user_id`), and derive auto-membership from
`collaborators.claimed_by` (the only currently-live verified-identity signal) rather than
the currently-dead `split_sheet_parties.user_id` column.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project visibility (owner/co-owner/editor/viewer) | Database / RLS | API / Backend | Postgres RLS is this codebase's sole multi-tenancy enforcement layer (no app-level authorization framework); every existing shared-visibility feature (public profiles, block enforcement, DM participancy) is enforced at the RLS layer first, with API routes adding scoped double-checks on top — this phase must follow that precedent, not invent a parallel app-layer gate |
| Guest-list management (add/remove/promote members) | API / Backend | Database / Storage | Mirrors `capability_grants`' pattern: writes route through service-role API handlers after an ownership check (never direct authenticated PostgREST INSERT/UPDATE/DELETE on the membership table) |
| Auto-membership from linked-sheet writers | Database / Storage (trigger) | API / Backend | The signal (`collaborators.claimed_by` transitioning to non-null, or a party row's `collaborator_id` resolving to an already-claimed collaborator) can fire from either a `collaborators` update (signup) or a `split_sheet_parties`/`split_sheets` update (party added, or sheet leaves draft) — a DB trigger is the only tier that sees all three orderings without app-layer coordination, matching migration 066's `collaborators_claimed_implies_confirmed()` precedent |
| "Shared with me" vault lane | Frontend Server (SSR) | Database / RLS | A NEW server-component query distinct from the existing owner-scoped `.eq('user_id', user.id)` queries in `vault/page.tsx`/`dashboard/page.tsx` — RLS makes the rows visible, but the app must explicitly query for them (the existing owner queries will keep excluding shared rows by construction, which is actually desirable for ③'s scoreboard-exclusion rule) |
| "Your next moves" action feed | Frontend Server (SSR) | — | Pure structured-query derivation over already-fetched rows, no DB call of its own — mirrors `lib/contracts/locker-attention.ts`'s `buildAttentionSections()` exactly (same author, same phase family, explicitly "structured queries, not an AI reading of the same data") |
| Split-sheet ↔ project sync (writers/roles/splits) | API / Backend | Database / Storage (trigger, optional) | The existing `PATCH /api/split-sheets/[id]` already does a full party-set diff (`partiesActuallyChanged`) and already gates on the freeze boundary (`assertEditable`) — sync should hook into this existing app-layer choke point, not build a second, competing mechanism |
| Readiness score recompute for shared-project writes | Database / Storage | — | `update_vault_readiness()` (migration 001) is a plain `LANGUAGE plpgsql` trigger (NOT `SECURITY DEFINER`) that `UPDATE`s `vault_projects` — this needs explicit attention once a non-owner role can trigger it (see Pitfall 3) |

## Standard Stack

No new external dependencies are required for this phase. Everything below is either
already in `package.json` or is a Postgres/Supabase built-in this codebase already uses
extensively.

### Core (already in use — no install needed)
| Library | Version (verified `package.json`) | Purpose | Why Standard (for this repo) |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.45.0 | DB client, RLS-enforced reads/writes | Existing sole DB access layer |
| `@supabase/auth-helpers-nextjs` | ^0.10.0 | Session-bound server client (`createApiClient`/`createServerClient`) | Existing auth integration |
| `next` | ^15.0.0 | Server components, API routes | Existing framework |
| `zod` | ^3.23.0 | Available for input validation if the guest-list API routes want schema validation (existing routes in this repo mostly hand-roll allowlist sanitizers instead — see Architecture Patterns) | Already a dependency; use is optional/discretionary |
| Postgres `SECURITY DEFINER` functions | Postgres 15+ (Supabase-managed) | RLS recursion-breaking helpers | Established repo pattern (migrations 034 `clear_featured_if_unpublished`, 035 `no_block`, 064 `is_split_sheet_initiator`/`is_split_sheet_party`, 066 `split_sheet_party_response_confirms_collaborator`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Postgres RLS + SECURITY DEFINER helpers | App-layer authorization middleware (e.g. a `can()` check library) | Rejected — this codebase has zero app-layer authorization framework; every existing access-control feature (blocks, connections, DMs) is RLS-first. Introducing a parallel app-layer gate for just this feature would fragment the security model and create two sources of truth for "who can see this row" |
| Trigger-driven auto-membership | Client/API-route-driven auto-membership (insert `project_members` row explicitly inside the party-add/claim API handlers) | Viable alternative, and arguably simpler to reason about than a DB trigger — but it requires the app layer to correctly fire on THREE distinct orderings (party added after claim, party added before claim, sheet leaves draft after both). A single `SECURITY DEFINER` helper function called from all three trigger sites keeps the logic in one place; app-layer coordination risks missing one ordering. Recommend the DB-trigger approach, consistent with migration 066's precedent, but flag as Claude's Discretion per CONTEXT.md |

**Installation:** none required.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages (verified: no new npm
dependency appears anywhere in the build slate; every primitive needed — RLS, SECURITY
DEFINER functions, Next.js server components — already exists in this codebase).

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌─────────────────────────────────────────────┐
                    │  split_sheets / split_sheet_parties          │
                    │  (existing, migration 018/062/066/067)       │
                    │                                               │
                    │  party row gets collaborator_id ──────────┐  │
                    └──────────────┬────────────────────────────┼──┘
                                   │ sheet linked to a project    │
                                   │ (vault_project_id)           │
                                   ▼                               │
                    ┌─────────────────────────────────────────────┤
                    │  TRIGGER: sync_project_membership_for_sheet  │
                    │  fires on:                                   │
                    │   - collaborators.claimed_by NULL→set        │  claimed_by set
                    │   - split_sheet_parties insert/update        │◄─(signup, claim_collaborators())
                    │   - split_sheets.status leaves 'draft'        │
                    │  resolves: party.collaborator_id              │
                    │            → collaborators.claimed_by         │
                    │            → INSERT project_members(viewer)   │
                    └──────────────┬────────────────────────────────┘
                                   │ upserts
                                   ▼
                    ┌─────────────────────────────────────────────┐
                    │  project_members (NEW)                       │
                    │  (project_id, user_id, role, ...)             │
                    └──────────────┬────────────────────────────────┘
                                   │ read by SECURITY DEFINER helper
                                   │ is_project_member(project_id, uid)
                                   ▼
      ┌────────────────────────────────────────────────────────────────┐
      │  vault_projects RLS (REWRITTEN)                                 │
      │  SELECT: is_project_owner(id, uid) OR is_project_member(id,uid) │
      │  UPDATE: is_project_owner(id, uid)                              │
      │          OR project_member_role(id, uid) IN ('co-owner','editor')│
      │  DELETE: is_project_owner(id, uid) only                         │
      └───────────────────────────┬──────────────────────────────────────┘
                                   │ same two helpers, keyed on project_id
                                   │ NOT the child row's own user_id (Pitfall 1)
                                   ▼
      ┌────────────────────────────────────────────────────────────────┐
      │  tracks / vault_assets / vault_documents / tool_outputs RLS      │
      │  (REWRITTEN — was row.user_id = auth.uid(), becomes project-scoped)│
      └───────────────────────────┬──────────────────────────────────────┘
                                   │
              ┌────────────────────┴─────────────────────┐
              ▼                                            ▼
   app/(artist)/vault/page.tsx                app/(artist)/dashboard/page.tsx
   - existing "owned" query: .eq('user_id',…)  - existing stats: STILL owner-only
     unaffected by RLS widening (app-layer      (same .eq filter — ③'s scoreboard-
     filter already excludes shared rows)        exclusion rule is satisfied for free)
   - NEW "shared with me" query: joins           - REMOVE "Avg readiness" stat
     project_members WHERE user_id = me          - ADD "Closest to ready" (from
   - VaultProjectCard: NEW shared-badge variant    readinessItemsForProject() over
                                                    owned projects only)
                                                  - ADD "Your next moves": derived from
                                                    buildAttentionSections()-style query
                                                    across ALL sheets/docs the viewer
                                                    can see (owned + shared), reusing
                                                    lib/contracts/locker-attention.ts's
                                                    pattern, not the notifications table
```

### Recommended Project Structure
```
supabase/migrations/
├── 078_project_members.sql          # project_members table + RLS helpers + child-table
│                                     # policy rewrite + NOTIFY pgrst (human-gated push)
lib/
├── vault/
│   └── membership.ts                # role helpers: canEditProject(role), canManageGuests(role),
│                                     # ROLE labels — pure, no I/O, mirrors readiness-tiers.ts style
├── dashboard/
│   └── next-moves.ts                # buildNextMoves() — pure derivation, mirrors
│                                     # lib/contracts/locker-attention.ts's buildAttentionSections()
app/api/
├── vault/[projectId]/members/
│   └── route.ts                     # GET (list), POST (add/promote), DELETE (remove) — service-role,
│                                     # owner/co-owner only, mirrors capability_grants' request/approve
components/vault/
├── VaultProjectCard.tsx              # extend VaultCard type with optional shared-badge fields
├── SharedProjectBadge.tsx            # NEW — "Shared · {owner name} · You're a {role}"
app/(artist)/vault/page.tsx           # add "Shared with me" lane (new query + new section)
app/(artist)/dashboard/page.tsx       # remove avg readiness stat; add Closest-to-ready + Your-next-moves
```

### Pattern 1: SECURITY DEFINER helper pair to break the two-table RLS cycle
**What:** Two `STABLE SECURITY DEFINER` functions — one that checks project ownership by
reading `vault_projects` directly (bypassing its own RLS), one that checks membership by
reading `project_members` directly (bypassing its own RLS) — used inside each other's
policy bodies so the Postgres rewriter never re-enters a relation already on its expansion
stack.

**When to use:** Any time two tables' RLS policies need to read each other (this codebase
has hit this exact bug once already — migration 018 → migration 064).

**Example (adapted directly from migration 064's proven shape):**
```sql
-- Source: supabase/migrations/064_fix_split_sheet_rls_recursion.sql (this repo)
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID, p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_projects
    WHERE id = p_project_id AND user_id = p_uid
  )
$$;

CREATE OR REPLACE FUNCTION public.project_member_role(p_project_id UUID, p_uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_uid
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.project_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.project_member_role(uuid, uuid) TO authenticated;

-- vault_projects: split the old single USING/WITH CHECK policy into
-- per-operation policies (SELECT widens; UPDATE/DELETE stay narrow).
DROP POLICY IF EXISTS "Artists manage own vault projects" ON vault_projects;

CREATE POLICY "vault_projects_select_owner_or_member" ON vault_projects
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "vault_projects_update_owner_or_editor" ON vault_projects
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (SELECT public.project_member_role(id, auth.uid())) IN ('co-owner', 'editor')
  );

CREATE POLICY "vault_projects_insert_own" ON vault_projects
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "vault_projects_delete_owner_only" ON vault_projects
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- project_members: its own SELECT policy reads vault_projects (via
-- is_project_owner, DEFINER) — the other half of the cycle migration 064
-- already proved is safe once both directions go through a helper.
CREATE POLICY "project_members_select" ON project_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())                                   -- see your own row
    OR (SELECT public.is_project_owner(project_id, auth.uid()))      -- owner sees all
    OR (SELECT public.project_member_role(project_id, auth.uid())) = 'co-owner'
  );
```

### Pattern 2: Project-scoped (not row-owner-scoped) child-table access
**What:** Rewrite `tracks`/`vault_assets`/`vault_documents`/`tool_outputs` RLS from
`USING (auth.uid() = user_id)` to a predicate keyed on the row's `project_id`, resolved
through the SAME `is_project_owner`/`project_member_role` helpers used on `vault_projects`
itself — not the row's own `user_id`.

**When to use:** Every one of the four child tables, for SELECT at minimum (write policies
too, if `editor` write-enablement ships in this phase — see Pitfall 4 on scope).

**Example:**
```sql
-- Source: this repo's migration 001 (original) vs. the required rewrite.
-- BEFORE (migration 001) — keys off the ROW's creator, not the project:
--   CREATE POLICY "Artists manage own tracks" ON tracks
--     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- AFTER — keys off the PARENT PROJECT's owner/membership:
DROP POLICY IF EXISTS "Artists manage own tracks" ON tracks;

CREATE POLICY "tracks_select_project_owner_or_member" ON tracks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL
  );

CREATE POLICY "tracks_write_project_owner_or_editor" ON tracks
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  )
  WITH CHECK (
    (SELECT public.is_project_owner(project_id, auth.uid()))
    OR (SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')
  );
-- vault_documents/tool_outputs: project_id is NULLABLE on both — add
-- `OR (project_id IS NULL AND user_id = auth.uid())` to preserve access
-- to standalone (unattached) rows, which the owner-only fallback still owns.
```

### Pattern 3: Pure structured-query derivation for the action feed
**What:** A no-I/O TypeScript function that turns already-fetched row arrays into ranked
feed sections — reusing this repo's own precedent instead of building a notifications-table
read or an AI summarization step.

**When to use:** "Your next moves" (④).

**Example:**
```typescript
// Source: lib/contracts/locker-attention.ts (this repo) — the pattern to mirror,
// not literal code to copy verbatim (that module answers "what needs signing on
// THIS project's Locker"; next-moves.ts must answer the same question ACROSS every
// project the viewer can see, owned or shared, and additionally separate the
// "pinned" money/signature tier from the "flexible" softer tier per decision ④).
export function buildAttentionSections({
  viewerUserId, sheets, documents, projects, hiddenDocumentIds,
}: BuildAttentionSectionsInput): AttentionSections {
  // ... pure switch/filter over sheet.status, no DB call inside this function ...
}
```

### Anti-Patterns to Avoid
- **Naive `EXISTS (SELECT ... FROM other_table WHERE ...)` inside an RLS policy that
  itself is read by that other table's own policy:** this is exactly migration 018's bug,
  fixed reactively in migration 064. Do not repeat it for `project_members` ↔
  `vault_projects` — start with the `SECURITY DEFINER` helper pair (Pattern 1).
- **Treating "add a guest-list row" as equivalent to "the child tables are now shared":**
  RLS on `vault_projects` alone does nothing for `tracks`/`vault_assets`/`vault_documents`/
  `tool_outputs` unless their policies are independently rewritten (Pitfall 1).
- **Keying auto-membership off `split_sheet_parties.user_id`:** this column is written
  nowhere in the current codebase (Pitfall 2) — it is not a live signal.
- **A notifications-table read for "Your next moves":** this codebase's own precedent
  (`buildAttentionSections()`) explicitly rejects an event-log read in favor of a
  structured, always-correct derivation over the current row state — reuse that pattern,
  not `lib/notifications`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-table RLS cycle detection | A novel recursion-avoidance scheme | The exact `SECURITY DEFINER` two-helper pattern from migration 064 | Already proven in this codebase against a byte-identical failure mode; deviating risks reintroducing `42P17` |
| "Is this user allowed to write this row" for a request/approve-style guest list | A bespoke state machine | Mirror `capability_grants`' request/approve shape (migration 042) + `lib/capabilities/grant.ts`/`check.ts`'s service-role-only write doctrine | `project_members` has the same "some writes need elevation, reads are self-scoped" shape as capability grants; no need to invent a new pattern |
| Split-sheet-to-project field sync | A generic bidirectional sync engine | Hook into the EXISTING `PATCH /api/split-sheets/[id]` party-diff (`partiesActuallyChanged`) and freeze gate (`assertEditable`) — these already compute "what changed" on every save | The diff/freeze machinery already exists and is tested; a second sync engine would duplicate and could drift from it |
| Action-feed ranking/derivation | An AI/LLM summarization pass over notifications | Pure TypeScript derivation, `lib/contracts/locker-attention.ts`'s `buildAttentionSections()` pattern | This codebase's own explicit design rationale ("Funūn generated every row this module looks at... inferring what is already known would be slower and less correct than just asking the database") — reuse it |

**Key insight:** almost everything this phase needs (the recursion fix shape, the
request/approve write-elevation shape, the party-diff/freeze-gate mechanism, and the
structured-derivation feed pattern) already exists once in this exact codebase, built for
an adjacent problem. The research risk here is not "what's the right library" — it's "did
you find the precedent," because every one of these four patterns was hard-won in a prior
phase (Phase 17/18) and re-deriving any of them from scratch risks reintroducing a bug this
codebase already fixed once.

## Common Pitfalls

### Pitfall 1: Child-table RLS/ownership is keyed on the ROW's `user_id`, not the project's owner (CRITICAL — blocks the sharing goal entirely if missed)
**What goes wrong:** `tracks`, `vault_assets`, `vault_documents`, `tool_outputs` each carry
their own `user_id` column (the row's creator), and BOTH their RLS policies (migration 001:
`USING (auth.uid() = user_id)`) AND every API mutation route (verified via repo-wide grep:
`app/api/vault/[projectId]/tracks/[trackId]/*/route.ts`, `app/api/vault/[projectId]/assets/route.ts`,
etc. — all filter `.eq('user_id', user.id)`) check the row's own creator, never the parent
project's owner. Today this is invisible because only the project owner has ever written
these rows, so `row.user_id === vault_projects.user_id` always. The instant a second writer
exists, this conflation surfaces two ways: (a) rows an editor creates become invisible to
the actual project owner, and (b) the editor cannot see rows the owner already created.
**Why it happens:** the schema was designed for a single-writer-per-project world; nothing
about "who owns this row" was ever meant to diverge from "who owns this project" until now.
**How to avoid:** rewrite all four child tables' RLS to resolve access through `project_id`
via the SAME `is_project_owner`/`project_member_role` helpers used on `vault_projects`
(Pattern 2) — SELECT at minimum for the "shared visibility" half of ①/②/③. Separately
decide (see Pitfall 4) how far to also update the read/write API-route layer.
**Warning signs:** a shared viewer/editor can see the project card but its track list is
empty, or the owner stops seeing tracks after handing off editing.

### Pitfall 2: `split_sheet_parties.user_id` is a dead column — verified, not assumed
**What goes wrong:** the auto-membership decision ("being a writer on a linked split sheet
adds you as viewer") reads naturally as "watch `split_sheet_parties.user_id`." That column
is read in three places in this codebase (`lib/split-sheets/list.ts`'s party-of query, the
`"Party sees own row"` RLS policy from migration 018, `app/(artist)/split-sheets/[id]/page.tsx`'s
`isParty` check) but is WRITTEN nowhere — not in `POST /api/split-sheets` (its `PARTY_FIELDS`
allowlist omits `user_id`), not in `PATCH /api/split-sheets/[id]` (same allowlist), not in
`/api/approve/[token]` (only writes `IDENTITY_FIELDS`), not in any migration/trigger.
**Why it happens:** the column appears to have been designed-for but never wired up — a
genuine, pre-existing gap this phase's auto-membership work would silently inherit if it
assumed the column was live.
**How to avoid:** derive "is this party a Funūn account holder, verified" from
`split_sheet_parties.collaborator_id → collaborators.claimed_by` instead — `claimed_by` IS
reliably populated, exclusively by `claim_collaborators()` on signup via case-insensitive
email match (migrations 026/072/076). This is also the ONLY signal in this codebase that
matches the CONTEXT.md rule "keys off VERIFIED identity, never a typed email" — `claimed_by`
is set at signup against a verified account email, never against a collaborator's
free-typed `email` field.
**Warning signs:** a writer with a live Funūn account never gets auto-added as a viewer, no
matter what they do.

### Pitfall 3: `update_vault_readiness()` is not `SECURITY DEFINER` — a non-owner write can break the readiness trigger
**What goes wrong:** `calculate_vault_readiness()`/`update_vault_readiness()` (migration
001, redefined 062/070) fires `AFTER INSERT/UPDATE/DELETE` on `tracks`/`vault_documents`/
`vault_assets`/`tool_outputs` and does `UPDATE vault_projects SET vault_readiness_score = ...`.
This trigger function is plain `LANGUAGE plpgsql` (invoker rights), NOT `SECURITY DEFINER`.
Once `vault_projects`' UPDATE policy is scoped to `owner OR co-owner OR editor` (Pattern 1),
this specific `UPDATE` will succeed for those roles — but ONLY if the UPDATE policy is
widened correctly. If it is left unwidened (e.g., only the SELECT policy is broadened, which
is the easy mistake to make when reading "own it OR on its guest list" as a read-visibility
rule), an editor's track insert will trigger this function, which will then fail its own
`UPDATE vault_projects` with an RLS violation — silently rolling back the editor's INSERT
inside the same transaction, or surfacing as an opaque `new row violates row-level security
policy for table "vault_projects"` error on what looks like an unrelated write.
**Why it happens:** the phase's SPEC language ("own it OR on its guest list") is easy to
read as SELECT-only; the readiness trigger is an indirect, easy-to-miss UPDATE dependency.
**How to avoid:** either (a) widen `vault_projects`' UPDATE policy to include co-owner/editor
(Pattern 1 already does this) and confirm it, or (b) more defensively, make
`update_vault_readiness()` `SECURITY DEFINER SET search_path = ''` (matching the
`clear_featured_if_unpublished()` precedent from migration 034) so score recompute never
depends on the writing role's own RLS grant at all. Recommend (b) as the more robust fix
regardless of (a), since it decouples "can write my own piece" from "can trigger a
project-wide score recompute."
**Warning signs:** editor-role writes to a shared project intermittently fail with an RLS
error on `vault_projects`, not on the table the editor actually touched.

### Pitfall 4: The role table (②) and the access-model prose (①) are not perfectly aligned — scope this explicitly before planning tasks
**What goes wrong:** CONTEXT.md's ① prose says "only owner (or a named co-owner) mutates
the project" while ②'s role table gives `editor` "Edit project ✓" too. If `editor` write
access is wired all the way through (RLS write policies on all 5 tables PLUS every existing
mutation API route's `.eq('user_id', user.id)` ownership check across `app/api/vault/**`),
that is a substantially larger surface than the 3-wave build slate implies — dozens of
existing routes (tracks/audio/stems/isrc/instrumental, assets, documents, tool_outputs)
would each need an ownership-check rewrite from "row.user_id === me" to "I have write access
to this row's project," on top of the RLS rewrite itself.
**Why it happens:** the role TABLE is a day-one data model decision (per CONTEXT.md, roles
"exist in data day one"); it does not by itself commit to wiring functional editor writes
through every API route in this phase — "rich co-owner/editor promotion UX" is explicitly
deferred, which hints the SPEC author intended the ROLE to exist without every write path
necessarily being live yet.
**How to avoid:** resolve this ambiguity explicitly in planning/discuss-phase before
scoping Wave 1 tasks: confirm whether "editor can edit project" (②) means (a) DB-level RLS
permits it, with API-route wiring as a fast-follow, or (b) the full API-route audit is
in-scope for this phase. Recommendation: scope (a) for Wave 1 — RLS grants editor row-level
write access to the 5 tables (data model is correct and forward-compatible), but do NOT
budget an audit of every existing mutation route in this phase unless discuss-phase confirms
it; ① 's prose ("owner or co-owner mutates") is the safer functional default to actually ship
UI/API affordances for in v1, with `editor` write staying RLS-permitted-but-UI-unexercised
until a later phase builds the editor-facing edit surface.
**Warning signs:** scope creep during planning if this is not resolved up front — a
full API-route audit could roughly double Wave 1/2's size.

### Pitfall 5: The sheet-sync "while draft" language doesn't match the codebase's own edit-gate vocabulary
**What goes wrong:** CONTEXT.md says "writers/roles/splits stay linked while the sheet
status = `draft`... the link snaps on send-for-signature." The codebase's OWN freeze-boundary
module (`lib/split-sheets/lifecycle.ts`) already defines this more precisely:
`LIVING_DRAFT_STATUSES = ['draft', 'countered']` (freely editable) vs.
`CONSENSUS_RESET_STATUSES = ['pending_approval', 'approved']` (editable, but editing resets
consensus back to draft) vs. `esign_pending`/`executed` (blocked/immutable). "Send-for-
signature" in this codebase is the `mint-envelope` route transitioning to `esign_pending`
(NOT the `send-for-approval` route, which only reaches `pending_approval`). If Phase 21's
sync logic keys literally on `status === 'draft'`, it will incorrectly stop syncing the
instant a sheet is sent for approval (`pending_approval`) even though the sheet is still
editable at that point (with a consensus reset) per the existing freeze-boundary rules.
**Why it happens:** the CONTEXT.md summary is a simplification of a five-state lifecycle;
the actual boundary that matters for "is this still safe to auto-sync" is "not yet frozen"
(`esign_pending`/`executed`), not "literally still in the first state."
**How to avoid:** key the sync-active predicate off the SAME vocabulary
`lifecycle.ts` already exports (e.g., `status NOT IN ('esign_pending', 'executed')`, or
reuse `LIVING_DRAFT_STATUSES`/`CONSENSUS_RESET_STATUSES` directly) rather than a fresh
literal `=== 'draft'` check — this also means sync should hook the SAME PATCH-route choke
point that already computes `editsParties`/`assertEditable`, not a new parallel mechanism.
**Warning signs:** a sheet sent for approval (but not yet minted) silently stops reflecting
new writer/split edits on its linked project, even though the sheet itself is still editable.

### Pitfall 6: Migration numbering collision with Phase 20's reserved, currently-out-of-repo `077`
**What goes wrong:** the highest migration file currently in the repo is `076_rename_
artist_profiles_to_user_profiles.sql`. A `077_drop_artist_profiles_compat_view.sql` was
authored (Phase 20, commit `ad257c6`) and then DELIBERATELY REMOVED from the repo (commit
`1e497d0`, 2026-07-25) specifically so a plain `supabase db push` would not apply it before
076's zero-downtime soak completes — it is queued to be re-added verbatim at the Phase 20
"20-04" checkpoint. If Phase 21's migration claims number `077`, it will collide with this
already-reserved, soon-to-reappear number the moment Phase 20 re-adds its own `077`.
**Why it happens:** the file's absence from the repo makes `077` LOOK free by a naive
`ls supabase/migrations/` check; it is not actually free — it is reserved-but-parked.
**How to avoid:** number Phase 21's first migration `078` (not `077`). Additionally: Phase
20 is NOT yet complete — per `ROADMAP.md`, `20-03` (push #1, migration 076) and `20-04`
(push #2, migration 077, drop view) are both still `[ ]` unchecked. The runtime code in
this branch has ALREADY been mechanically renamed to query `user_profiles` (verified: 0
`artist_profiles` references, 85 `user_profiles` references in `app/`+`lib/`), meaning
this branch's code currently assumes a live-DB state (`user_profiles` exists) that has not
actually been pushed yet. `project_members.user_id` should reference `auth.users(id)`
directly (matching every other ownership FK in this schema — `vault_projects.user_id`,
`collaborators.user_id`, `split_sheet_parties.user_id` all reference `auth.users`, never
`artist_profiles`/`user_profiles`), so `project_members`'s OWN schema has no hard dependency
on migration 076/077 landing first. But operationally, Phase 21's Wave-1 migration push
should still be sequenced strictly AFTER Phase 20's 20-03/20-04 human-gated pushes are
confirmed live (`supabase migration list` LOCAL=REMOTE through 077), both because ROADMAP.md
already declares this dependency ("Depends on: Phase 20 — profile rename, RLS surface
stable") and because stacking two independent human-gated schema soaks at once multiplies
operational risk for no benefit.
**Warning signs:** `supabase db push` fails or double-applies if a `077` file from this
phase collides with Phase 20's re-added `077`.

## Code Examples

### The RLS recursion fix, verbatim precedent
```sql
-- Source: supabase/migrations/064_fix_split_sheet_rls_recursion.sql (THIS repo)
-- Full text read during research; reproduced pattern in Architecture Patterns → Pattern 1.
-- Read the full file before writing project_members' migration — its extensive header
-- comment explains WHY each design choice (STABLE, SECURITY DEFINER, SET search_path = '',
-- TO authenticated, the "does this widen visibility?" proof) is load-bearing, not
-- decorative.
```

### The structured-query action-feed precedent
```typescript
// Source: lib/contracts/locker-attention.ts (THIS repo), buildAttentionSections()
// Full file read during research. Directly reusable inputs for "Your next moves":
// - AWAITING_SIGNATURE_STATUSES bucket already answers "review/approve a split sheet" +
//   "respond to a counter-proposal" (its 'countered' + CONSENSUS_RESET_STATUSES members)
// - draftsInProgress already answers "complete a split-sheet draft" (initiator-only,
//   matching decision ④'s launch action set item 1)
// - The one gap: this module is scoped to ONE viewer's OWNED projects' sheets/documents
//   today (called from app/(artist)/contracts/page.tsx over the viewer's own rows) — Phase
//   21's "Your next moves" needs the SAME derivation fed by sheets/documents reachable
//   through SHARED projects too, which is a caller-side (query) change, not a change to
//   this module's own pure logic.
```

### capability_grants — the request/approve write-elevation shape to mirror for guest-list writes
```sql
-- Source: supabase/migrations/042_capability_grants.sql (THIS repo)
REVOKE INSERT, UPDATE, DELETE ON capability_grants FROM authenticated, anon;
-- All writes route through service-role API routes after an ownership check
-- (lib/capabilities/grant.ts's grantCapability()) — mirror this for project_members
-- guest-list mutations (add/remove/promote member), gated to owner/co-owner only.
```

## State of the Art

Not applicable in the "external ecosystem changed" sense — this phase's patterns are all
internal precedent, not evolving external library APIs. The one genuine "state of the art"
shift is internal to this codebase's own history:

| Old Approach (pre-064) | Current Approach (this repo, post-064) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Naive cross-table `EXISTS` subqueries in RLS policies | `SECURITY DEFINER` helper-function pair, each scoped to a predicate already implied by the OTHER table's own existing policy | Migration 064, 2026-07 (Phase 17/18 era) | Any new two-table shared-visibility relationship (like `project_members` ↔ `vault_projects`) must use this pattern from the start |
| Row-level `user_id`-only ownership on vault child tables | Not yet changed — Phase 21 is the first phase to need project-scoped (not row-owner-scoped) child access | This phase | See Pitfall 1 |

**Deprecated/outdated:** the single combined `USING (...) WITH CHECK (...)` policy style
used throughout migration 001 (one policy covering SELECT+INSERT+UPDATE+DELETE together) is
still functionally fine for pure single-owner tables, but is NOT adequate once a table needs
different rules per operation (e.g., "viewer can SELECT but not UPDATE") — Phase 21 is the
first phase in this codebase to need that split on `vault_projects` itself.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The recommended design gates auto-membership to fire only once a linked sheet's status leaves `draft` (mirroring `fetchSplitSheetsForUser()`'s existing `.neq('status', 'draft')` party-of filter and P18-11's "a draft is invisible to non-initiators" rule) | Architecture Patterns diagram / Pitfall 5 | If wrong (i.e. the intent is to grant shared visibility even while the sheet is still a private, unsent draft), a writer would gain project visibility before the initiator has shared anything — worth confirming explicitly in discuss-phase/planning, since CONTEXT.md's decision text doesn't state this boundary explicitly |
| A2 | Recommendation to scope `editor` write access as "RLS-permitted, API-route-wiring deferred" (Pitfall 4) rather than auditing every existing mutation route in this phase | Pitfall 4 | If wrong (full editor write-enablement IS in scope), Wave 1/2 sizing needs to roughly double to cover the `app/api/vault/**` route audit — flag for explicit confirmation before task breakdown |
| A3 | Recommendation to make `update_vault_readiness()` `SECURITY DEFINER` (Pitfall 3, option b) rather than relying solely on the widened UPDATE policy | Pitfall 3 | Low risk either way — this is a defense-in-depth recommendation, not a hard requirement; the widened UPDATE policy alone (option a) is sufficient if implemented correctly |
| A4 | `project_members.user_id` should reference `auth.users(id)` directly, not `user_profiles(id)` | project_members table design (Pitfall 6) | Very low risk — this exactly matches every existing ownership FK in this schema (`vault_projects.user_id`, `collaborators.user_id`, `split_sheet_parties.user_id`); an explicit table read confirmed this pattern universally |

**If this table is empty:** N/A — see above; both A1/A2 should be explicitly confirmed
during discuss-phase or early planning since they materially affect scope, not just
implementation detail.

## Open Questions

1. **Does `editor`'s "edit project" (②'s role table) mean full API-route write-enablement in this phase, or RLS-permitted-but-not-yet-wired?**
   - What we know: CONTEXT.md's ① prose says only owner/co-owner mutate; ②'s role table
     gives editor "Edit project ✓"; "rich promotion UX" is explicitly deferred.
   - What's unclear: whether the DEFERRAL implies the underlying write mechanism is also
     deferred, or only its UX polish.
   - Recommendation: default to RLS-permits-it/API-route-audit-deferred (Pitfall 4's
     recommendation), confirm explicitly before Wave 1 task breakdown.

2. **Should the full guest-list (all members, all roles) be visible to every member, or only to owner/co-owner (who manage it) plus each member's own row?**
   - What we know: ③ specifies a viewer sees "Shared · Maya's project · You're a viewer" —
     this only requires knowing the PROJECT owner's name (already resolvable via
     `vault_projects.user_id`) and the viewer's OWN role, not the full member list.
   - What's unclear: whether an editor/viewer should also see WHO ELSE is on the project
     (useful context, e.g. "who are my co-writers here"), or whether that's out of scope
     for v1.
   - Recommendation: default to least-privilege (owner/co-owner see the full list; editor/
     viewer see only their own row) per Pattern 1's `project_members_select` policy above —
     easy to widen later, hard to narrow after UI depends on it.

3. **Real-time vs refresh-on-load for the sheet↔project sync indicator** (explicitly
   Claude's Discretion per CONTEXT.md).
   - What we know: this codebase has an established Realtime precedent
     (`NotificationBell`'s `supabase.channel(...)`, migration 057's `green_room_feed`
     Realtime publication) but also plenty of refresh-on-load-only surfaces (the entire
     Contract Locker, the split-sheet detail page).
   - What's unclear: whether the "live-sync indicator" needs sub-second responsiveness or
     is fine as a page-load/manual-refresh signal.
   - Recommendation: default to refresh-on-load for v1 (matches the Contract Locker/split-
     sheet detail page's existing pattern, avoids adding a new Realtime channel + cleanup
     surface for a feature whose CONTEXT.md doesn't demand live responsiveness); revisit if
     UAT surfaces staleness complaints.

## Environment Availability

Not applicable — no new external service/tool dependencies. All work is against the
existing self-hosted Supabase/Postgres instance and the existing Next.js/npm toolchain,
already verified present (`supabase` CLI ^1.200.0, `next` ^15.0.0 in `package.json`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ^30.4.2 (ts-jest ^29.4.11, transpile-only per `tsconfig.json`'s `isolatedModules`) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest lib/vault/membership.test.ts lib/dashboard/next-moves.test.ts` (new files, once created) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ② RLS foundation | Owner sees own project; viewer sees shared project; non-member blocked; viewer cannot mutate | integration (live DB, human-gated) | Manual smoke test via `supabase` SQL console / `psql`, per migration 064's own convention (`__tests__/migration-064.test.ts` is a STRING-ASSERTION test on the migration file, not a live-DB integration test — this repo has NO automated live-RLS test harness) | ❌ Wave 0 — needs a `__tests__/migration-078.test.ts` string-assertion test (mirrors 064's pattern) PLUS a documented manual smoke-test checklist (owner/viewer/non-member matrix) for the human-gated push, since no live-DB test harness exists in this repo |
| ② Auto-membership | Claiming a collaborator account whose `collaborator_id` is on a non-draft linked sheet's party creates a `viewer` `project_members` row | unit (pure trigger-input resolution logic, if extracted to TS) or `__tests__/migration-XXX.test.ts` string assertion (if pure SQL trigger) | `npx jest lib/vault/membership.test.ts` (if any resolution logic is extracted to TS) or a migration string-assertion test | ❌ Wave 0 |
| ③ Shared lane / scoreboard exclusion | Dashboard stats (`total`, `avgScore`→removed, `readyCount`) computed ONLY from `.eq('user_id', user.id)`-scoped rows, unaffected by shared-project RLS widening | unit | `npx jest app/\(artist\)/dashboard` — likely needs a new test file since `dashboard/page.tsx` currently has no test coverage (verified: no `dashboard.test.ts*` found) | ❌ Wave 0 |
| ④ "Your next moves" derivation | Money/signature items always rank above softer items; correct action-type classification per sheet/document state | unit | `npx jest lib/dashboard/next-moves.test.ts` | ❌ Wave 0 — new module |
| Sheet↔project sync | Sync active while `status NOT IN ('esign_pending','executed')`; stops on freeze | unit | `npx jest lib/split-sheets/lifecycle.test.ts` (extend existing) | ✅ existing file, extend |

### Sampling Rate
- **Per task commit:** targeted `npx jest <touched-file>.test.ts`
- **Per wave merge:** `npm test` (full suite — this repo's convention per every prior
  phase's SUMMARY.md, e.g. "full suite 52/52 suites... green")
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS the RLS access-matrix
  manual smoke test (owner sees own / viewer sees shared / non-member blocked / viewer
  cannot mutate) — this repo has no automated live-RLS harness, so this step is
  necessarily a human-gated checkpoint mirroring migrations 058/062/064's own convention.

### Wave 0 Gaps
- [ ] `__tests__/migration-078.test.ts` — string-assertion test for the new migration,
      mirroring `__tests__/migration-064.test.ts`'s pattern (this repo's established way
      of giving a not-yet-pushed migration file automated regression coverage)
- [ ] `lib/vault/membership.test.ts` — role-helper pure-function tests (`canEditProject`,
      `canManageGuests`, etc.)
- [ ] `lib/dashboard/next-moves.test.ts` — action-feed derivation + ranking tests
- [ ] A documented manual RLS smoke-test checklist (owner/co-owner/editor/viewer/non-member
      × SELECT/UPDATE/DELETE on `vault_projects` and all 4 child tables) for the human-gated
      migration push — no framework exists in this repo to automate live-RLS assertions
      against a real Postgres instance; every prior human-gated migration (058, 062, 064,
      066, 067, 076) has relied on exactly this kind of manual checklist at push time

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged — Supabase Auth, no auth-flow changes in this phase) | — |
| V3 Session Management | no (unchanged) | — |
| V4 Access Control | **yes — the entire phase** | Postgres RLS as the primary enforcement layer, `SECURITY DEFINER` helpers scoped by `SET search_path = ''` + `REVOKE ... FROM PUBLIC, anon, authenticated` then `GRANT ... TO authenticated` only (this repo's established convention — see migrations 034/035/064/066) |
| V5 Input Validation | yes, for the new guest-list API routes | Explicit field allowlist sanitizers matching this repo's convention (`app/api/profile/route.ts`'s `EDITABLE_FIELDS`, `lib/collaborators/index.ts`'s `COLLABORATOR_EDITABLE_FIELDS`) — never a raw `req.body` spread into an `.insert()`/`.update()` |
| V6 Cryptography | no (unchanged) | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS policy recursion (`42P17`) taking down an unrelated write path (e.g. a `tracks` INSERT failing because its trigger transitively reads a mutually-recursive `split_sheets`/`split_sheet_parties` pair) | Denial of Service | `SECURITY DEFINER` helper-function pair per Pattern 1 — proven fix for this exact codebase's prior occurrence (migration 064) |
| Elevation of Privilege via a client-supplied role on guest-list write (e.g. a viewer promoting themselves to owner via a raw PATCH) | Elevation of Privilege | Route all `project_members` writes through service-role API handlers that check the CALLER's own resolved role server-side before writing — never trust a client-supplied role value, mirroring `capability_grants`' `REVOKE INSERT, UPDATE, DELETE ... FROM authenticated, anon` doctrine (migration 042) |
| Information disclosure via `project_members` SELECT (e.g. a viewer enumerating every other member's identity/role on a project they were only meant to see their own share of) | Information Disclosure | Scope the `project_members_select` policy to owner/co-owner (full list) + "your own row" only (Open Question 2's recommended default) |
| Confused-deputy write via the readiness-recompute trigger (an editor's otherwise-legitimate `tracks` INSERT failing, or succeeding via unintended elevated rights, depending on how `update_vault_readiness()`'s SECURITY context is set) | Elevation of Privilege / Denial of Service | Make `update_vault_readiness()` `SECURITY DEFINER SET search_path = ''` (Pitfall 3) so its `UPDATE vault_projects` never depends on — nor is blocked by — the calling role's own RLS grant |
| Row-ownership conflation letting a non-owner's write become invisible to the actual owner (a correctness bug with a security-adjacent flavor: the owner effectively loses visibility into changes made to their own project) | Tampering (of visibility, not data) | Pattern 2 — resolve child-table access through `project_id` + the project-level helpers, never the row's own `user_id` |

## Sources

### Primary (HIGH confidence — direct repo reads, this session)
- `supabase/migrations/001_initial_schema.sql` — original `vault_projects`/tracks/assets/
  documents/tool_outputs schema + RLS + `update_vault_readiness()` trigger definition
- `supabase/migrations/018_collaborators_split_sheets.sql` — the original recursive policy
  pair (the bug migration 064 fixes)
- `supabase/migrations/064_fix_split_sheet_rls_recursion.sql` — full text; the canonical
  fix pattern this research recommends reusing
- `supabase/migrations/035_connections_blocks.sql` — `no_block()` SECURITY DEFINER
  precedent + partial-unique-index pattern
- `supabase/migrations/042_capability_grants.sql` + `lib/capabilities/grant.ts`/`check.ts`
  — request/approve write-elevation shape to mirror for guest-list writes
- `supabase/migrations/062_split_sheet_esign_envelopes.sql`,
  `066_split_sheet_identity_foundation.sql`, `067_split_sheet_song_attachment.sql`,
  `076_rename_artist_profiles_to_user_profiles.sql` — lifecycle, identity-foundation, and
  rename-migration precedents
- `lib/split-sheets/lifecycle.ts`, `lib/split-sheets/reconciliation.ts`,
  `lib/split-sheets/list.ts`, `lib/split-sheets/live-identity.ts`,
  `lib/contracts/locker-attention.ts` — the existing sync/freeze/derivation machinery to
  build on
- `app/api/split-sheets/route.ts`, `app/api/split-sheets/[id]/route.ts`,
  `app/api/split-sheets/[id]/reconcile/route.ts`, `app/api/approve/[token]/route.ts` — full
  reads confirming `split_sheet_parties.user_id` is never written (Pitfall 2)
- `app/(artist)/dashboard/page.tsx`, `app/(artist)/vault/page.tsx`,
  `components/vault/VaultProjectCard.tsx`, `lib/vault/readiness.ts` — current dashboard/
  vault touchpoints
- `.planning/ROADMAP.md`, `.planning/STATE.md`, `git log`, `git status` — Phase 20's
  in-flight state (076 authored/tested, NOT yet pushed; 077 authored, removed from repo,
  reserved for the 20-04 checkpoint)

### Secondary / Tertiary
None used — `.planning/config.json` has all external-research providers (`brave_search`,
`exa_search`, `tavily_search`, `firecrawl`, `perplexity`, `jina`, `ref_search`) disabled for
this project, and this phase's substance is entirely internal-architecture research where
this codebase's own prior-phase precedent is the authoritative source (stronger than any
external doc would be for these specific questions).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every primitive verified already in use
- Architecture (RLS recursion fix, child-table pitfall, trigger SECURITY context): HIGH —
  every claim verified by direct file read against this exact codebase, not inferred
- Auto-membership signal (`split_sheet_parties.user_id` dead / `collaborators.claimed_by`
  live): HIGH — verified by exhaustive grep across `app/api`, `lib`, and every migration
- Pitfalls: HIGH — each pitfall traces to a specific file/line read this session, not a
  general RLS-domain assumption
- Scope ambiguity (Pitfall 4, editor write-enablement extent): MEDIUM — this is a genuine
  ambiguity in the SPEC/CONTEXT source documents themselves, not a research gap; flagged
  for explicit resolution rather than resolved unilaterally

**Research date:** 2026-08-01
**Valid until:** ~30 days, OR immediately upon Phase 20's 20-03/20-04 migrations landing
live (whichever is sooner) — re-verify the migration-numbering guidance (Pitfall 6) once
Phase 20 actually completes, since the "next free number" and "must sequence after Phase 20"
guidance is a snapshot of Phase 20's specific in-flight state at research time.
