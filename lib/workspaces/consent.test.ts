import { readFileSync } from 'fs'
import path from 'path'
import { assertMemberMayConsent } from '@/lib/workspaces/consent'
import type { RosterRelationshipState, WorkspaceAuthorityTier } from '@/lib/workspaces/types'

const MEMBER_ID = 'member-1'
const OTHER_USER_ID = 'other-user'

function baseArgs(overrides: Partial<{
  requested: ReadonlySet<string>
  relationshipState: RosterRelationshipState
  relationshipMemberUserId: string
  consentingUserId: string
  relationshipTier: WorkspaceAuthorityTier
}> = {}) {
  return {
    requested: new Set(['view_summaries']),
    relationshipState: 'accepted' as RosterRelationshipState,
    relationshipMemberUserId: MEMBER_ID,
    consentingUserId: MEMBER_ID,
    relationshipTier: 'operational' as WorkspaceAuthorityTier,
    ...overrides,
  }
}

// ─── assertMemberMayConsent (R-01, D-21, F6) ──────────────────────────────
describe('lib/workspaces/consent assertMemberMayConsent', () => {
  it('approves a first-ever consent to view_summaries on an accepted, operational-tier relationship with zero existing grants', () => {
    const result = assertMemberMayConsent(baseArgs())
    expect(result).toEqual({ ok: true, permissions: ['view_summaries'] })
  })

  it('refuses an empty permission set — a consent to nothing is not a consent', () => {
    const result = assertMemberMayConsent(baseArgs({ requested: new Set([]) }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/empty/i)
  })

  it('refuses an unrecognised string, naming the offending value', () => {
    const result = assertMemberMayConsent(baseArgs({ requested: new Set(['not_a_real_permission']) }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('not_a_real_permission')
  })

  it('refuses manage_payouts as structurally excluded (D-42), with a distinct reason from the unrecognised-value case', () => {
    const result = assertMemberMayConsent(baseArgs({ requested: new Set(['manage_payouts']) }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('manage_payouts')
      expect(result.reason).toMatch(/structurally excluded/i)
    }
  })

  it('refuses view_tax_information as structurally excluded (D-42), with a distinct reason from the unrecognised-value case', () => {
    const result = assertMemberMayConsent(baseArgs({ requested: new Set(['view_tax_information']) }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('view_tax_information')
      expect(result.reason).toMatch(/structurally excluded/i)
    }
  })

  it('the structural-exclusion reason and the unrecognised-value reason are textually distinct', () => {
    const excluded = assertMemberMayConsent(baseArgs({ requested: new Set(['manage_payouts']) }))
    const unknown = assertMemberMayConsent(baseArgs({ requested: new Set(['not_a_real_permission']) }))
    expect(excluded.ok).toBe(false)
    expect(unknown.ok).toBe(false)
    if (!excluded.ok && !unknown.ok) {
      expect(excluded.reason).not.toEqual(unknown.reason)
    }
  })

  it('refuses an authority-tier permission when the relationship tier is operational', () => {
    const result = assertMemberMayConsent(
      baseArgs({ requested: new Set(['approve_releases']), relationshipTier: 'operational' })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('approve_releases')
  })

  it('refuses an authority-tier permission when the relationship tier is none', () => {
    const result = assertMemberMayConsent(
      baseArgs({ requested: new Set(['request_signatures']), relationshipTier: 'none' })
    )
    expect(result.ok).toBe(false)
  })

  it.each(['request_signatures', 'edit_rights_information', 'approve_releases', 'deliver_assets', 'act_on_behalf'])(
    'approves authority-tier permission %s when the relationship tier is authority',
    (permission) => {
      const result = assertMemberMayConsent(
        baseArgs({ requested: new Set([permission]), relationshipTier: 'authority' })
      )
      expect(result).toEqual({ ok: true, permissions: [permission] })
    }
  )

  it('refuses consent outright when the relationship state is not accepted', () => {
    const result = assertMemberMayConsent(baseArgs({ relationshipState: 'proposed' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/accepted/i)
  })

  it('refuses each non-accepted relationship state', () => {
    const states: RosterRelationshipState[] = ['proposed', 'refused', 'blocked', 'ended']
    for (const relationshipState of states) {
      const result = assertMemberMayConsent(baseArgs({ relationshipState }))
      expect(result.ok).toBe(false)
    }
  })

  it('refuses when the consenting caller is not the relationship\'s named member_user_id', () => {
    const result = assertMemberMayConsent(baseArgs({ consentingUserId: OTHER_USER_ID }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/named Member/i)
  })

  it('the identity check fires even when every other input would otherwise approve', () => {
    const result = assertMemberMayConsent(
      baseArgs({
        consentingUserId: OTHER_USER_ID,
        requested: new Set(['approve_releases']),
        relationshipTier: 'authority',
      })
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/named Member/i)
  })

  it('accumulates multiple valid permissions in the success result', () => {
    const result = assertMemberMayConsent(
      baseArgs({ requested: new Set(['view_summaries', 'view_metadata', 'upload_audio']) })
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.permissions).toEqual(
        expect.arrayContaining(['view_summaries', 'view_metadata', 'upload_audio'])
      )
      expect(result.permissions).toHaveLength(3)
    }
  })

  it('never throws on any input shape', () => {
    expect(() =>
      assertMemberMayConsent(
        baseArgs({ requested: new Set([]), relationshipState: 'ended', consentingUserId: '' })
      )
    ).not.toThrow()
  })

  it('never throws when the requested set contains an unrecognised, oddly-shaped string', () => {
    expect(() =>
      assertMemberMayConsent(baseArgs({ requested: new Set(['', '   ', '🎵not-a-permission']) }))
    ).not.toThrow()
  })
})

// ─── Source-text guard (F6 circularity cannot re-enter this module) ──────
describe('lib/workspaces/consent source guard', () => {
  it('never imports lib/workspaces/grant-service — that is the F6 circularity this module exists to break', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib/workspaces/consent.ts'), 'utf8')
    expect(source).not.toContain("from '@/lib/workspaces/grant-service'")
  })
})
