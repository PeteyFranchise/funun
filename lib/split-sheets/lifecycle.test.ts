import {
  assertEditable,
  isAllowedStatusTransition,
  LIVING_DRAFT_STATUSES,
  CONSENSUS_RESET_STATUSES,
  type SplitSheetStatus,
} from './lifecycle'

describe('assertEditable — the freeze boundary', () => {
  describe('living-draft states stay freely editable', () => {
    it.each(LIVING_DRAFT_STATUSES)('%s allows party edits without resetting consensus', status => {
      const gate = assertEditable(status, true)
      expect(gate).toEqual({ ok: true, resetsConsensus: false })
    })
  })

  describe('in-flight approval resets consensus rather than silently keeping it', () => {
    it.each(CONSENSUS_RESET_STATUSES)('%s permits party edits but flags a reset', status => {
      const gate = assertEditable(status, true)
      expect(gate).toEqual({ ok: true, resetsConsensus: true })
    })

    it.each(CONSENSUS_RESET_STATUSES)(
      '%s does NOT reset when only sheet-level fields change',
      status => {
        const gate = assertEditable(status, false)
        expect(gate).toEqual({ ok: true, resetsConsensus: false })
      }
    )
  })

  describe('executed sheets are immutable (the data-loss case)', () => {
    // Regression: PATCH delete-and-reinserts party rows, and
    // esign_envelope_signers.split_sheet_party_id is ON DELETE CASCADE
    // (migration 062). Editing an executed sheet destroyed the audit
    // linkage between the signed document and who signed it.
    it('blocks party edits with 409', () => {
      const gate = assertEditable('executed', true)
      expect(gate.ok).toBe(false)
      if (gate.ok) throw new Error('unreachable')
      expect(gate.status).toBe(409)
      expect(gate.error).toMatch(/amendment/i)
    })

    it('blocks sheet-level edits too — a signed record is frozen entirely', () => {
      expect(assertEditable('executed', false).ok).toBe(false)
    })
  })

  describe('a live signature request must be voided before editing', () => {
    it('blocks party edits with 409 and points at voiding', () => {
      const gate = assertEditable('esign_pending', true)
      expect(gate.ok).toBe(false)
      if (gate.ok) throw new Error('unreachable')
      expect(gate.status).toBe(409)
      expect(gate.error).toMatch(/void/i)
    })

    it('blocks sheet-level edits under a live envelope', () => {
      expect(assertEditable('esign_pending', false).ok).toBe(false)
    })
  })
})

describe('isAllowedStatusTransition — closes the status back-door', () => {
  it('refuses to walk an executed sheet back to draft', () => {
    // Without this, a client could PATCH status executed→draft and then
    // edit freely, defeating assertEditable entirely.
    expect(isAllowedStatusTransition('executed', 'draft')).toBe(false)
  })

  it.each(['pending_approval', 'approved', 'countered', 'esign_pending'] as SplitSheetStatus[])(
    'refuses executed → %s',
    to => {
      expect(isAllowedStatusTransition('executed', to)).toBe(false)
    }
  )

  it('refuses to leave esign_pending via PATCH (the void route owns that)', () => {
    expect(isAllowedStatusTransition('esign_pending', 'draft')).toBe(false)
    expect(isAllowedStatusTransition('esign_pending', 'approved')).toBe(false)
  })

  it('allows walking consensus back to draft from in-flight approval', () => {
    expect(isAllowedStatusTransition('pending_approval', 'draft')).toBe(true)
    expect(isAllowedStatusTransition('approved', 'draft')).toBe(true)
    expect(isAllowedStatusTransition('countered', 'draft')).toBe(true)
  })

  it('refuses client-driven pipeline advancement — dedicated routes own that', () => {
    expect(isAllowedStatusTransition('draft', 'approved')).toBe(false)
    expect(isAllowedStatusTransition('draft', 'executed')).toBe(false)
    expect(isAllowedStatusTransition('approved', 'esign_pending')).toBe(false)
    expect(isAllowedStatusTransition('pending_approval', 'approved')).toBe(false)
  })

  it('treats a no-op transition as allowed', () => {
    expect(isAllowedStatusTransition('executed', 'executed')).toBe(true)
    expect(isAllowedStatusTransition('draft', 'draft')).toBe(true)
  })
})
