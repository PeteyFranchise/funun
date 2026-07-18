// Tests for the Phase-11 presence bucket formatter
// (lib/social/presence.ts). Pure unit tests — no Supabase client,
// no mocking needed beyond fake timers.
//
// RED (Task 1): lib/social/presence.ts does not exist yet — this file
// MUST fail on module resolution. Task 2 makes it GREEN.

import { formatPresenceStatus } from '@/lib/social/presence'

// ─── formatPresenceStatus ────────────────────────────────────────────────

describe('formatPresenceStatus', () => {
  it('returns null for null input', () => {
    expect(formatPresenceStatus(null)).toBeNull()
  })

  it('returns "Active now" for a timestamp under 2 minutes old', () => {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    expect(formatPresenceStatus(oneMinuteAgo)).toBe('Active now')
  })

  it('returns "Active now" for a timestamp exactly 1 minute old', () => {
    const exactlyOneMin = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(exactlyOneMin)).toBe('Active now')
  })

  it('returns "Active Nm ago" for a timestamp ~5 minutes old', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(fiveMinutesAgo)).toBe('Active 5m ago')
  })

  it('returns "Active Nm ago" for a timestamp 30 minutes old', () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(thirtyMinutesAgo)).toBe('Active 30m ago')
  })

  it('returns "Active Nh ago" for a timestamp ~90 minutes old', () => {
    // 90 minutes = 1 hour 30 min → floors to 1h
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(ninetyMinutesAgo)).toBe('Active 1h ago')
  })

  it('returns "Active Nh ago" for a timestamp 6 hours old', () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(sixHoursAgo)).toBe('Active 6h ago')
  })

  it('returns "Active this week" for a timestamp ~26 hours old (over a day but under 7 days)', () => {
    const twentySixHoursAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(twentySixHoursAgo)).toBe('Active this week')
  })

  it('returns "Active this week" for a timestamp 3 days old', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(threeDaysAgo)).toBe('Active this week')
  })

  it('returns null for a timestamp ~8 days old (D-21 cutoff: nothing after ~7 days)', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(eightDaysAgo)).toBeNull()
  })

  it('returns null for a timestamp exactly 7 days old (boundary)', () => {
    // 7 days = exactly the cutoff; diffDay >= 7 → null
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(sevenDaysAgo)).toBeNull()
  })

  it('floors minutes (e.g., 59 min 30 sec → "Active 59m ago", not 60m)', () => {
    const almostAnHour = new Date(Date.now() - 59.5 * 60 * 1000).toISOString()
    expect(formatPresenceStatus(almostAnHour)).toBe('Active 59m ago')
  })
})
