import { ROSTER_RELATIONSHIP_STATE_VALUES } from '@/lib/workspaces/types'
import {
  LEGAL_ROSTER_EDGES,
  isLegalRosterTransition,
  isInertState,
  canWorkspaceProposeRoster,
  resolveEffectiveEnd,
  isWorkspaceAccessLive,
} from '@/lib/workspaces/roster'

// ─── Roster transition matrix (D-05, D-07) ─────────────────────────────────
describe('lib/workspaces/roster transition matrix', () => {
  it('has a LEGAL_ROSTER_EDGES key for every ROSTER_RELATIONSHIP_STATE_VALUES member', () => {
    for (const state of ROSTER_RELATIONSHIP_STATE_VALUES) {
      expect(LEGAL_ROSTER_EDGES[state]).toBeDefined()
    }
  })

  it('allows proposed -> accepted, proposed -> refused, proposed -> blocked', () => {
    expect(isLegalRosterTransition('proposed', 'accepted')).toBe(true)
    expect(isLegalRosterTransition('proposed', 'refused')).toBe(true)
    expect(isLegalRosterTransition('proposed', 'blocked')).toBe(true)
  })

  it('allows accepted -> ended', () => {
    expect(isLegalRosterTransition('accepted', 'ended')).toBe(true)
  })

  it('refuses refused -> accepted', () => {
    expect(isLegalRosterTransition('refused', 'accepted')).toBe(false)
  })

  it('refuses ended -> accepted (ended is terminal, never revived)', () => {
    expect(isLegalRosterTransition('ended', 'accepted')).toBe(false)
  })

  it('refuses every same-state pair', () => {
    for (const state of ROSTER_RELATIONSHIP_STATE_VALUES) {
      expect(isLegalRosterTransition(state, state)).toBe(false)
    }
  })

  it('refuses any unknown state value', () => {
    expect(
      isLegalRosterTransition(
        'not-a-real-state' as unknown as (typeof ROSTER_RELATIONSHIP_STATE_VALUES)[number],
        'accepted'
      )
    ).toBe(false)
  })

  it('refuses every outbound edge from refused, blocked, and ended', () => {
    for (const terminal of ['refused', 'blocked', 'ended'] as const) {
      for (const state of ROSTER_RELATIONSHIP_STATE_VALUES) {
        if (state === terminal) continue
        expect(isLegalRosterTransition(terminal, state)).toBe(false)
      }
    }
  })
})

// ─── Inertness (D-05) ────────────────────────────────────────────────────
describe('lib/workspaces/roster isInertState (D-05)', () => {
  it('is true for proposed', () => {
    expect(isInertState('proposed')).toBe(true)
  })

  it('is false for accepted', () => {
    expect(isInertState('accepted')).toBe(false)
  })

  it('is false for every non-proposed state', () => {
    for (const state of ROSTER_RELATIONSHIP_STATE_VALUES) {
      if (state === 'proposed') continue
      expect(isInertState(state)).toBe(false)
    }
  })
})

// ─── Proposal eligibility (D-51, D-15) ─────────────────────────────────────
describe('lib/workspaces/roster canWorkspaceProposeRoster', () => {
  it('is false when the Member has blocked this workspace (D-51)', () => {
    expect(
      canWorkspaceProposeRoster({ hasLiveRelationship: false, isBlocked: true })
    ).toBe(false)
  })

  it('is true when unblocked with no live relationship', () => {
    expect(
      canWorkspaceProposeRoster({ hasLiveRelationship: false, isBlocked: false })
    ).toBe(true)
  })

  it('is false when a live relationship already exists with this workspace', () => {
    expect(
      canWorkspaceProposeRoster({ hasLiveRelationship: true, isBlocked: false })
    ).toBe(false)
  })

  it('D-15: does not consider how many OTHER workspaces already hold a relationship with the Member — multiplicity is permitted', () => {
    // canWorkspaceProposeRoster's signature has no "other workspace count"
    // input at all — it can only ever see this workspace's own
    // hasLiveRelationship/isBlocked facts. Calling it identically for what
    // would be a Member's second, third, or Nth relationship with a
    // DIFFERENT workspace always yields the same true result.
    const factsForAnyWorkspace = { hasLiveRelationship: false, isBlocked: false }
    expect(canWorkspaceProposeRoster(factsForAnyWorkspace)).toBe(true)
    expect(canWorkspaceProposeRoster(factsForAnyWorkspace)).toBe(true)
  })
})

