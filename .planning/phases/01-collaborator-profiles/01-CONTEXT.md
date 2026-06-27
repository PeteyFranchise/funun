# Phase 1: Collaborator Profiles - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

A global collaborator roster per Funūn user (artists and non-artist professionals alike). Any user enters collaborators once and that data auto-fills into composer rows, split sheets, and contracts. Split sheets are a standalone entity — not tied to a vault project — so producers, session musicians, songwriters, and other industry professionals can initiate and share them independent of a release. A split sheet can live in the contract locker of multiple parties simultaneously (shared document model). Includes a collaborator invite flow, a view-only post-signup collaborator profile page, and an in-app split approval flow.

</domain>

<decisions>
## Implementation Decisions

### Composer ↔ Collaborator Bridge (MetadataStudio)
- **D-01:** Each composer row in MetadataStudio gets a "pick from roster" button. The existing per-track Composer form stays unchanged — no replacement of the freeform entry, just an augmentation.
- **D-02:** Picking a collaborator auto-fills: name, PRO, IPI, email, phone. Role (composer/lyricist/etc.) is always set per song — no default stored on the collaborator profile. Split is always set per song — never auto-filled.
- **D-03:** If a collaborator's PRO or IPI is missing, the pick still proceeds but the composer row is flagged ("IPI missing — complete before export"). Missing-IPI triggers an email to both the collaborator and the artist on track save (not on export).
- **D-04:** The collaborator email explains: what IPI is, why it matters for royalty collection, how to register with their PRO, and what to tell the artist when done. The artist email explains: what to do in Funūn once the collaborator has their IPI (update the collaborator profile, re-save the track).
- **D-05:** Missing-IPI warnings surface in two places: (1) the collaborator's card on the /collaborators roster page, and (2) the vault project readiness checklist.
- **D-06:** The picker includes an inline "Add new collaborator" option — artist can create a new collaborator without leaving MetadataStudio. The new record saves to the global roster and auto-fills the row.
- **D-07:** Rights-identity fields edited at the song level (IPI, PRO, publisher, email, phone) show an optional "Save to [Name]'s collaborator profile?" nudge. Split is always song-specific and never offered for global sync.

### Collaborator Invite Flow
- **D-08:** Missing-IPI email to the collaborator includes a proper Funūn invite link (not just a CTA/referral). The invite is a genuine invite flow, not just a signup redirect.
- **D-09:** After a collaborator signs up via invite, they land on a view-only profile page showing the data the artist recorded for them. Includes a "flag a correction" link (mailto-style to the artist). Full self-edit access is deferred to a future phase.

### Collaborator Roster Page (/collaborators)
- **D-10:** New top-level `/collaborators` route in the artist layout sidebar (alongside /vault, /dashboard, etc.). Collaborator data also surfaces at the project level via the picker.
- **D-11:** Layout: card grid — one card per collaborator with name, PRO, and IPI status badge. Cards with missing IPI display a warning badge.
- **D-12:** Editing a collaborator opens an edit modal overlay (consistent with EditProjectForm pattern). Save/cancel without leaving the roster page.

### Auto-fill UX in Split Sheets and Contracts
- **D-13:** Signer rows with a "Select collaborator" dropdown per row. Selecting auto-fills name, email, PRO, IPI for that row. Inline creation of new collaborators is also available here (same pattern as MetadataStudio picker).
- **D-14:** Split sheet pre-fills split % to an even split (100% / number of collaborators) as a starting point. Artist adjusts from there.
- **D-15:** In-app split approval flow in Phase 1. Once the artist sets splits, all collaborators receive an email with the proposed split breakdown and an approval link (token-based, no Funūn account required to respond).
- **D-16:** On the approval page, a collaborator can either "Approve" or enter their own counter-proposed split % and submit it. The artist is notified of approvals and counter-proposals and can iterate until all parties approve.

### Split % on Collaborator Profile
- **D-17:** No default split % stored on the collaborator profile. Split is always song-specific — set per split sheet, pre-filled to even split across collaborators.

### Split Sheet as a Shared, Standalone Document
- **D-18:** Split sheets are decoupled from vault projects. Any Funūn user — artist, producer, session musician, songwriter, industry professional — can initiate a split sheet. This means the split sheet data model must not require a `vault_project_id`; the project link is optional (present when an artist attaches it to a release, absent when a producer initiates it independently).
- **D-19:** A split sheet can live in the contract locker of multiple parties. When a split sheet is created and shared, every named party gets a copy visible in their own contract locker (or equivalent document view for non-artist accounts). All copies reflect the same underlying record — one source of truth, multiple viewers. Edits (counter-proposals, final approval) propagate to all parties.
- **D-20:** Non-artist Funūn users (producers, session musicians, songwriters, industry profiles) can access split sheet creation. The entry point for non-artists is their industry profile or a dedicated `/split-sheets` route accessible from their account — not the vault, which is artist-only. The planner should determine the exact route placement given the existing `app/(industry)/` route group.

