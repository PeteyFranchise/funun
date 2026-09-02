---
created: 2026-09-01T18:15:00-04:00
title: Publish the Song Passport doctrine in The Playbook
area: playbook
priority: near-term
status: migration-authored-human-push-pending
depends_on:
  - Phase 37.3 Song Passport decision consolidation
files:
  - .planning/todos/pending/2026-09-01-song-passport-metadata-continuity.md
  - .planning/deliberations/the-catalogue-unreleased-works.md
  - .planning/ROADMAP.md
  - app/(admin)/admin/playbook/
  - lib/playbook/
---

## Objective

Introduce a durable **Song Passport** entry in **The Playbook**, Funūn's internal team
wiki for standards, SOPs and practices. The entry must let an authorized team member
understand what the Song Passport is, why it exists, how it relates to the rest of Funūn
and which rules must remain true as the product evolves.

This is Consolidation Step 8 of the owner-approved Song Passport sequence. It is an
internal knowledge and governance deliverable, not artist-facing marketing copy.

## Delivery state

- Canonical doctrine: complete in `.planning/deliberations/song-passport-doctrine.md`.
- Playbook seed: authored as `supabase/migrations/150_playbook_song_passport_doctrine.sql`.
- Text-lock verification: authored as `__tests__/migration-150.test.ts`.
- Production publication: pending the owner's human-gated `supabase db push`.

## Source and authority

- Use the fully consolidated, owner-approved Song Passport decision record as the
  content source of truth.
- Do not replace doctrine with implementation details or marketing language.
- Label each capability as **shipped**, **planned** or **partner-dependent** so the entry
  never implies that a roadmap item is already live.
- Preserve entry versions, publication history, author, approver and review date.
- When doctrine changes, publish a new version or approved revision; never silently
  rewrite the historical team reference.

## Required entry structure

### 1. Plain-language definition

Define the Song Passport as the living, versioned record of a song's credits, rights,
provenance, recording versions, release facts and delivery history from first idea through
release and later custody changes.

### 2. Role inside Funūn

Explain that the Song Passport lives with the song inside Sound Vault and connects:

- The Writer's Room for creative history and contributions
- Collaborator profiles for permissioned identity facts
- Split Sheets for approved composition ownership
- Contract Locker for executed legal authority and chain of title
- Release Report for release-only facts and readiness
- Delivery artifacts, manifests and receipts for exact outbound snapshots

### 3. Core data concept

Document one canonical Passport per underlying work, with distinct contributor,
composition, recording-version and release layers. Explain the living-record model,
immutable snapshots, field provenance, source authority and conflict handling.

### 4. Full approved doctrine

The entry must cover, in plain internal language:

- field trust states and safe inheritance
- confirmation, approval, locking and correction boundaries
- privacy classifications, permissions and scoped sharing
- original-master immutability and generated delivery-safe copies
- recording versions, final-master selection and Release Report graduation
- readiness facts, assigned tasks and the rule that tasks route work but do not change
  readiness by themselves
- split, contract and identity facts remaining outside live creative editing
- ownership changes, master sales and chain-of-title history
- portability, custody transfer, retention and deletion
- MP3 ID3 delivery copies, sidecars and machine-readable manifests
- CWR, RIN and ERN/DDEX as structured exports rather than audio-embedded identities
- delivery states, receipts, corrections and recipient acknowledgments
- AI-assistance boundaries and required human confirmation
- first shippable scope, explicit deferrals, pilot gates and definition of done
- claims the team must avoid until partner or production evidence exists

### 5. Operating reference

Include a short glossary, role/permission matrix, lifecycle overview, common examples,
links to the governing roadmap and decision record, and a named owner plus review cadence.

## Publication gate

The Playbook entry is ready when a team member who did not attend the product discussions
can accurately explain:

1. what the Song Passport is and is not;
2. where each class of fact comes from;
3. who may draft, confirm, approve, share or deliver it;
4. how versions, corrections and custody changes are preserved; and
5. which capabilities are live, coming later or dependent on outside partners.

## Claude / GSD instruction

Treat this TODO as the required Step 8 internal handoff for Song Passport. The v1.0 seed
maps the owner-approved doctrine into the existing Company-wide Playbook publishing and
RBAC model. Do not describe roadmap or partner-dependent capabilities as currently
available. Future doctrine changes create a dated successor entry/revision rather than
silently rewriting the v1.0 baseline.
