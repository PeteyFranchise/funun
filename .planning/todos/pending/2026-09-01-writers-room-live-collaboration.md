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

## Approved expansion — Cookups

**Owner decisions, 2026-09-26:** a host can schedule a Cookup; every Cookup needs a reusable event
card; and an eligible participant can join as a guest without first becoming a Funūn member. Viewer
passes and creative seats are separate and can each be free, paid, invite-only or application-based.
Open Studio lets a broad audience watch a creator work, and a host may send a curated live program
to supported social destinations. Paid Cookups require transparent order economics, a reconciled
internal ledger and verified provider-managed host payouts before launch.

**Entitlement decision:** Studio ($19/month) is the core unlock for starting Writer's Room video
and hosting Cookups. The host/room owner's entitlement funds the session; Writer-tier Members,
invited collaborators and account-free guests can join without subscribing. Team ($49/month) adds
capacity, co-host/moderator operations, simulcast and analytics rather than becoming the first tier
allowed to host. Exact media allowances wait for provider cost measurements.

**Media-source decision:** Studio includes one camera per creative participant and one authorized
screen share, including DAW/system audio only on verified device/browser paths. Team adds paired
secondary camera devices, more simultaneous sources, co-host production switching and saved scenes.
A paired phone is a named camera source with microphone/speaker off by default, not a duplicate
participant. Connected source, creative stage, selected viewer program, external simulcast and
recording are separate states; authorization for one never implies the next.

The account-free experience is a deliberate acquisition loop: the guest experiences the event
first, then may claim their participant identity and contributions afterward.

Cookups are a time-bound event layer above the persistent Writer's Room. They reuse presence and
future live media, but add scheduling, audience/creative capacity, pass policy, event cards, guest
identity, admission/moderation, curated viewer broadcast, optional social simulcast, host commerce
and a post-session handoff. A guest credential is scoped, expiring and revocable; it grants no
permanent room access. Attendance, ticket purchase and contribution never automatically grant
credit, ownership, splits or room membership. A private Writer's Room is never the outgoing
broadcast surface.

Full product brief and rollout:
`.planning/todos/pending/2026-09-26-writers-room-cookup-events-and-guest-access.md`.

Do not silently fold Cookups into Phase 37.2's existing definition of done. Discuss whether they
become a later phase or a separate phase pair after the underlying live-collaboration and
guest-identity foundations are evaluated.

## Claude / GSD instruction

Treat the scope, exclusions, block-level soft-lock model, anti-surveillance doctrine
and three-writer definition of done as owner-approved inputs. Do not re-ask whether to
build live collaboration. Use the discussion/research pass to decide architecture,
database contracts, Realtime channel security, snapshot cadence, offline behavior,
stale-lock expiry, event coalescing and the exact UI states. Plan red tests for
authorization, disconnect recovery and silent-overwrite prevention before execution.