### Claude's Discretion
- Exact UI treatment of the "Save to profile?" sync nudge (inline tooltip, small icon, dismissible banner — whichever fits cleanest in MetadataStudio's composer row layout)
- Token-based approval link implementation details (expiry, re-send mechanics)
- Exact email templates and copy for missing-IPI and split-approval notifications (beyond the content requirements described above)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Collaborator Data Model
- `lib/metadata/schema.ts` — Defines the existing `Composer` type (name, role, pro, ipi, email, phone, split) stored as JSONB in track metadata. The new `collaborators` table is separate and global; it feeds into this Composer shape. Also defines `PRO`, `PRO_LABELS`, `PRO_VALUES`, `ComposerRole` — reuse these for the collaborator profile.

### Existing UI Entry Points
- `components/vault/MetadataStudio.tsx` — Where composer rows are currently entered per track. The "pick from roster" button and inline collaborator picker are added here.
- `components/contracts/ContractLocker.tsx` — Contract upload and management UI. Signer rows with collaborator picker are added here.
- `components/vault/DocumentStage.tsx` — Document stage component. Review for signer row integration.
- `components/contracts/ContractUpload.tsx` — Upload flow. Review for any overlap with the new signed-PDF signer tracking.

### Requirements
- `REQUIREMENTS.md` — COLLAB-01 through COLLAB-04 define the full collaborator profile field set and global-roster requirement.
- `.planning/ROADMAP.md` — Phase 1 success criteria (4 items) are the acceptance gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PRO`, `PRO_LABELS`, `PRO_VALUES` (lib/metadata/schema.ts): Reuse directly for PRO affiliation field on the collaborator profile — no new enum needed.
- `ComposerRole`, `COMPOSER_ROLE_LABELS`, `COMPOSER_ROLE_VALUES` (lib/metadata/schema.ts): Reuse for the role picker in MetadataStudio composer rows (role stays per-song, not on the collaborator profile).
- Resend integration (already in stack): Use for missing-IPI notification emails, split approval emails, and collaborator invite emails.
- EditProjectForm modal pattern: The edit-collaborator modal should follow the same structure as `components/vault/EditProjectForm.tsx` — client component, modal overlay, form state in useState.

### Established Patterns
- Global tables keyed by `user_id` (not `artist_id`): The `collaborators` table must be keyed by `user_id` so non-artist users can also maintain a roster. RLS allows the owning user to read/write their own collaborators.
- JSONB metadata pattern: Collaborator data in MetadataStudio continues to live in track metadata JSONB (the `Composer` shape). The collaborator profile is the source for auto-fill, not a replacement for JSONB storage.
- API route pattern: `app/api/collaborators/route.ts` (POST = create, GET = list) and `app/api/collaborators/[id]/route.ts` (PATCH = update, DELETE = delete). Follow `app/api/profile/route.ts` for input sanitization with an explicit EDITABLE_FIELDS allowlist.
- `router.refresh()` after mutations: Standard pattern for revalidating server data after client-side writes.

### Integration Points
- Artist layout sidebar (`app/(artist)/layout.tsx`): Add `/collaborators` nav link alongside existing items.
- Vault project readiness checklist (`lib/vault/readiness.ts` + `types/index.ts` READINESS_ITEMS): Add a readiness item or sub-check for "collaborators with missing IPI" so the warning surfaces on the project readiness score.
- Supabase migrations: New `collaborators` table (keyed by `user_id`, not `artist_id`), `split_sheets` table (standalone — `vault_project_id` nullable), `split_sheet_parties` table (links a split sheet to each named party's account for shared contract locker visibility), and a `collaborator_invites` table (for tokenized approval/invite links).
- Industry route group (`app/(industry)/`): Non-artist split sheet initiation needs an entry point here. Researcher should assess what already exists in this route group and where `/split-sheets` fits best.

</code_context>

<specifics>
## Specific Ideas

- Missing-IPI email to collaborator should include educational content: what IPI is, why it matters for royalty collection, how to register with their PRO (ASCAP/BMI/SESAC/SOCAN), and a prompt to share the IPI back with the artist once registered.
- Collaborator invite flow has a user-growth motivation: signups via collaborator invites should be attributable (referral source tracking).
- Split approval is token-based (no Funūn account required for collaborators to approve or counter-propose). If a collaborator signs up via the invite flow, the approval token connects to their new account.
- The counter-proposal UI on the approval page: collaborator sees the proposed split % for each party and can edit their own % and submit a counter. The system should validate that total = 100% before submission.

</specifics>

<deferred>
## Deferred Ideas

- **Collaborator self-edit portal**: After signup, collaborators can update their own IPI, PRO, and contact info directly in Funūn. Deferred to a future phase — Phase 1 is view-only post-signup.
- **SMS signature confirmation**: Tied to Dropbox Sign (deferred to when paid account is active).

</deferred>

---

*Phase: 1-Collaborator Profiles*
*Context gathered: 2026-06-26*