// ─── Effective end date (D-17, D-18) ───────────────────────────────────────
describe('lib/workspaces/roster resolveEffectiveEnd', () => {
  it('returns the earlier of terminatesOn and revokedAt when both are present', () => {
    expect(
      resolveEffectiveEnd({
        terminatesOn: '2026-12-01T00:00:00.000Z',
        revokedAt: '2026-06-01T00:00:00.000Z',
      })
    ).toBe('2026-06-01T00:00:00.000Z')
  })

  it('returns terminatesOn when only it is set', () => {
    expect(
      resolveEffectiveEnd({ terminatesOn: '2026-12-01T00:00:00.000Z', revokedAt: null })
    ).toBe('2026-12-01T00:00:00.000Z')
  })

  it('returns revokedAt when only it is set', () => {
    expect(
      resolveEffectiveEnd({ terminatesOn: null, revokedAt: '2026-06-01T00:00:00.000Z' })
    ).toBe('2026-06-01T00:00:00.000Z')
  })

  it('returns null when neither is set', () => {
    expect(resolveEffectiveEnd({ terminatesOn: null, revokedAt: null })).toBeNull()
  })

  it('D-18: a unilateral revocation beats a later scheduled termination date', () => {
    const result = resolveEffectiveEnd({
      terminatesOn: '2027-01-01T00:00:00.000Z', // scheduled far in the future
      revokedAt: '2026-09-05T00:00:00.000Z', // revoked immediately, today
    })
    expect(result).toBe('2026-09-05T00:00:00.000Z')
  })
})

// ─── Live access window ─────────────────────────────────────────────────
describe('lib/workspaces/roster isWorkspaceAccessLive', () => {
  const NOW = new Date('2026-09-05T12:00:00.000Z').getTime()

  it('is false for any state other than accepted, even when the date window is open', () => {
    for (const state of ROSTER_RELATIONSHIP_STATE_VALUES) {
      if (state === 'accepted') continue
      expect(
        isWorkspaceAccessLive({
          state,
          effectiveFrom: null,
          effectiveEnd: null,
          now: NOW,
        })
      ).toBe(false)
    }
  })

  it('is false for proposed even when the date window is open', () => {
    expect(
      isWorkspaceAccessLive({
        state: 'proposed',
        effectiveFrom: '2020-01-01T00:00:00.000Z',
        effectiveEnd: '2030-01-01T00:00:00.000Z',
        now: NOW,
      })
    ).toBe(false)
  })

  it('is false before effectiveFrom', () => {
    expect(
      isWorkspaceAccessLive({
        state: 'accepted',
        effectiveFrom: '2027-01-01T00:00:00.000Z',
        effectiveEnd: null,
        now: NOW,
      })
    ).toBe(false)
  })

  it('is false at or after effectiveEnd', () => {
    expect(
      isWorkspaceAccessLive({
        state: 'accepted',
        effectiveFrom: null,
        effectiveEnd: '2026-09-05T12:00:00.000Z',
        now: NOW,
      })
    ).toBe(false)
  })

  it('is true when accepted and within the open date window', () => {
    expect(
      isWorkspaceAccessLive({
        state: 'accepted',
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveEnd: '2027-01-01T00:00:00.000Z',
        now: NOW,
      })
    ).toBe(true)
  })

  it('is true when accepted with no date window at all', () => {
    expect(
      isWorkspaceAccessLive({
        state: 'accepted',
        effectiveFrom: null,
        effectiveEnd: null,
        now: NOW,
      })
    ).toBe(true)
  })
})
