# Funūn — Wave 2: Rights & Registration Rails

**Project type:** Brownfield milestone (Wave 2 of an existing platform)
**Milestone:** Rights & Registration Rails
**Owner:** Pete (peter.zora@gmail.com)
**Started:** 2026-06-26
**Platform:** funun.studio — the operating system for an independent music career

---

## What This Is

Wave 2 completes the **rights and registration layer** of Funūn's Sound Vault. Wave 1 tightened asset readiness (audio, artwork, metadata, distributor gate). Wave 2 makes the legal and registration side of a release equally structured and trackable.

Three pillars:

1. **Collaborator profiles** — enter a collaborator once, auto-fill everywhere (split sheets, contracts, registrations). Needs a new `collaborators` table.
2. **Document lifecycle** — upload-only e-sign for now (artists upload pre-signed PDFs, Funūn tracks signed/pending status per document and per project). Dropbox Sign is the provider interface target for when the account is live; the abstraction (`lib/esign/provider.ts`) is already built.
3. **Rights guidance** — in-app guided checklists for copyright registration (copyright.gov eCO), PRO registration (ASCAP/BMI/SESAC/SOCAN), and SoundExchange, with deep-links and per-project status tracking. Songtrust gets a guide card + CWR export hook; full API integration is a pending BD conversation (API registration model + carve-out structure).

---

## Core Value

An artist completes a release knowing their rights are documented, their collaborators are on record, and their registrations are tracked — all from inside Funūn, with no data re-entry.

---

## Context

### Existing codebase (brownfield — what Wave 2 builds on)

| Layer | What exists |
|---|---|
| E-sign abstraction | `lib/esign/provider.ts` — full `EsignProvider` interface, `EsignState` type, `readEsignState()`, `allSigned()`. No concrete provider yet. |
| Document tracking | `vault_documents` table — `type`, `status` (`pending`/`signed`/`verified`), `document_data` JSONB (where `esign` state rides) |
| Contract Locker UI | `components/contracts/ContractLocker.tsx`, `ContractUpload.tsx` — upload + AI verification. No dispersal/signing UI. |
| Contract verification | `lib/contracts/verify.ts` — Claude-powered PDF verification. Known bug: brittle JSON extraction (regex-based). |
| Rights Coach | `components/coach/RightsCoach.tsx` — eligibility gates (sync/streaming Tier 1/2). No guided filing flow. |
| Registration data | `lib/metadata/registration.ts` — builds registration packages (CWR, RDR-N). `registrations` page exists. |
| Collaborators | Not implemented. Composer/performer data re-entered per release in MetadataStudio. |
| Songtrust | Not started. Outreach email drafted. CWR export works and is the natural integration hook. |

### Tech stack (inherited)
Next.js 15 App Router · TypeScript · Supabase (PostgreSQL + RLS + Storage) · Tailwind · Anthropic SDK

### What Wave 2 does NOT include
- Dropbox Sign live implementation (needs paid account — interface is ready, implementation deferred)
- Songtrust API integration (pending BD conversation)
- SoundCloud / Bandsintown / YouTube integrations (Wave 4)
- Launchpad room (Wave 3)

---

## Requirements

### Validated (Wave 1 — already shipped)

- ✓ Master WAV + shareable MP3 upload slots — existing
- ✓ Artwork 3000×3000 spec validation — existing
- ✓ Lyrics .txt export — existing
- ✓ Distributor-selected gate (migrations 016–017) — existing
- ✓ ISRC generation and assignment — existing
- ✓ DDEX ERN 3.5.1 + RDR-N XSD-validated exports — existing
- ✓ Contract PDF upload + AI verification — existing
- ✓ E-sign provider abstraction — existing

### Active (Wave 2 targets)

- [ ] **COLLAB-01**: Artist can add a collaborator with name, email, phone, PRO affiliation, IPI/CAE number, publisher, MLC/SoundExchange IDs, and mailing address
- [ ] **COLLAB-02**: Collaborator data auto-fills into split sheet and contract forms
- [ ] **COLLAB-03**: Collaborator list is reusable across all projects (not per-project)
- [ ] **DOC-01**: Artist can upload a signed PDF for any document type and have its status flip to "signed" with a timestamp
- [ ] **DOC-02**: Split sheet and contract documents show signer list with pending/signed status per signer (from uploaded document metadata or manual input)
- [ ] **DOC-03**: Project readiness score correctly gates on split sheets and contracts being signed (not just uploaded)
- [ ] **RIGHTS-01**: Artist sees a guided copyright registration checklist with step-by-step instructions and a direct deep-link to copyright.gov eCO
- [ ] **RIGHTS-02**: Artist sees a guided PRO registration checklist (ASCAP / BMI / SESAC / SOCAN) with deep-links and per-project ISWC tracking
- [ ] **RIGHTS-03**: Artist sees a guided SoundExchange registration checklist with deep-link; status tracked when RDR-N data is present
- [ ] **RIGHTS-04**: All three registration checklists show completion status per project on the Rights Coach / registrations page
- [ ] **SONGTRUST-01**: Rights Coach shows a Songtrust guide card explaining publishing admin, with CWR export as the "send your data" action

### Out of Scope (this wave)

- Dropbox Sign live implementation — needs paid account; interface is built; deferred
- Songtrust API integration — pending BD conversation about API registration and carve-outs
- SoundExchange data integration — RDR-N export is ready; direct filing integration is Wave 4
- PRO filing API integration — guide-and-link only; automation requires partner agreements
- SMS signature confirmation — deferred until Dropbox Sign is live
- Auto-transcode WAV→MP3 — Wave 1 deferred item, not in Wave 2

---

## Key Decisions

| Decision | Rationale | Outcome |
|---|---|---|
| Upload-only e-sign (no Dropbox Sign yet) | Dropbox Sign Standard ~$300/mo; account not yet set up; abstraction is in place | Artists upload pre-signed PDFs; status tracked; Dropbox Sign slots in behind the same interface when ready |
| Collaborators as a separate table (not per-project) | Same producer/co-writer appears on multiple projects; re-entry is the pain point to solve | `collaborators` table keyed by `artist_id`; linked to documents and tracks |
| Songtrust as guide + CWR hook only | BD conversation needed before API access; CWR export already works | Guide card in Rights Coach; CWR export is the natural handoff action |
| Guided filing with deep-links, not automation | Copyright.gov, ASCAP/BMI, SoundExchange have no open APIs for programmatic filing | In-app step-by-step + tracked status is the max automation tier available |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After Wave 2 ships:**
1. Move all Active requirements to Validated
2. Update `docs/STATUS.md` and `docs/release-journey.md` to mark Wave 2 complete
3. Assess Wave 3 (Launchpad room) as next milestone

---

*Last updated: 2026-06-26 after initialization*
