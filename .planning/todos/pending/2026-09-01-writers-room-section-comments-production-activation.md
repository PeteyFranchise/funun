---
created: 2026-09-01T12:30:00-04:00
title: Complete Writer's Room section-comments multi-account UAT
area: catalogue
priority: deferred
status: pending-human-uat
depends_on:
  - supabase/migrations/146_writer_room_section_comments.sql
  - .planning/quick/260901-writers-room-section-comments/SUMMARY.md
---

## Purpose

Complete the deferred owner/member/non-member behavior pass for section comments. Migration 146 is
applied in production; this TODO remains pending because application is not evidence that the
multi-account behavior works end to end.

## Recorded Production State

- Migration 146 is applied.
- No migration push remains in this TODO.
- The multi-account UAT below is deferred and has not been marked complete.

## Multi-account UAT

Use one unreleased song with an owner and at least two invited contributors.

- Writer A opens Verse 1 comments and posts a root comment mentioning Writer B.
- Writer B sees the mention notification, follows it to the song and reads the private thread.
- Writer B replies; Writer A sees the reply without manually refreshing.
- Writer C cannot be mentioned unless they are a current participant with a Funūn handle.
- An unknown `@handle` remains ordinary text and creates no notification.
- A reply cannot be nested again or added after the root thread is resolved.
- The root author can resolve and reopen their thread.
- A different ordinary contributor cannot resolve someone else's root thread.
- The work owner or an administer-tier member can resolve any root thread.
- A non-member cannot read or write any section comments.
- Opening comments after typing lyrics preserves the pending lyric save and releases the section edit lock.
- The song diary shows root opened/resolved/reopened events but does not add an entry for every reply.
- Comments never change lyric text, splits, contracts, rights, identity, approved metadata, identifiers or audio.

## Completion Rule

Move this TODO to completed only after the owner/member/non-member UAT passes and its results are
recorded. Until then, describe migration 146 as **applied** and the section-comment multi-account
UAT as **deferred and pending**. This TODO does not block Phase 39 execution.
