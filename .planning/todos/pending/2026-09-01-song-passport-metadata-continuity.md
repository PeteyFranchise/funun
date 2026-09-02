---
created: 2026-09-01T02:30:00-04:00
title: Plan and ship the Song Passport metadata-continuity foundation
area: catalogue
priority: near-term
status: code-and-migrations-complete-awaiting-deploy-and-pilot-uat
depends_on:
  - Phase 37.2 Writer's Room Live Collaboration
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/the-catalogue-unreleased-works.md
  - lib/metadata/schema.ts
  - lib/metadata/export.ts
  - app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts
  - app/api/vault/[projectId]/tracks/[trackId]/metadata/sidecar/route.ts
  - supabase/migrations/135_works_core.sql
  - .planning/deliberations/song-passport-doctrine.md
  - .planning/phases/37.3-song-passport/37.3-CONTEXT.md
  - .planning/phases/37.3-song-passport/37.3-ARCHITECTURE.md
  - .planning/phases/37.3-song-passport/37.3-IMPLEMENTATION-PLAN.md
---

## Owner-approved capability

The feature is called **Song Passport**: credits, rights, provenance and recording
information that follows a song from its first demo through every version, graduation,
release and delivery artifact.

This is approved as near-term Phase 37.3. The doctrine, architecture and all seven code
slices are complete behind fail-closed server/cohort controls. Migrations 150–156 are
applied; deployment, activation and pilot UAT remain human-gated. Phases 37.4/37.5 stay
separate.

## Approved consolidation and implementation-planning sequence

1. Update the existing Song Passport decision record with every owner-approved doctrine.
2. Expand Phase 37.3 into the seven approved implementation mini-phases: architecture
   and schema, legacy backfill, Passport UI, confirmation and approval, versions and
   graduation, exports and portability, and pilot rollout.
3. Keep standards-message exports and validation in Phase 37.4.
4. Keep partner-validated direct delivery and recipient acknowledgments in Phase 37.5.
5. Audit the current work, collaborator, split-sheet, contract, metadata, audio and
   Release Report schemas before proposing new storage.
6. Produce the database model, authorization matrix, migration/backfill strategy,
   red-test plan and rollback plan.
7. Only after those artifacts are approved, begin the Song Passport foundation build.
8. Introduce a durable **Song Passport** entry in **The Playbook** that gives internal
   team members one authoritative reference for the feature's definitions, role,
   concept and complete approved doctrine. The entry must clearly label what is shipped,
   planned or partner-dependent and remain versioned as the product evolves. Detailed
   publication requirements live in
   `.planning/todos/pending/2026-09-01-song-passport-playbook-entry.md`.

### Consolidation completion state

- Steps 1–6: complete in `.planning/deliberations/song-passport-doctrine.md` and the
  Phase 37.3 context, architecture and implementation-plan records.
- Step 7: complete in code across Slices 1–7; migrations 150–156 are applied and
  production activation remains gated by deployment and pilot UAT.
- Step 8: the v1.0 doctrine and v1.1 operating SOP are published through applied
  migrations 150 and 156.

## Six locked product decisions

1. The artist-facing name is **Song Passport**.
2. Original uploaded audio is immutable. Metadata is physically embedded only in a
   generated delivery copy.
3. Inherited data propagates automatically until confirmed; confirmed, locked or
   previously delivered facts require review and are never silently overwritten.
4. Rights and split facts may live in the passport, but only public, delivery-safe
   fields are embedded in audio by default.
5. The first phase covers inheritance, provenance, confirmation states, MP3 delivery
   copies and human/machine-readable sidecars. It does not claim certified direct
   distributor, DSP, society or Secretly delivery.
6. Graduation from the Writer's Room into the Release Report is the principal
   end-to-end acceptance test.

Do not re-ask these six decisions during discussion or planning.

## Source-of-truth layers

### Contributor identity

- Professional/artist name and legal name
- Songwriter, performer and production roles
- PRO affiliation and IPI/CAE
- IPN/ISNI
- Publisher
- Approved professional contact information

A contributor maintains identity once and confirms its use for a song. Legal and
contact data remains permissioned even when it is part of the internal passport.

### Composition

- Song title, writers, roles and publishing shares
- Lyrics and language
- ISWC once assigned
- Publisher information
- Copyright/authorship provenance
- AI contribution history

Composition facts follow every recording version of the work.

### Recording version

- Performers, producers and engineers
- Recording date/location and duration
- Vocal/instrumental state, BPM and key
- Version label and master designation
- Recording/master ownership
- AI-performed elements

Version facts may differ across a hum, demo, acoustic take, instrumental, clean version
and final master.

### Release

- ISRC, UPC, release date and track number
- Label and catalogue number
- P-line and C-line
- Release title and distributor-facing information

Release facts arrive only at graduation. A rough demo never inherits an ISRC, UPC or
release date merely because another version has been commercially released.

## Field states and propagation

Every meaningful field has provenance plus one of these states:

