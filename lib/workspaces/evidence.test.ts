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
    confirmedBySubjectAt: '2026-01-02T00:00:00.000Z',
    documentId: 'document-123',
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

// ─── R-08/WSR-14/WSR-15: confirmation, document presence, effective-from
// gating (finding F8) ───────────────────────────────────────────────────
describe('lib/workspaces/evidence resolveAuthorityTier — R-08/WSR-14/WSR-15 gating', () => {
  it('returns authority for a row that is confirmed, documented, scoped, in-window, and unsuperseded', () => {
    const fullyQualified = evidenceRow({
      confirmedBySubjectAt: '2026-01-02T00:00:00.000Z',
      documentId: 'document-123',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
      supersededAt: null,
    })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [fullyQualified], now: NOW })
    ).toBe('authority')
  })

  it('WSR-15: does not raise the tier when effectiveFrom is in the future (not yet effective)', () => {
    const notYetEffective = evidenceRow({ effectiveFrom: '2030-01-01T00:00:00.000Z' })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [notYetEffective], now: NOW })
    ).toBe('operational')
  })

  it('D-39: a future-dated agreement demotes to operational, never to none', () => {
    const notYetEffective = evidenceRow({ effectiveFrom: '2030-01-01T00:00:00.000Z' })
    const tier = resolveAuthorityTier({
      relationshipState: 'accepted',
      evidence: [notYetEffective],
      now: NOW,
    })
    expect(tier).not.toBe('none')
    expect(tier).toBe('operational')
  })

  it('treats an effectiveFrom of exactly now as live', () => {
    const effectiveNow = evidenceRow({ effectiveFrom: new Date(NOW).toISOString() })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [effectiveNow], now: NOW })
    ).toBe('authority')
  })

  it('treats a null effectiveFrom as effective immediately', () => {
    const immediatelyEffective = evidenceRow({ effectiveFrom: null })
    expect(
      resolveAuthorityTier({
        relationshipState: 'accepted',
        evidence: [immediatelyEffective],
        now: NOW,
      })
    ).toBe('authority')
  })

  it('R-08/F8: an evidence row the subject has not confirmed never raises the tier, however complete its declared scope', () => {
    const unconfirmed = evidenceRow({ confirmedBySubjectAt: null })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [unconfirmed], now: NOW })
    ).toBe('operational')
  })

  it('an accepted relationship with only unconfirmed evidence resolves to operational, never none', () => {
    const unconfirmed = evidenceRow({ confirmedBySubjectAt: null })
    const tier = resolveAuthorityTier({
      relationshipState: 'accepted',
      evidence: [unconfirmed],
      now: NOW,
    })
    expect(tier).not.toBe('none')
    expect(tier).toBe('operational')
  })

  it('WSR-14: an evidence row with no documentId never raises the tier, even when confirmed', () => {
    const undocumented = evidenceRow({ confirmedBySubjectAt: '2026-01-02T00:00:00.000Z', documentId: null })
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [undocumented], now: NOW })
    ).toBe('operational')
  })

  it('treats a malformed effectiveFrom as not-live rather than as no constraint, without throwing', () => {
    const malformed = evidenceRow({ effectiveFrom: 'not-a-date' })
    expect(() =>
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).not.toThrow()
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).toBe('operational')
  })

  it('treats a malformed expiresAt as not-live rather than as never-expiring, without throwing', () => {
    const malformed = evidenceRow({ expiresAt: 'not-a-date' })
    expect(() =>
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).not.toThrow()
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).toBe('operational')
  })

  it('treats a malformed supersededAt as not-live rather than as never-superseded, without throwing', () => {
    const malformed = evidenceRow({ supersededAt: 'not-a-date' })
    expect(() =>
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).not.toThrow()
    expect(
      resolveAuthorityTier({ relationshipState: 'accepted', evidence: [malformed], now: NOW })
    ).toBe('operational')
  })

  it('a non-accepted relationship still resolves to none before any evidence is examined', () => {
    const fullyQualified = evidenceRow()
    expect(
      resolveAuthorityTier({ relationshipState: 'proposed', evidence: [fullyQualified], now: NOW })
    ).toBe('none')
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
