# Wave 2 Requirements — Rights & Registration Rails

**Milestone:** Funūn Wave 2
**Created:** 2026-06-26
**Status:** Active

---

## v1 Requirements

### Collaborator Profiles

- [x] **COLLAB-01**: Artist can create a collaborator profile with name, email, phone, PRO affiliation, IPI/CAE number, publisher, MLC/SoundExchange IDs, and mailing address
- [x] **COLLAB-02**: Artist can edit and delete collaborator profiles from a global collaborators list
- [x] **COLLAB-03**: When creating a split sheet or contract, artist can select collaborators from their saved list (auto-fills contact + rights data)
- [x] **COLLAB-04**: Collaborators are stored globally per artist (reusable across all vault projects)

### Document Lifecycle

- [ ] **DOC-01**: Artist can upload a signed PDF for any document type; document status updates to "signed" with a signed-at timestamp
- [ ] **DOC-02**: Split sheet and contract documents display a signer list (name, email, status: pending/signed); artist populates signers when creating the document
- [ ] **DOC-03**: Project vault readiness score gates correctly on split sheets and contracts being in "signed" status (not just uploaded)

### Rights Guidance

- [ ] **RIGHTS-01**: Artist sees a step-by-step copyright registration guide with deep-link to copyright.gov eCO; per-project status tracked (not filed / filed / registered)
- [ ] **RIGHTS-02**: Artist sees a step-by-step PRO registration guide (ASCAP / BMI / SESAC / SOCAN options) with deep-links; per-project ISWC proxy status tracked
- [ ] **RIGHTS-03**: Artist sees a SoundExchange registration guide with deep-link; status shows "ready" when project has RDR-N data (ISRC + performer credits)
- [ ] **RIGHTS-04**: All three checklists are surfaced on the per-project Rights/Registrations page with visual completion indicators

### Songtrust

- [ ] **SONGTRUST-01**: Rights Coach includes a Songtrust guide card explaining publishing admin value, with a CWR export action as the "send your data" step

---

## v2 Requirements (deferred)

- Dropbox Sign live e-sign implementation (blocked on paid account; `lib/esign/provider.ts` abstraction is ready)
- SMS signature confirmation via phone number (blocked on Dropbox Sign)
- Songtrust API integration (pending BD conversation — API registration model + carve-out structure)
- SoundExchange direct filing integration (guide-and-link now; automation requires partner agreement)
- PRO filing API integration (guide-and-link now; no open APIs for programmatic filing)
- Auto-transcode WAV→MP3 (Wave 1 deferred; lands in Wave 3 or standalone)

---

## Out of Scope

- Launchpad room (Wave 3)
- Real benchmarking data source / Songstats (Wave 4)
- Distribution integrations (Wave 4)
- Distributor API push (Wave 5)

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COLLAB-01 | Phase 1: Collaborator Profiles | Complete |
| COLLAB-02 | Phase 1: Collaborator Profiles | Complete |
| COLLAB-03 | Phase 1: Collaborator Profiles | Complete |
| COLLAB-04 | Phase 1: Collaborator Profiles | Complete |
| DOC-01 | Phase 2: Document Lifecycle | Pending |
| DOC-02 | Phase 2: Document Lifecycle | Pending |
| DOC-03 | Phase 2: Document Lifecycle | Pending |
| RIGHTS-01 | Phase 3: Rights Guidance | Pending |
| RIGHTS-02 | Phase 3: Rights Guidance | Pending |
| RIGHTS-03 | Phase 3: Rights Guidance | Pending |
| RIGHTS-04 | Phase 3: Rights Guidance | Pending |
| SONGTRUST-01 | Phase 3: Rights Guidance | Pending |
