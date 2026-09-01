---
created: 2026-09-01T12:30:00-04:00
title: Activate and verify Writer's Room section comments in production
area: catalogue
priority: immediate
status: pending-production-activation
depends_on:
  - supabase/migrations/146_writer_room_section_comments.sql
  - .planning/quick/260901-writers-room-section-comments/SUMMARY.md
---

## Purpose

Apply the forward-only section-comments migration and prove the feature with real owner/member sessions before describing it as live in production.

## Activation

1. From the Funūn repository, run `npm run db:push`.
2. Confirm the Supabase migration list is applied through 146.
3. Confirm the application deployment contains the commit recorded in the quick-task summary.

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

Move this TODO to completed only after migration 146 is applied, the deployed commit is verified, and the owner/member/non-member UAT passes. Until then, describe the capability as **built and awaiting production activation**, not live.
