# Phase 21: Cross-Account Collaboration & Split-Sheet ↔ Project Sync - Context

**Gathered:** 2026-08-01
**Status:** Ready for planning
**Source:** `/gsd-explore` session (owner decisions captured live) → 21-SPEC.md

<domain>
## Phase Boundary

Make a song a single source of truth shared by the people on it. A split sheet and its
Sound Vault project stay linked (writers/roles/splits) while the sheet is a draft, and
every collaborator **with a Funūn account** can see the shared project and the tasks
waiting on them — from their own account — with no data re-entry.

This is the **first concrete slice of the post-beta access model** (owner confirmed:
build now, not deferred).

**In scope:** `project_members` membership table + RLS rewrite on `vault_projects`;
auto-membership from linked-sheet writers; "Shared with me" vault lane; dashboard rework
(remove Avg readiness, add "Closest to ready", add "Your next moves" action feed);
split-sheet ↔ project bidirectional sync while draft; roster-dedupe + claim identity wiring.

**Out of scope (deferred / fast-follow):** per-user configurability UI for the action
feed; action-feed types beyond the launch set; rich co-owner/editor promotion UX.
</domain>

<decisions>
## Implementation Decisions

### Access model (①)
- Shared **visibility**, owner-controlled **editing**. Collaborators see the project and
  their own piece; only owner (or a named co-owner) mutates the project.
- Splits are the exception — always negotiated through the sheet's existing
  approve/counter flow. No new money-mutation path; no silent cross-account split edits.

### Membership foundation (②) — load-bearing, security-critical
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

### Mine vs shared (③)
- Separate **"Shared with me"** lane in the vault — not mixed into the owned grid.
- Shared cards badged (e.g. "Shared · Maya's project" + role, "You're a viewer"); no edit
  affordances a viewer cannot use.
- Shared projects stay **OUT** of personal scoreboard math (dashboard counts/averages
  describe the viewer's OWN catalog only).

### Dashboard rework (④)
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

### Identity: dedupe vs claim (keep distinct)
- **Roster dedupe** — per-owner, keyed on TYPED email; reuses an existing collaborator
  instead of duplicating; auto-fills their PRO/IPI. Trusts the typed email.
- **Claim** — cross-owner, keyed on VERIFIED email at signup; reunites the same real
  person's credits across owners; surfaces credits + shared projects.
- **Cross-account membership grant keys off VERIFIED identity only, never a typed email.**
- When multiple collaborator rows resolve to one new signup: keep each owner's private
  roster notes, but rights data (PRO/IPI/legal name) federates from the verified profile.

### Sync behavior
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
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decision record
- `.planning/phases/21-cross-account-collaboration-sheet-sync/21-SPEC.md` — full decision
  record incl. the ①–④ log, identity rules, build slate, recommended 3-wave sequencing.

### Existing attach / sync surface (build ON these, do not replace)
- Migration 067 (`split_sheets.vault_project_id` / `track_id` + `split_sheet_attachments`
  join table) — the dual-entry attach flow membership reads from.
- Migration 062 — split-sheet lifecycle (draft → … → executed) + the send-for-signature
  freeze that snaps the sync link.
- Migration 018 — `collaborator_invites` (invite lifecycle).

### Access-model context
- Phase 15 (account-capability-model) + `capability_grants` — existing per-user grant model.
- Phase 20 — `user_profiles` rename; RLS surface now stable (plan around any in-flight 077
  drop-view soak).

### Code touchpoints
- `app/(artist)/dashboard/page.tsx` — the stat strip + feed rework.
- `components/vault/VaultProjectCard.tsx` — shared-card badge variant.
- `app/(artist)/vault/page.tsx` — the "Shared with me" lane.
- `lib/vault/readiness.ts` — "Closest to ready" derivation.
- `lib/collaborators/*` — roster dedupe / claim wiring.
</canonical_refs>

<specifics>
## Specific Ideas

- Recommended sequencing: **Wave 1 = `project_members` + RLS foundation, soaks first**
  (security-critical, human-gated migration like Phase 20); **Wave 2 = auto-membership +
  shared lane + sheet↔project sync**; **Wave 3 = dashboard action feed + identity wiring**.
- Migrations in this repo are **human-gated** — plans author SQL but do NOT run
  `supabase db push`; the owner pushes via Codex after review.
- Preview design reference: `sheet-project-sync.html` mockup (dark/purple handoff style).
</specifics>

<deferred>
## Deferred Ideas

- Per-user configurability UI for the "Your next moves" feed (order, muted categories).
- Additional action-feed types beyond the launch set (invites to accept, audio-missing).
- Rich co-owner/editor promotion management UX (roles exist in data day one).
</deferred>

---

*Phase: 21-cross-account-collaboration-sheet-sync*
*Context gathered: 2026-08-01 via /gsd-explore decision capture*
