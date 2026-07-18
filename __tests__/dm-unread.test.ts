// Tests for Phase-11 unread-count pure predicate
// (lib/social/dm.ts — hasUnread export). Pure unit test —
// no Supabase client, no mocking needed.
//
// RED (Task 1): hasUnread does not exist yet in lib/social/dm.ts —
// this file MUST fail on import. Task 3 makes it GREEN.

import { hasUnread } from '@/lib/social/dm'

// ─── hasUnread (PRESENCE-03, D-07) ───────────────────────────────────────
// Unread is computed by timestamp comparison only (D-07 rule: never a cached counter).

describe('hasUnread', () => {
  const olderTimestamp = '2026-01-01T10:00:00.000Z'
  const newerTimestamp = '2026-01-01T11:00:00.000Z'

  it('returns true when the latest message is newer than the read marker', () => {
    expect(hasUnread(olderTimestamp, newerTimestamp)).toBe(true)
  })

  it('returns false when the read marker is newer than the latest message', () => {
    expect(hasUnread(newerTimestamp, olderTimestamp)).toBe(false)
  })

  it('returns false when the read marker equals the latest message timestamp', () => {
    expect(hasUnread(olderTimestamp, olderTimestamp)).toBe(false)
  })

  it('returns true when lastReadAt is null (never read)', () => {
    // A null read marker means the viewer has never read the thread → always unread
    expect(hasUnread(null, newerTimestamp)).toBe(true)
  })

  it('returns false when latestMessageAt is null (no messages)', () => {
    // No messages at all → nothing to mark as unread
    expect(hasUnread(null, null)).toBe(false)
  })

  it('returns false when latestMessageAt is null even if read marker is also null', () => {
    expect(hasUnread(olderTimestamp, null)).toBe(false)
  })

  it('correctly uses timestamp comparison, not string lexicographic order', () => {
    // ISO strings happen to be lexicographically ordered, but the implementation
    // must parse them as Date objects to be correct.
    const ts1 = '2026-01-01T09:59:59.999Z'
    const ts2 = '2026-01-01T10:00:00.000Z'
    expect(hasUnread(ts1, ts2)).toBe(true)
    expect(hasUnread(ts2, ts1)).toBe(false)
  })

  it('returns true for a message sent 1ms after the read marker', () => {
    const readAt = '2026-06-01T12:00:00.000Z'
    const messageAt = '2026-06-01T12:00:00.001Z'
    expect(hasUnread(readAt, messageAt)).toBe(true)
  })
})
