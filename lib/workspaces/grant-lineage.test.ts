import {
  isGrantChainLive,
  MEMBER_CONSENT_SOURCE,
  MAX_GRANT_CHAIN_DEPTH,
  type GrantChainRow,
} from '@/lib/workspaces/grant-lineage'

const RELATIONSHIP_ID = 'relationship-1'

function row(overrides: Partial<GrantChainRow> & { id: string }): GrantChainRow {
  return {
    parentGrantId: null,
    source: 'individual',
    permission: 'view_summaries',
    projectId: null,
    revokedAt: null,
    relationshipId: RELATIONSHIP_ID,
    ...overrides,
  }
}

// ─── isGrantChainLive (R-01, D-21, WSR-02) ────────────────────────────────
describe('lib/workspaces/grant-lineage isGrantChainLive', () => {
  it('a single row with parentGrantId null, source member_consent, unrevoked is LIVE', () => {
    const rows = [row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE })]
    expect(isGrantChainLive({ grantId: 'root', rows })).toEqual({ ok: true })
  })

  it('the same single row with source individual is NOT live — no consent root confers nothing', () => {
    const rows = [row({ id: 'root', parentGrantId: null, source: 'individual' })]
    const result = isGrantChainLive({ grantId: 'root', rows })
    expect(result.ok).toBe(false)
  })

  it('a two-link chain (delegated -> member_consent root), both unrevoked, is LIVE', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual' }),
    ]
    expect(isGrantChainLive({ grantId: 'child', rows })).toEqual({ ok: true })
  })

  it('the same two-link chain with the ROOT revoked is NOT live — revocation cascades at read time', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, revokedAt: '2026-01-01T00:00:00Z' }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual' }),
    ]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
  })

  it('the same chain with the DESCENDANT revoked is NOT live', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', revokedAt: '2026-01-01T00:00:00Z' }),
    ]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
  })

  it('a chain containing a cycle is NOT live and terminates rather than looping', () => {
    const rows = [
      row({ id: 'a', parentGrantId: 'b', source: 'individual' }),
      row({ id: 'b', parentGrantId: 'a', source: 'individual' }),
    ]
    const result = isGrantChainLive({ grantId: 'a', rows })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/cycle/i)
  })

  it('a chain with a dangling parent id is NOT live — fails closed on missing evidence', () => {
    const rows = [row({ id: 'child', parentGrantId: 'ghost-parent', source: 'individual' })]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/absent/i)
  })

  it('refuses when the leaf grant itself is not present among the supplied rows', () => {
    const result = isGrantChainLive({ grantId: 'nonexistent', rows: [] })
    expect(result.ok).toBe(false)
  })

  it('a descendant whose permission is absent from its parent\'s permission is NOT live', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, permission: 'view_summaries' }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', permission: 'upload_audio' }),
    ]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
  })

  it('a descendant with a non-null projectId whose parent has a DIFFERENT non-null projectId is NOT live', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, projectId: 'project-a' }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', projectId: 'project-b' }),
    ]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
  })

  it('a descendant with a non-null projectId whose parent has a null projectId (relationship-wide) IS live — narrowing is allowed', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, projectId: null }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', projectId: 'project-a' }),
    ]
    expect(isGrantChainLive({ grantId: 'child', rows })).toEqual({ ok: true })
  })

  it('a descendant with a null projectId whose parent has a non-null projectId is NOT live — widening is refused', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, projectId: 'project-a' }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', projectId: null }),
    ]
    const result = isGrantChainLive({ grantId: 'child', rows })
    expect(result.ok).toBe(false)
  })

  it('a descendant with the SAME non-null projectId as its parent IS live', () => {
    const rows = [
      row({ id: 'root', parentGrantId: null, source: MEMBER_CONSENT_SOURCE, projectId: 'project-a' }),
      row({ id: 'child', parentGrantId: 'root', source: 'individual', projectId: 'project-a' }),
    ]
    expect(isGrantChainLive({ grantId: 'child', rows })).toEqual({ ok: true })
  })

  it('a chain longer than MAX_GRANT_CHAIN_DEPTH is refused rather than walked indefinitely', () => {
    const rows: GrantChainRow[] = [row({ id: 'root-0', parentGrantId: null, source: MEMBER_CONSENT_SOURCE })]
    const chainLength = MAX_GRANT_CHAIN_DEPTH + 5
    for (let i = 1; i <= chainLength; i++) {
      rows.push(row({ id: `link-${i}`, parentGrantId: i === 1 ? 'root-0' : `link-${i - 1}`, source: 'individual' }))
    }
    const result = isGrantChainLive({ grantId: `link-${chainLength}`, rows })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/depth/i)
  })

  it('a chain exactly at MAX_GRANT_CHAIN_DEPTH hops from the root is still live', () => {
    const rows: GrantChainRow[] = [row({ id: 'root-0', parentGrantId: null, source: MEMBER_CONSENT_SOURCE })]
    for (let i = 1; i <= MAX_GRANT_CHAIN_DEPTH; i++) {
      rows.push(row({ id: `link-${i}`, parentGrantId: i === 1 ? 'root-0' : `link-${i - 1}`, source: 'individual' }))
    }
    const result = isGrantChainLive({ grantId: `link-${MAX_GRANT_CHAIN_DEPTH}`, rows })
    expect(result.ok).toBe(true)
  })

  it('never throws on any input shape, including an empty rows array', () => {
    expect(() => isGrantChainLive({ grantId: 'anything', rows: [] })).not.toThrow()
  })

  it('exports MEMBER_CONSENT_SOURCE as the literal "member_consent"', () => {
    expect(MEMBER_CONSENT_SOURCE).toBe('member_consent')
  })
})
