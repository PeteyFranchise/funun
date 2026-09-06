import type { AgreementEvidenceFacts } from '@/lib/workspaces/evidence'
import { resolveAuthorityTier, describeProvenance } from '@/lib/workspaces/evidence'

const NOW = new Date('2026-09-05T12:00:00.000Z').getTime()

function evidenceRow(overrides: Partial<AgreementEvidenceFacts> = {}): AgreementEvidenceFacts {
  return {
    declaredScope: 'Sync licensing on behalf of the Member',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    supersededAt: null,
    uploadedBy: 'user-123',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    witnessedBySignature: false,
    ...overrides,
  }
}

// ─── Authority tier resolution (D-16, D-39) ────────────────────────────────
describe('lib/workspaces/evidence resolveAuthorityTier', () => {
  it('returns none when the relationship state is anything other than accepted', () => {
    expect(
      resolveAuthorityTier({ relationshipState: 'proposed', evidence: [evidenceRow()], now: NOW })
    ).toBe('none')
    expect(
      resolveAuthorityTier({ relationshipState: 'refused', evidence: [evidenceRow()], now: NOW })
    ).toBe('none')
    expect(
      resolveAuthorityTier({ relationshipState: 'blocked', evidence: [evidenceRow()], now: NOW })
    ).toBe('none')
    expect(
      resolveAuthorityTier({ relationshipState: 'ended', evidence: [evidenceRow()], now: NOW })
    ).toBe('none')
  })

  it('returns operational for an accepted relationship with no evidence rows', () => {
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [], now: NOW })
    ).toBe('operational')
  })

  it('D-39: returns operational (not none) for an accepted relationship whose sole evidence row expired before now', () => {
    const expired = evidenceRow({ expiresAt: '2026-01-01T00:00:00.000Z' })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [expired], now: NOW })
    ).toBe('operational')
  })

  it('returns operational when the accepted relationship whose sole evidence row expires exactly at now', () => {
    const expiringNow = evidenceRow({ expiresAt: new Date(NOW).toISOString() })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [expiringNow], now: NOW })
    ).toBe('operational')
  })

  it('D-36: returns operational when an evidence row has no declaredScope', () => {
    const noScope = evidenceRow({ declaredScope: null })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [noScope], now: NOW })
    ).toBe('operational')
  })

  it('returns authority for an accepted relationship with a qualifying non-expired declared-scope row', () => {
    const qualifying = evidenceRow({ expiresAt: '2030-01-01T00:00:00.000Z' })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [qualifying], now: NOW })
    ).toBe('authority')
  })

  it('returns authority for a qualifying row with no expiresAt at all', () => {
    const noExpiry = evidenceRow({ expiresAt: null })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [noExpiry], now: NOW })
    ).toBe('authority')
  })

  it('returns operational when the only qualifying evidence row is superseded at or before now', () => {
    const superseded = evidenceRow({ supersededAt: '2026-06-01T00:00:00.000Z' })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [superseded], now: NOW })
    ).toBe('operational')
  })

  it('returns authority when at least one of several rows qualifies, even if others do not', () => {
    const expired = evidenceRow({ expiresAt: '2026-01-01T00:00:00.000Z' })
    const qualifying = evidenceRow({ expiresAt: '2030-01-01T00:00:00.000Z' })
    expect(
      resolveAuthorityTier({
        relationshipState: 'accepted',
        evidence: [expired, qualifying],
        now: NOW,
      })
    ).toBe('authority')
  })
})

// ─── Provenance description (D-37) ──────────────────────────────────────
describe('lib/workspaces/evidence describeProvenance', () => {
  it('carries uploader, upload timestamp, declared scope, and witnessedBySignature', () => {
    const row = evidenceRow({ uploadedBy: 'user-456', uploadedAt: '2026-02-01T00:00:00.000Z' })
    const result = describeProvenance(row)
    expect(result.uploadedBy).toBe('user-456')
    expect(result.uploadedAt).toBe('2026-02-01T00:00:00.000Z')
    expect(result.declaredScope).toBe(row.declaredScope)
    expect(result.witnessedBySignature).toBe(false)
  })

  it('labels a signature-witnessed row as witnessed by Funun', () => {
    const row = evidenceRow({ witnessedBySignature: true })
    expect(describeProvenance(row).stateLabel).toBe('Signature witnessed by Funun')
  })

  it('labels a non-witnessed row as uploaded by the rights holder', () => {
    const row = evidenceRow({ witnessedBySignature: false })
    expect(describeProvenance(row).stateLabel).toBe('Uploaded by the rights holder')
  })

  it('never returns a label containing a validated-status judgement word', () => {
    for (const witnessed of [true, false]) {
      const label = describeProvenance(evidenceRow({ witnessedBySignature: witnessed })).stateLabel
      expect(label.toLowerCase()).not.toMatch(/verified|approved/)
    }
  })
})
