// First co-located test file for lib/social/notifications.ts — created for
// Phase 17's five new split-sheet builders (P17-04). Covers recipient/
// title/link/data for each, per the Phase 10 catalog pattern.

import {
  NOTIFICATION_TYPES,
  buildSplitPartyApprovedNotification,
  buildSplitPartySignedNotification,
  buildSplitSheetCounteredNotification,
  buildSplitSheetExecutedNotification,
  buildSplitSheetViewNudgeNotification,
} from './notifications'

const baseArgs = {
  recipientId: 'initiator-1',
  partyId: 'party-1',
  partyName: 'Jane Doe',
  songName: 'Midnight Run',
  splitSheetId: 'sheet-1',
}

describe('split-sheet notification catalog entries', () => {
  it('registers all five new types', () => {
    expect(NOTIFICATION_TYPES).toHaveProperty('split_sheet_party_approved')
    expect(NOTIFICATION_TYPES).toHaveProperty('split_sheet_party_signed')
    expect(NOTIFICATION_TYPES).toHaveProperty('split_sheet_countered')
    expect(NOTIFICATION_TYPES).toHaveProperty('split_sheet_executed')
    expect(NOTIFICATION_TYPES).toHaveProperty('split_sheet_view_nudge')
  })
})

describe('buildSplitPartyApprovedNotification', () => {
  it('targets the initiator, names the party + song, and links into the sheet', () => {
    const payload = buildSplitPartyApprovedNotification(baseArgs)
    expect(payload.userId).toBe('initiator-1')
    expect(payload.type).toBe('split_sheet_party_approved')
    expect(payload.title).toContain('Jane Doe')
    expect(payload.title).toContain('Midnight Run')
    expect(payload.link).toBe('/split-sheets/sheet-1')
    expect(payload.data).toMatchObject({ splitSheetId: 'sheet-1' })
  })
})

describe('buildSplitPartySignedNotification', () => {
  it('targets the initiator, names the party + song, and links into the sheet', () => {
    const payload = buildSplitPartySignedNotification(baseArgs)
    expect(payload.userId).toBe('initiator-1')
    expect(payload.type).toBe('split_sheet_party_signed')
    expect(payload.title).toContain('Jane Doe')
    expect(payload.title).toContain('Midnight Run')
    expect(payload.link).toBe('/split-sheets/sheet-1')
  })
})

describe('buildSplitSheetCounteredNotification', () => {
  it('carries the highest-urgency framing', () => {
    const payload = buildSplitSheetCounteredNotification(baseArgs)
    expect(payload.userId).toBe('initiator-1')
    expect(payload.type).toBe('split_sheet_countered')
    expect(payload.title).toContain('Jane Doe')
    expect(payload.data).toMatchObject({ urgency: 'high' })
  })
})

describe('buildSplitSheetExecutedNotification', () => {
  it('announces full execution and links into the sheet', () => {
    const payload = buildSplitSheetExecutedNotification(baseArgs)
    expect(payload.userId).toBe('initiator-1')
    expect(payload.type).toBe('split_sheet_executed')
    expect(payload.title).toContain('Midnight Run')
    expect(payload.link).toBe('/split-sheets/sheet-1')
  })
})

describe('buildSplitSheetViewNudgeNotification', () => {
  it('carries a one-tap re-send affordance in its data', () => {
    const payload = buildSplitSheetViewNudgeNotification(baseArgs)
    expect(payload.userId).toBe('initiator-1')
    expect(payload.type).toBe('split_sheet_view_nudge')
    expect(payload.title).toContain('Jane Doe')
    expect(payload.data).toMatchObject({ partyId: 'party-1', resendTarget: 'party-1' })
  })
})
