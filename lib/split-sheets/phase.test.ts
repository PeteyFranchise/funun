// RED-first tests for the two-question party-phase gating helper
// (RESEARCH Pitfall 1, P17-01 link reuse, ESIGN-04/ESIGN-06).
//
// resolvePartyPhase() replaces the single `isExpired` boolean that used to
// treat ANY non-'pending' approval_status as an expired link — breaking the
// approve→sign link-reuse flow the instant a party approved.

import { resolvePartyPhase } from './phase'

const NOW = '2026-07-20T12:00:00.000Z'

describe('resolvePartyPhase', () => {
  it('returns token_invalid when there is no party row', () => {
    expect(
      resolvePartyPhase({ party: null, sheet: { status: 'draft' }, nowIso: NOW })
    ).toBe('token_invalid')
  })

  it('returns token_invalid when there is no sheet row', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'pending', token_expires_at: null },
        sheet: null,
        nowIso: NOW,
      })
    ).toBe('token_invalid')
  })

  it('returns token_invalid when the token has expired', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'pending', token_expires_at: '2026-07-01T00:00:00.000Z' },
        sheet: { status: 'pending_approval' },
        nowIso: NOW,
      })
    ).toBe('token_invalid')
  })

  it('does NOT treat a future-dated token_expires_at as expired', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'pending', token_expires_at: '2026-08-20T00:00:00.000Z' },
        sheet: { status: 'pending_approval' },
        nowIso: NOW,
      })
    ).toBe('approve')
  })

  it('returns approve for a pending party regardless of (non-draft) sheet status', () => {
    // 18-01: 'draft' now resolves to 'preview' (see the dedicated describe
    // block below) — this case uses a non-draft status to keep testing
    // the original "any status but draft" intent unmodified.
    expect(
      resolvePartyPhase({
        party: { approval_status: 'pending', token_expires_at: null },
        sheet: { status: 'pending_approval' },
        nowIso: NOW,
      })
    ).toBe('approve')
  })

  it('THE critical case: an already-approved party on an esign_pending sheet reaches sign, not expired', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'approved', token_expires_at: null },
        sheet: { status: 'esign_pending' },
        nowIso: NOW,
      })
    ).toBe('sign')
  })

  it.each(['pending_approval', 'countered', 'approved'] as const)(
    'returns waiting for an approved party while the sheet is still %s',
    sheetStatus => {
      expect(
        resolvePartyPhase({
          party: { approval_status: 'approved', token_expires_at: null },
          sheet: { status: sheetStatus },
          nowIso: NOW,
        })
      ).toBe('waiting')
    }
  )

  it('returns countered for a party who submitted a counter-proposal', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'countered', token_expires_at: null },
        sheet: { status: 'countered' },
        nowIso: NOW,
      })
    ).toBe('countered')
  })

  it('returns done when the sheet is fully executed, overriding party status', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'approved', token_expires_at: null },
        sheet: { status: 'executed' },
        nowIso: NOW,
      })
    ).toBe('done')
  })

  it('token_invalid still takes priority over an executed sheet when the token itself is expired', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'approved', token_expires_at: '2026-01-01T00:00:00.000Z' },
        sheet: { status: 'executed' },
        nowIso: NOW,
      })
    ).toBe('token_invalid')
  })

  // ── 18-01: 'preview' branch (P18-08 read-only draft share) ──────────
  it.each(['pending', 'approved', 'countered'] as const)(
    'returns preview for a draft sheet regardless of the party approval_status (%s)',
    approvalStatus => {
      expect(
        resolvePartyPhase({
          party: { approval_status: approvalStatus, token_expires_at: null },
          sheet: { status: 'draft' },
          nowIso: NOW,
        })
      ).toBe('preview')
    }
  )

  it('token_invalid still takes priority over a draft sheet when the token itself is expired', () => {
    expect(
      resolvePartyPhase({
        party: { approval_status: 'pending', token_expires_at: '2026-01-01T00:00:00.000Z' },
        sheet: { status: 'draft' },
        nowIso: NOW,
      })
    ).toBe('token_invalid')
  })
})
