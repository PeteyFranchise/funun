import {
  isSubsetGrant,
  filterGrantableByAuthority,
  assertGrantIsIssuable,
} from '@/lib/workspaces/grants'
import type { WorkspacePermission } from '@/lib/workspaces/permissions'

// ─── isSubsetGrant (D-49) ──────────────────────────────────────────────────
describe('lib/workspaces/grants isSubsetGrant', () => {
  it('returns true when every requested permission is held by the granter', () => {
    expect(
      isSubsetGrant(
        new Set(['view_summaries', 'view_metadata']),
        new Set<WorkspacePermission>(['view_summaries', 'view_metadata', 'upload_audio'])
      )
    ).toBe(true)
  })

  it('returns false when any requested permission is not held, even if the rest are', () => {
    expect(
      isSubsetGrant(
        new Set(['view_summaries', 'approve_releases']),
        new Set<WorkspacePermission>(['view_summaries'])
      )
    ).toBe(false)
  })

  it('returns false for an empty granter set with a non-empty request', () => {
    expect(isSubsetGrant(new Set(['view_summaries']), new Set<WorkspacePermission>([]))).toBe(
      false
    )
  })

  it('returns false for an empty request (a grant of nothing is not a valid grant)', () => {
    expect(isSubsetGrant(new Set([]), new Set<WorkspacePermission>(['view_summaries']))).toBe(
      false
    )
  })

  it('returns false when a requested value is not a member of WORKSPACE_PERMISSION_VALUES', () => {
    expect(
      isSubsetGrant(
        new Set(['not_a_real_permission']),
        new Set<WorkspacePermission>(['view_summaries'])
      )
    ).toBe(false)
  })

  it('refuses a structurally excluded capability name arriving as a raw string', () => {
    expect(
      isSubsetGrant(
        new Set(['manage_payouts']),
        new Set<WorkspacePermission>(['view_summaries'])
      )
    ).toBe(false)
  })

  it('never throws on any input shape', () => {
    expect(() => isSubsetGrant(new Set([]), new Set([]))).not.toThrow()
  })
})

// ─── filterGrantableByAuthority (D-16, D-21, D-39) ─────────────────────────
describe('lib/workspaces/grants filterGrantableByAuthority', () => {
  const requested = new Set<WorkspacePermission>([
    'view_summaries',
    'approve_releases',
    'act_on_behalf',
  ])

  it('drops every authority-tier permission when tier is operational', () => {
    expect(filterGrantableByAuthority(requested, 'operational')).toEqual(['view_summaries'])
  })

  it('drops every authority-tier permission when tier is none', () => {
    expect(filterGrantableByAuthority(requested, 'none')).toEqual(['view_summaries'])
  })

  it('keeps authority-tier permissions when tier is authority', () => {
    expect(filterGrantableByAuthority(requested, 'authority')).toEqual([
      'view_summaries',
      'approve_releases',
      'act_on_behalf',
    ])
  })

  it('keeps operational-tier permissions regardless of tier', () => {
    const onlyOperational = new Set<WorkspacePermission>(['view_summaries', 'upload_audio'])
    expect(filterGrantableByAuthority(onlyOperational, 'none')).toEqual([
      'view_summaries',
      'upload_audio',
    ])
  })
})

// ─── assertGrantIsIssuable (D-49) ──────────────────────────────────────────
describe('lib/workspaces/grants assertGrantIsIssuable', () => {
  it('returns ok:true with the resolved permissions when everything checks out', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['view_summaries', 'upload_audio']),
      granterHolds: new Set<WorkspacePermission>(['view_summaries', 'upload_audio']),
      relationshipTier: 'operational',
    })
    expect(result).toEqual({ ok: true, permissions: ['view_summaries', 'upload_audio'] })
  })

  it('refuses an empty request', () => {
    const result = assertGrantIsIssuable({
      requested: new Set([]),
      granterHolds: new Set<WorkspacePermission>(['view_summaries']),
      relationshipTier: 'operational',
    })
    expect(result.ok).toBe(false)
  })

  it('refuses an unknown permission string, naming it in the reason', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['not_a_real_permission']),
      granterHolds: new Set<WorkspacePermission>(['view_summaries']),
      relationshipTier: 'authority',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('not_a_real_permission')
  })

  it('refuses a structurally excluded capability name supplied as a raw string, naming it', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['manage_payouts']),
      granterHolds: new Set<WorkspacePermission>(['view_summaries']),
      relationshipTier: 'authority',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('manage_payouts')
  })

  it('refuses view_tax_information supplied as a raw string, naming it', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['view_tax_information']),
      granterHolds: new Set<WorkspacePermission>(['view_summaries']),
      relationshipTier: 'authority',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('view_tax_information')
  })

  it('refuses an authority-tier permission when relationshipTier is operational, naming the permission', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['approve_releases']),
      granterHolds: new Set<WorkspacePermission>(['approve_releases']),
      relationshipTier: 'operational',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('approve_releases')
  })

  it('refuses an authority-tier permission when relationshipTier is none', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['act_on_behalf']),
      granterHolds: new Set<WorkspacePermission>(['act_on_behalf']),
      relationshipTier: 'none',
    })
    expect(result.ok).toBe(false)
  })

  it('allows an authority-tier permission when relationshipTier is authority and granter holds it', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['approve_releases']),
      granterHolds: new Set<WorkspacePermission>(['approve_releases']),
      relationshipTier: 'authority',
    })
    expect(result).toEqual({ ok: true, permissions: ['approve_releases'] })
  })

  it('refuses a permission exceeding what the granter holds, naming it', () => {
    const result = assertGrantIsIssuable({
      requested: new Set(['upload_audio']),
      granterHolds: new Set<WorkspacePermission>(['view_summaries']),
      relationshipTier: 'operational',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('upload_audio')
  })

  it('never throws on any input shape', () => {
    expect(() =>
      assertGrantIsIssuable({
        requested: new Set([]),
        granterHolds: new Set([]),
        relationshipTier: 'none',
      })
    ).not.toThrow()
  })
})
