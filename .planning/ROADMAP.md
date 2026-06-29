# Roadmap: Funūn Wave 2 — Rights & Registration Rails

## Overview

Wave 2 builds the legal and registration layer of Funūn's Sound Vault. Phase 1 creates a global collaborator roster so artist data flows into every document automatically. Phase 2 closes the document lifecycle loop — signed status, signer tracking, and readiness gating based on actual signatures rather than mere uploads. Phase 3 surfaces guided registration checklists for copyright, PRO, SoundExchange, and Songtrust so an artist can close a release knowing every rights obligation is tracked in one place.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Collaborator Profiles** - Global collaborator roster with auto-fill into split sheets and contracts (completed 2026-06-27)
- [ ] **Phase 2: Document Lifecycle** - Signed-PDF upload flow, signer status tracking, and readiness gate fix
- [ ] **Phase 3: Rights Guidance** - Guided registration checklists (copyright, PRO, SoundExchange, Songtrust) with per-project status
- [ ] **Phase 4: Collaborator Identity Reconciliation** - Email-based claim system linking pre-signup collaborator records to new Funūn accounts

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

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Collaborator Profiles | 4/4 | Complete   | 2026-06-27 |
| 2. Document Lifecycle | 3/3 | Complete | 2026-06-28 |
| 3. Rights Guidance | 2/3 | In Progress|  |
| 4. Collaborator Identity Reconciliation | 0/TBD | Not started | - |
