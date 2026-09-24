# Phase 44: Writer's Room Members, Presence, and Room Chat — Context

**Captured:** 2026-09-23
**Status:** Owner-approved; ready for execution planning
**Migration:** Chat schema unassigned and human-gated; migration 228 unavailable

## Goal

Make the room visibly inhabited and give accepted room members one persistent, room-scoped conversation
without confusing chat with rights, comments, Studio Notes, or direct messages.

## Locked decisions

- **WR-01:** Heading is **Room members**; copy is **These people have access to this Writer's Room.**
- **WR-02:** Show profile photos/initials; avatar popover includes full display name, `@handle`, room role,
  and presence so duplicate first names are distinguishable.
- **WR-03:** Green means **Here now in this room**, not platform-wide online and not active typing.
- **WR-04:** Pending invitations are separate from accepted members.
- **WR-05:** Room chat is persistent, shared with the room, and available as a desktop rail/mobile drawer.
- **WR-06:** Comments remain item-anchored, Studio Notes remain durable direction/work, and DMs remain
  private/cross-project. Chat does not replace any of them.
- **WR-07:** Chat v1 has text, replies, mentions, timestamps, unread state, and only the minimal reaction
  set approved during plan 44-02. No generic attachments.
- **WR-08:** **Convert to Studio Note** and **Attach to section/take** use explicit actions and provenance.
- **WR-09:** Presence/chat creates no authorship, credit, split, ownership, approval, or delivery fact.
- **WR-10:** Access removal/block prevents new reads/writes immediately; historical visibility, edit/delete,
  retention, moderation, and audit are resolved at a human checkpoint before migration authoring.

## Existing foundation

- `components/catalogue/WriterRoomPresence.tsx` already owns private Realtime Presence, visibility
  untracking, heartbeats, stale sweeps, and live collaboration broadcasts.
- `supabase/migrations/143_writer_room_presence_authorization.sql` authorizes the private presence topic
  through `is_work_owner` / `work_member_tier`.
- `lib/catalogue/studio-notes.ts`, section comments, notifications, blocks, and work membership must be
  read before chat is modeled; do not clone their semantics by name.

## Out of scope

No audio/video session, recording, file attachment, public/guest chat, disappearing messages, rights
inference, or direct-message replacement.
