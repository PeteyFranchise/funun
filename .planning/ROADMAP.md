# Roadmap: Funūn Wave 2 — Rights & Registration Rails

## Overview

Wave 2 builds the legal and registration layer of Funūn's Sound Vault. Phase 1 creates a global collaborator roster so artist data flows into every document automatically. Phase 2 closes the document lifecycle loop — signed status, signer tracking, and readiness gating based on actual signatures rather than mere uploads. Phase 3 surfaces guided registration checklists for copyright, PRO, SoundExchange, and Songtrust so an artist can close a release knowing every rights obligation is tracked in one place.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Collaborator Profiles** - Global collaborator roster with auto-fill into split sheets and contracts (completed 2026-06-27)
- [x] **Phase 2: Document Lifecycle** - Signed-PDF upload flow, signer status tracking, and readiness gate fix (completed 2026-06-28)
- [x] **Phase 3: Rights Guidance** - Guided registration checklists (copyright, PRO, MLC, SoundExchange, Songtrust) with per-project status (completed 2026-06-29)
- [x] **Phase 4: Collaborator Identity Reconciliation** - Email-based claim system linking pre-signup collaborator records to new Funūn accounts (completed 2026-06-29)

## Phase Details

### Phase 1: Collaborator Profiles

**Goal**: Artists can maintain a global roster of collaborators and auto-fill their data into split sheets and contracts without re-entry
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: COLLAB-01, COLLAB-02, COLLAB-03, COLLAB-04
**Success Criteria** (what must be TRUE):

  1. Artist can create a collaborator record with name, email, phone, PRO affiliation, IPI/CAE number, publisher, MLC/SoundExchange IDs, and mailing address
  2. Artist can edit and delete collaborators from a dedicated global collaborators page
  3. When creating a split sheet or contract, artist can pick from their saved collaborators and all contact + rights fields auto-populate
  4. The same collaborator roster is available across all vault projects with no per-project re-entry

**Plans**: 4/4 plans complete

- [x] 01-03-PLAN.md

**Wave 1**

- [x] 01-01-PLAN.md — Collaborator roster walking skeleton: migration 018 + CRUD API + /collaborators page + components + nav + middleware (COLLAB-01, COLLAB-02, COLLAB-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — MetadataStudio composer-row auto-fill from roster + missing-IPI chip + readiness warning + save-to-profile nudge (COLLAB-03)
- [~] 01-03-PLAN.md — Standalone SplitSheetBuilder with per-party collaborator auto-fill, even-split validation, industry entry point (COLLAB-03) — Tasks 1-3 done; awaiting Task 4 verification

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Token split-approval loop (approve/counter) + collaborator invite + public approve/join pages (COLLAB-03, COLLAB-04)

**UI hint**: yes

### Phase 2: Document Lifecycle

**Goal**: Documents progress through a proper signed lifecycle — artists upload pre-signed PDFs, signer status is visible per document, and the vault readiness score only turns green when documents are actually signed
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):

  1. Artist can upload a signed PDF to any document slot and the document status immediately changes to "signed" with a visible timestamp
  2. Split sheet and contract document cards display each signer's name, email, and pending/signed status
  3. Project vault readiness score reflects "signed" status — a split sheet or contract in "uploaded but not signed" state does not count as complete

**Plans**: 3 plans

**Wave 1**