- **Inherited** - sourced from a contributor, work or approved upstream record
- **Draft** - entered but not formally confirmed
- **Confirmed** - approved for this work or version
- **Locked** - tied to an executed agreement, registration or delivered release
- **Outdated** - the upstream source changed after confirmation/delivery and review is due

An inherited value can update automatically. A profile change may update unconfirmed
works but only marks confirmed or locked records for review. Every export binds to a
versioned metadata snapshot so later edits cannot rewrite what was previously delivered.

## File and export doctrine

Never mutate the original source audio. Preserve it as evidence and generate separate:

- Tagged MP3 delivery copy
- Human-readable credits/metadata sidecar
- Machine-readable JSON manifest
- Versioned metadata snapshot and export receipt
- DDEX/CWR/RDR export package where applicable

DDEX is a structured delivery message/export, not a synonym for an audio tag. The first
phase reuses the passport as one source for both tags and standards exports but does not
claim partner certification or transmission.

## Delivery-safe default

Audio tags may include title, artist, featured artists, album/release title, composer,
producer and performer credits, copyright lines, publisher, lyrics, language, genre,
BPM and assigned ISRC/ISWC/UPC values.

Do not embed by default: email, phone, physical address, payment information, signatures,
contract language, internal notes, private split negotiations or legal-document content.
Authorized sidecars or delivery packages may include approved professional contact data
only through an explicit export choice.

## Phase 37.3 seven-slice implementation scope

### Slice 1 - Architecture and schema

- Add one Passport per work, append-only field revisions, immutable snapshots, actions,
  tasks and least-authority RLS behind feature flags.
- Define the field vocabulary, source registry, privacy classes and authorization helpers.

### Slice 2 - Legacy backfill and reconciliation

- Dry-run current works, collaborators, splits, contracts, versions, release projects and
  track metadata; create inherited/draft revisions conservatively.
- Report ambiguous duplicates and conflicts for human review instead of guessing.

### Slice 3 - Passport UI

- Add the four-layer Passport view inside Sound Vault with provenance, trust/privacy
  states, tasks, conflicts and readiness explanations.
- Preserve the Writer's Room as the default creative view and the current site structure.

### Slice 4 - Confirmation, approval and permissions

- Add authority-scoped confirmation, immutable approval snapshots, conflict/outdated
  review, notification routing and server/database enforcement.
- Keep tasks operational: readiness changes only from qualifying facts and approvals.

### Slice 5 - Versions, master selection and graduation

- Carry composition facts across versions while preserving version-specific recording
  credits; support a final mix uploaded outside the Writer's Room.
- Select an exact master and graduate it into the Release Report without duplicate entry.

### Slice 6 - Exports, portability and custody history

- Generate tagged MP3s, sidecars, JSON manifests and receipts from immutable snapshots
  without changing source audio.
- Add portable custody packages, chain-of-title events and retention/deletion controls.

### Slice 7 - Pilot rollout

- Prove the full workflow with solo, multi-writer and legacy/released works.
- Add observability, support procedures, production verification and evidence-scoped claims.

## Explicit deferrals

- FLAC, M4A/MP4, AIFF and BWF/WAV container-specific embedding
- Certified direct delivery or acknowledgments from Secretly, distributors, DSPs or societies
- Registered partner DPIDs and production delivery certification
- Automatic publication of private contact or legal data
- Rewriting original masters in place

## Definition of done

The phase is shippable when an owner invites two contributors, their approved identity
facts populate the Song Passport, and the owner creates a demo, instrumental and final
master. Composition facts follow all three; each version retains distinct performer and
recording facts. The owner graduates the final master without re-entering approved data,
adds release-only fields, and generates a tagged MP3 plus sidecars from the same immutable
metadata snapshot. No private field is embedded, no original file changes, and a later
profile edit cannot silently rewrite confirmed, locked or previously delivered facts.

Tests must also prove authorization, provenance, graduation mapping, snapshot stability,
privacy filtering and byte/hash preservation of original audio.

## Claude / GSD instruction

Treat `.planning/deliberations/song-passport-doctrine.md` as the canonical owner-approved
record. Use the normalized-provenance-plus-immutable-JSON-snapshot architecture and the
authorization, migration/backfill, red-test and rollback strategies in
`.planning/phases/37.3-song-passport/37.3-ARCHITECTURE.md`. Execute the seven slices in
`.planning/phases/37.3-song-passport/37.3-IMPLEMENTATION-PLAN.md` in order; do not re-open
locked product decisions during planning unless new evidence creates a real contradiction.

The phase handoff is incomplete until Consolidation Step 8 is satisfied: publish the
internal Song Passport doctrine in The Playbook from the approved decision record, using
truthful current/planned/partner-dependent capability labels.

Slice evidence lives in `37.3-01-SUMMARY.md` through `37.3-07-SUMMARY.md`. Migrations
150–156 are applied. Deploy, then follow `37.3-PILOT-UAT.md`; do not expand beyond the pilot
until the acceptance and stop-condition review is complete.
