---
created: 2026-09-01T02:05:00-04:00
title: Plan and ship block-level live collaboration in the Writer's Room
area: catalogue
priority: near-term
status: ready-for-gsd-discussion
depends_on:
  - Phase 37.1 owner cross-device hum test
files:
  - .planning/ROADMAP.md
  - .planning/deliberations/the-catalogue-unreleased-works.md
  - components/catalogue/WorkPage.tsx
  - components/catalogue/LyricsPad.tsx
  - components/catalogue/WorkDiary.tsx
  - components/catalogue/WorkRoster.tsx
  - supabase/migrations/136_work_members.sql
---

## Owner decision

The Writer's Room will become a live collaborative space where multiple writers can
work on the same song at the same time. The first shippable version is **block-level
live collaboration**, not a character-level Google Docs clone.

This is approved as near-term work and should be reviewed through
`/gsd-discuss-phase 37.2`, then researched/planned before implementation. Close Phase
37.1's owner cross-device hum test first so the new phase starts from a verified base.

## Product doctrine

Creative collaboration and legal consent are different systems. Lyrics, notes,
presence and meaningful diary events may update live. Publishing percentages,
executed agreements, legal identities, final release identifiers, approved metadata
and uploaded audio files require explicit review or immutable/versioned workflows.

Presence communicates creative context, not productivity. Never add keystroke
monitoring, detailed idle-time reporting, productivity scores or a permanent record of
every abandoned phrase.

## Initial experience

The room shows who is present and what they are doing in plain creative language:

- Peter is editing Verse 1
- Maya is listening to Take 3
- Jordan added a note to the chorus
- Recently active

Users see changes to lyrics and notes without refreshing. Work autosaves, meaningful
edits retain author and timestamp, recoverable snapshots exist, connection loss is
safe, and important actions enter the song diary.

## Conflict model

Use section-level soft locks for the first release. When Maya is editing Verse 1,
Peter can wait, open another section, suggest an alternate version, or intentionally
take over after a warning. A takeover must never silently discard Maya's work.

Do not begin with character-level operational transformation or a CRDT unless Phase
37.2 research proves section-level locking cannot satisfy the acceptance criteria.

## Delivery stages

### Stage 1 - Presence

- Live collaborator avatars and room membership
- Join, leave, disconnect and reconnect handling
- Activity states: in room, editing a section, listening to a take, recently active
- User-scoped presence keys and cleanup behavior compatible with Phase 11 precedent

### Stage 2 - Section-aware editing

- Visible soft lock / editing indicator per lyric block or note
- Live lyric and note updates without refresh
- Autosave with author and timestamp
- Intentional, warned takeover flow

### Stage 3 - Safety

- Recoverable snapshots for meaningful saves
- Version restoration with attribution
- Connection-loss and stale-lock recovery
- Conflict warnings and protection against silent overwrite
- Multi-tab and duplicate-session behavior defined and tested

### Stage 4 - Creative collaboration

- Comments and suggestions
- Alternate lyric versions
- Collaborator mentions
- Human-readable session summaries
- Only meaningful actions promoted into the permanent diary

## Initial exclusions

Do not live-edit:

- Publishing percentages or split-sheet decisions
- Executed agreements
- Legal names or identity records
- Final ISRC, ISWC, UPC or other release identifiers
- Approved/final metadata
- Audio file bytes; uploads create immutable versions instead

These surfaces may receive comments or proposed changes, but formal changes retain
their existing approval, versioning and audit boundaries.

## Definition of done

The feature is shippable when three invited writers can enter the same song on separate
sessions, see one another's presence and current activity, edit different lyric
sections and notes concurrently, recover after one device disconnects, resolve a
same-section collision intentionally, restore a previous snapshot, and finish without
losing or silently overwriting any contribution.

The test must also prove:

- Unauthorized users receive no room presence or content events
- Leaving or closing a session clears presence and stale locks predictably
- Rights, contracts, identity, approved metadata and identifiers cannot be mutated by
  the live collaboration channel
- Diary output records meaningful authored changes without recording every keystroke
- Existing single-writer and non-Realtime behavior still works

## Claude / GSD instruction

Treat the scope, exclusions, block-level soft-lock model, anti-surveillance doctrine
and three-writer definition of done as owner-approved inputs. Do not re-ask whether to
build live collaboration. Use the discussion/research pass to decide architecture,
database contracts, Realtime channel security, snapshot cadence, offline behavior,
stale-lock expiry, event coalescing and the exact UI states. Plan red tests for
authorization, disconnect recovery and silent-overwrite prevention before execution.
