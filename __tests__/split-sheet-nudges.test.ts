// Tests for the viewed-but-no-action nudge eligibility rule (P17-04,
// ESIGN-09) and its wiring into the 17-01 notification builder
// (buildSplitSheetViewNudgeNotification). Page-visit tracking only — no
// email-open tracking (T-17-10).
//
// isNudgeEligible() is exercised here rather than co-located with
// resolvePartyPhase()'s own test file so the nudge contract (a distinct
// concern: "should the initiator be nudged to re-send?") is independently
// locked in and easy to find.

import { isNudgeEligible, NUDGE_WINDOW_MS } from '@/lib/split-sheets/phase'
import { buildSplitSheetViewNudgeNotification } from '@/lib/social/notifications'

const NOW = '2026-07-20T12:00:00.000Z'

function daysBeforeNow(days: number): string {
  return new Date(new Date(NOW).getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('isNudgeEligible', () => {
  it('is eligible when viewed, still pending, and past the ~3-day window', () => {
    expect(
      isNudgeEligible({
        firstViewedAt: daysBeforeNow(4),
        approvalStatus: 'pending',
        nowIso: NOW,
      })
    ).toBe(true)
  })

  it('is NOT eligible when the party never opened the link (first_viewed_at null)', () => {
    expect(
      isNudgeEligible({
        firstViewedAt: null,
        approvalStatus: 'pending',
        nowIso: NOW,
      })
    ).toBe(false)
  })

  it('is NOT eligible once the party has acted (already approved)', () => {
    expect(
      isNudgeEligible({
        firstViewedAt: daysBeforeNow(4),
        approvalStatus: 'approved',
        nowIso: NOW,
      })
    ).toBe(false)
  })

  it('is NOT eligible once the party has acted (countered)', () => {
    expect(
      isNudgeEligible({
        firstViewedAt: daysBeforeNow(10),
        approvalStatus: 'countered',
        nowIso: NOW,
      })
    ).toBe(false)
  })

  it('is NOT eligible when viewed but still within the nudge window', () => {
    expect(
      isNudgeEligible({
        firstViewedAt: daysBeforeNow(1),
        approvalStatus: 'pending',
        nowIso: NOW,
      })
    ).toBe(false)
  })

  it('window is exactly ~3 days', () => {
    expect(NUDGE_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000)
  })
})

describe('nudge eligibility wired to the 17-01 view-nudge notification builder', () => {
  it('produces a split_sheet_view_nudge notification for an eligible party', () => {
    const eligible = isNudgeEligible({
      firstViewedAt: daysBeforeNow(4),
      approvalStatus: 'pending',
      nowIso: NOW,
    })
    expect(eligible).toBe(true)

    const payload = buildSplitSheetViewNudgeNotification({
      recipientId: 'initiator-1',
      partyId: 'party-1',
      partyName: 'Jane Doe',
      songName: 'Midnight Run',
      splitSheetId: 'sheet-1',
    })

    expect(payload.type).toBe('split_sheet_view_nudge')
    expect(payload.userId).toBe('initiator-1')
    expect(payload.data).toMatchObject({
      splitSheetId: 'sheet-1',
      partyId: 'party-1',
      resendTarget: 'party-1',
    })
  })

  it('an ineligible (never-viewed) party should not have a nudge notification built for them', () => {
    const eligible = isNudgeEligible({
      firstViewedAt: null,
      approvalStatus: 'pending',
      nowIso: NOW,
    })
    expect(eligible).toBe(false)
    // The caller (sheet-view/bell digest) gates the builder call on
    // isNudgeEligible() — a never-viewed party never reaches the builder.
  })
})
