# Roadmap: Funūn Wave 2 — Rights & Registration Rails

## Overview

Wave 2 builds the legal and registration layer of Funūn's Sound Vault. Phase 1 creates a global collaborator roster so artist data flows into every document automatically. Phase 2 closes the document lifecycle loop — signed status, signer tracking, and readiness gating based on actual signatures rather than mere uploads. Phase 3 surfaces guided registration checklists for copyright, PRO, SoundExchange, and Songtrust so an artist can close a release knowing every rights obligation is tracked in one place.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Collaborator Profiles** - Global collaborator roster with auto-fill into split sheets and contracts
- [ ] **Phase 2: Document Lifecycle** - Signed-PDF upload flow, signer status tracking, and readiness gate fix
- [ ] **Phase 3: Rights Guidance** - Guided registration checklists (copyright, PRO, SoundExchange, Songtrust) with per-project status

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

**Plans**: 3/4 plans executed

- [x] 01-03-PLAN.md

**Wave 1**

- [x] 01-01-PLAN.md — Collaborator roster walking skeleton: migration 018 + CRUD API + /collaborators page + components + nav + middleware (COLLAB-01, COLLAB-02, COLLAB-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — MetadataStudio composer-row auto-fill from roster + missing-IPI chip + readiness warning + save-to-profile nudge (COLLAB-03)
- [~] 01-03-PLAN.md — Standalone SplitSheetBuilder with per-party collaborator auto-fill, even-split validation, industry entry point (COLLAB-03) — Tasks 1-3 done; awaiting Task 4 verification

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-04-PLAN.md — Token split-approval loop (approve/counter) + collaborator invite + public approve/join pages (COLLAB-03, COLLAB-04)

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

**Plans**: TBD
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

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Collaborator Profiles | 3/4 | In Progress|  |
| 2. Document Lifecycle | 0/TBD | Not started | - |
| 3. Rights Guidance | 0/TBD | Not started | - |