- [ ] 02-01-PLAN.md — Migration 023 (file_url + signed_by columns) + lib/vault/documents.ts + upload API route (DOC-01, DOC-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — DocumentCard upload button + signed state display + signer list UI + stage3 type threading (DOC-01, DOC-02)

**Wave 3** *(blocked on Wave 2 checkpoint)*

- [ ] 02-03-PLAN.md — SplitContributor email field + ToolSidePanel email input + stage3 contributors-based signer fallback (DOC-02)

**UI hint**: yes

### Phase 3: Rights Guidance

**Goal**: Artists see structured, per-project registration checklists for copyright, PRO, SoundExchange, and Songtrust — with direct deep-links, status tracking, and CWR export as the Songtrust handoff action
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: RIGHTS-01, RIGHTS-02, RIGHTS-03, RIGHTS-04, SONGTRUST-01
**Success Criteria** (what must be TRUE):

  1. Artist sees a step-by-step copyright registration guide with a direct link to copyright.gov eCO and a per-project status indicator (not filed / filed / registered)
  2. Artist sees a PRO registration guide with ASCAP / BMI / SESAC / SOCAN options, deep-links for each, and an ISWC proxy status field per project
  3. Artist sees a SoundExchange registration guide with a deep-link; the status automatically shows "ready" when the project has RDR-N data (ISRC + performer credits present)
  4. All three checklists appear on the per-project Rights / Registrations page with visual completion indicators so an artist can see outstanding registration tasks at a glance
  5. A Songtrust guide card explains publishing admin value and offers the existing CWR export as the "send your data" action

**Plans**: 2/3 plans executed

**Wave 1**

- [x] 03-01-PLAN.md — Migration 024 (3 rights status columns on vault_projects) + VaultProject type extension + PATCH /api/vault/[projectId]/rights route (RIGHTS-01, RIGHTS-02, RIGHTS-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Rights page server component + RightsStatusPatch client component + SongtrastGuideCard + CopyrightFiling 3-state extension + project page nav link (RIGHTS-01, RIGHTS-02, RIGHTS-03, RIGHTS-04, SONGTRUST-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 03-03-PLAN.md — Checkpoint: verify SOCAN + Songtrust deep-link URLs + smoke test rights page end-to-end (RIGHTS-02, SONGTRUST-01)

**UI hint**: yes

### Phase 4: Collaborator Identity Reconciliation

**Goal**: When a non-Funūn collaborator who was added to a split sheet later creates a Funūn account, their existing contributions are automatically linked to their new profile — no data re-entry, no orphaned records
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: COLLAB-05
**Success Criteria** (what must be TRUE):

  1. `collaborators` table has a nullable `claimed_by` column (`uuid` → `auth.users.id`) with an index on `email`
  2. On signup and on first post-signup login, a server-side claim job runs: any `collaborators` rows whose `email` matches the new user's auth email get `claimed_by` set to their user ID
  3. A newly joined user sees a "Collaborations" section in their dashboard listing all projects they were credited on before joining, pulled via `claimed_by`
  4. The inviting artist's collaborator card visually upgrades from "pending / external" to "Funūn member" once `claimed_by` is set
  5. Rights and contact data from the new user's Settings (PRO, IPI, publisher, phone, address) automatically back-fills any gaps in their claimed collaborator records so split sheets reflect complete data without the inviting artist doing anything

**Design notes**:

- Claim job must be idempotent — safe to run on every login, only writes when `claimed_by IS NULL`
- If multiple artists have the same email in their collaborator roster, all matching rows get claimed — one user can appear in many rosters
- Email matching is case-insensitive (`LOWER(email) = LOWER(auth.email)`)
- Claimed collaborator records should never be deleted by the inviting artist while `claimed_by IS NOT NULL` — soft-delete or archive only
- Settings back-fill is additive only: never overwrite data the inviting artist manually entered, only fill `NULL` fields

**Plans**: 4/4 plans complete

**Wave 1**

- [x] 04-01-PLAN.md — Migration 026 (full phase schema: user_profiles table, collaborators claim/archive/favorite columns, artist_profiles.claimed_at, LOWER(email) index, RLS, claim + back-fill SECURITY DEFINER functions) + claim API route + middleware claim hook + CollaboratorProfile type extension + My Credits section on /collaborators (COLLAB-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — user_profiles GET+PATCH API with allowlist + fire-and-forget back-fill + Rights Identity section on Settings page wired to /api/user-profiles (COLLAB-05)
- [x] 04-03-PLAN.md — Claim-aware DELETE guard + claimed-state CollaboratorCard (Funūn-member badge, Archive, favorite star) + Favorites/Most Recent picker grouping + dashboard My Credits preview (COLLAB-05)

**Gap closure** *(addresses 04-VERIFICATION.md blockers + code-review concerns)*

- [x] 04-04-PLAN.md — Wire CollaboratorRoster Archive/Delete/Favorite callbacks (WR-03/04) + migration 027 exception-isolating handle_new_user() and explicit user_profiles RLS (CR-04, CR-02) + atomic claim-guarded DELETE (CR-01) + server-forced archived_at (CR-03) (COLLAB-05)

**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Collaborator Profiles | 4/4 | Complete   | 2026-06-27 |
| 2. Document Lifecycle | 3/3 | Complete | 2026-06-28 |
| 3. Rights Guidance | 3/3 | Complete | 2026-06-29 |
| 4. Collaborator Identity Reconciliation | 4/4 | Complete   | 2026-06-29 |

---

# Roadmap: Funūn Wave 3 — Launchpad

## Overview

Wave 3 builds the **Launchpad room** — the post-release environment where an artist turns a released song into traction. Phase 5 establishes the per-project Launchpad checklist: the guided post-release playbook and the shared `/launchpad/[projectId]` route container that Phases 6 and 7 live inside. Phase 6 adds playlist curator pitching: a filterable curator directory, personalized pitch emails over a dedicated sending domain, pitch history, curator claim, and bounce/drift handling. Phase 7 adds the social campaign planner: an AI-generated 4–6 week content calendar tailored to the release and the artist's platforms, with DropReady/SoundBait actions and a Buffer-compatible CSV export.

## Phases

**Phase Numbering:**

- Integer phases (5, 6, 7): Planned milestone work (continuing from Wave 2, which ended at Phase 4)
- Decimal phases (6.1, 6.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 5: Launchpad Checklist** - Per-project Launchpad room with a guided, week-sequenced post-release checklist; DB-backed admin-approved tips; completion persistence (foundation route for Phases 6 & 7) (completed 2026-07-01)
- [ ] **Phase 6: Playlist Curator Pitching** - Filterable curator directory, personalized pitch emails via dedicated sending domain, pitch history, curator claim flow, and bounce/drift handling
- [ ] **Phase 7: Social Campaign Planner** - AI-generated 4–6 week content calendar from release data with platform nudges, DropReady/SoundBait actions, completion tracking, and Buffer CSV export

## Phase Details

### Phase 5: Launchpad Checklist

**Goal**: Artists open a per-project Launchpad room that tells them exactly what to do after release day — each item is actionable (in-Funūn tool or external action), sequenced by post-release week to match the Spotify algorithmic window, backed by contextual tips, and their progress is saved
**Depends on**: Nothing (first Wave 3 phase; establishes shared `/launchpad/[projectId]` route)
**Requirements**: LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-05
**Success Criteria** (what must be TRUE):

  1. Artist opens a Launchpad room for a specific project and sees a guided post-release checklist of distinct items
  2. Each checklist item either launches an in-Funūn tool or opens an external action with step-by-step instructions, and items are grouped/ordered by `suggested_week` (weeks 1–4) to align with the post-release algorithmic window
  3. Each item surfaces a contextual tip drawn from the database; tips are AI-drafted on a monthly cadence and only appear to artists after admin approval (unapproved drafts never show)
  4. Artist can check an item complete and the completion state persists per project across sessions and page reloads
  5. Admin can add, edit, reorder, and delete checklist items from `/admin/checklist` without touching Supabase Studio directly

**New tables**: `launchpad_checklist_items` (admin-managed tip definitions, includes `suggested_week`), `launchpad_progress` (per-user per-project completion). RLS enabled immediately after each CREATE TABLE.
**Plans**: 6/6 plans complete

**Wave 1** *(foundation)*

- [x] 05-01-PLAN.md — Migration 028 (launchpad_checklist_items + launchpad_progress tables, RLS, cascade FK, 20 seed items) + TypeScript types (LAUNCH-01 through LAUNCH-05)
- [x] 05-02-PLAN.md — Middleware /launchpad + /admin guard + @dnd-kit install + (admin) route group with is_admin layout gate + per-project page scaffold (LAUNCH-01, LAUNCH-05)

**Wave 2** *(blocked on Wave 1 DB)*

- [x] 05-03-PLAN.md — Artist API: GET checklist (items + progress merged, tips gated) + PATCH progress (upsert completion) (LAUNCH-02, LAUNCH-03, LAUNCH-04)
- [x] 05-05-PLAN.md — Admin API: checklist CRUD + atomic reorder + hard delete + tip approve/reject, all behind is_admin gate (LAUNCH-03, LAUNCH-05)

**Wave 3** *(blocked on Wave 2)*

- [x] 05-04-PLAN.md — Artist UI: TipPanel + ChecklistItem + ChecklistSection + LaunchpadRoom + wired per-project page + global page project cards (LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04)
- [x] 05-06-PLAN.md — Admin UI: ChecklistAdmin (dnd-kit reorder + inline CRUD) + TipsAdmin (approve/reject) + wired admin pages (LAUNCH-03, LAUNCH-05)

**UI hint**: yes

### Phase 6: Playlist Curator Pitching

**Goal**: Artists pitch a selected track to relevant playlist curators by email and track the outcomes, while curators can claim their own profiles, bounced addresses are retired automatically, and an admin can curate the directory
**Depends on**: Phase 5 (lives under the shared `/launchpad/[projectId]` route)
**Requirements**: PITCH-01, PITCH-02, PITCH-03, PITCH-04, PITCH-05, PITCH-06, PITCH-07, PITCH-08
**Success Criteria** (what must be TRUE):

  1. Artist can browse a curator directory and filter it by genre and platform, with each curator showing genre focus and a response rate (last 90 days)
  2. Artist selects a track and sends a pitch email to one or more curators via Resend from the dedicated `pitch.funun.studio` sending domain; the composer enforces a 150-word limit and requires a playlist-specific note before Send activates, and every email includes the `/r/[projectId]` player link and an unsubscribe path
  3. Pitch history is tracked per project (curator, sent date, response status: pending / opened / accepted / declined) and prevents duplicate sends to the same curator for the same track
  4. A curator can claim their directory profile via a one-time, time-limited token link in the pitch email footer (explicit click only, not auto-claimed on signup); a hard bounce marks the curator email invalid and a significant genre-focus shift raises a genre drift alert
  5. An admin can add, edit, flag inactive, and review claimed curator profiles from an admin view, and "Playlist Curator" appears as an industry occupation option in Settings

**New tables**: `curators` (directory + `email_valid`), `pitch_history` (per-project pitch log). RLS enabled immediately after each CREATE TABLE.
**Infrastructure prerequisite**: `pitch.funun.studio` subdomain with DKIM/SPF/DMARC and ~2-week warmup must be live before any pitch email sends (keeps cold outreach off the transactional `funun.studio` domain).
**Plans**: 1/6 plans executed

**Wave 1** *(foundation)*

- [x] 06-01-PLAN.md — Migration 030 (curators + pitch_history tables, RLS, uniq_curator_track_pitch, handle_new_user curator branch) + Curator/PitchHistory types + Playlist Curator role + svix install (PITCH-01 through PITCH-08 foundation)

**Wave 2** *(blocked on Wave 1 DB)*

- [ ] 06-02-PLAN.md — Admin curator CRUD (/admin/curators) + reach fetchers + drift utility + weekly Vercel cron + curator schema/allowlists (PITCH-04, PITCH-06, PITCH-07)

**Wave 3** *(blocked on Wave 1)*

- [ ] 06-03-PLAN.md — Artist-facing /curators directory (genre + platform filter) + response-rate helper + CuratorCard/CuratorDirectory (PITCH-01, PITCH-04)
- [ ] 06-04-PLAN.md — Pitch composer in launchpad + AI 150-word draft + send route (3-gate server re-validation + duplicate 409) + pitch history + tokens + email from-override (PITCH-02, PITCH-03)

**Wave 4** *(blocked on Wave 3)*

- [ ] 06-05-PLAN.md — Curator claim flow (72h token → curator-role magic-link account) + curator self-serve portal (allowlist PATCH, own layout gate) (PITCH-05)
- [ ] 06-06-PLAN.md — Resend bounce webhook (svix-verified, email_valid=false) + token accept/decline/unsubscribe routes + public pages + artist notifications (PITCH-06)

**UI hint**: yes

### Phase 7: Social Campaign Planner

**Goal**: Artists generate and work a 4–6 week social content calendar tailored to their release and the platforms they are active on, take inline content-generation actions, track which posts went live, and export the plan to their scheduler
**Depends on**: Phase 5 (lives under the shared `/launchpad/[projectId]` route); no hard dependency on Phase 6
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04, SOCIAL-05, SOCIAL-06, SOCIAL-07
**Success Criteria** (what must be TRUE):

  1. Artist selects which platforms they are active on per project (Instagram, TikTok, X, YouTube Shorts, Facebook, Threads) and sees best-practice nudges toward the highest-impact platform combinations for their genre, driven by a static genre→platform lookup table (no ML)
  2. Artist generates a 4–6 week content calendar with one action; the AI receives the release metadata (title, genre, release date, story) and collaborators-table data, and returns a calendar structured by week and platform
  3. Each calendar slot shows a draft caption or hook, a content-type tag (short-form video / static image / lyric graphic / text / stories), and its suggested week
  4. DropReady and SoundBait are usable both as inline calendar-slot actions ("Generate caption", "Generate hook") and as standalone quick tools in the Launchpad tools view, with standalone runs not mutating calendar slots unless explicitly saved
  5. Artist can check off calendar posts as they go live (completion tracked per project) and export the calendar as a Buffer-compatible CSV (columns: `Text`, `Image URL`, `Tags`, `Posting Time`)

**New tables**: `social_campaigns` (calendar metadata + posts JSONB). RLS enabled immediately after CREATE TABLE.
**Notes**: AI calendar is a batch (non-streaming) Claude call using the existing JSON-prompt pattern; user-supplied release data isolated in a `<release_data>` block; platform constraints hard-coded in the system prompt. CSV is Buffer-only — Later has no CSV import.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Launchpad Checklist | 6/6 | Complete    | 2026-07-01 |
| 6. Playlist Curator Pitching | 1/6 | In Progress|  |
| 7. Social Campaign Planner | 0/0 | Not started | - |
