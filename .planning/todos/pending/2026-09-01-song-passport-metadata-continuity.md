---
created: 2026-09-01T02:30:00-04:00
title: Plan and ship the Song Passport metadata-continuity foundation
area: catalogue
priority: near-term
status: ready-for-gsd-discussion
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
---

## Owner-approved capability

The feature is called **Song Passport**: credits, rights, provenance and recording
information that follows a song from its first demo through every version, graduation,
release and delivery artifact.

This is approved as a near-term Phase 37.3 candidate. Run `/gsd-discuss-phase 37.3`
after Phase 37.2 is complete, then research and plan before implementation.

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

## Phase 37.3 first-release scope

### Stage 1 - Passport model

- Structured composition and version metadata on My Catalogue works
- Source record, source field, actor, timestamp and state provenance
- Privacy/delivery classification for embeddable vs permissioned data

### Stage 2 - Inheritance and approval

- Contributor identity flows into a work with consent
- Work facts flow into new versions
- Version-specific recording credits remain independent
- Confirmation, locking, outdated warnings and review flows
- No silent overwrite of confirmed or delivered facts

### Stage 3 - Delivery artifacts

- Tagged MP3 generated from a selected version and metadata snapshot
- Human-readable credits/metadata sidecar
- Machine-readable JSON manifest
- Export receipt identifying work, version, snapshot, exporter and timestamp
- Original audio hash/path remains unchanged

### Stage 4 - Graduation

- Select one version as the release master
- Carry confirmed composition and selected version facts into the Release Report
- Add release-only identifiers and commercial fields there
- Preserve the work/version/metadata history and source links
- Prevent duplicate re-entry while requiring review of unresolved or outdated fields

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

Treat the six decisions, four-layer model, five field states, immutable-original rule,
delivery-safe boundary and graduation acceptance test as owner-approved. Use the
discussion/research pass to decide normalized-vs-JSONB storage, provenance granularity,
snapshot schema, consent mechanics, export receipt structure, migration/backfill and UI
states. Plan red tests for privacy leakage, silent overwrite, authorization failure,
snapshot drift and accidental source-file mutation before execution.
