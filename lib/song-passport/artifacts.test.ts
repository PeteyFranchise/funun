import { buildPassportSidecar, deliverySafePassportMetadata, passportId3Fields } from '@/lib/song-passport/artifacts'

describe('Song Passport delivery-safe artifacts', () => {
  const values = [
    { fieldKey: 'composition_title', targetKey: 'work', value: 'A Song', state: 'confirmed', visibility: 'delivery_safe' },
    { fieldKey: 'legal_name', targetKey: 'user:1', value: 'Private Name', state: 'confirmed', visibility: 'private_identity' },
    { fieldKey: 'publishing_shares', targetKey: 'work', value: { one: 100 }, state: 'locked', visibility: 'legal_restricted' },
    { fieldKey: 'isrc', targetKey: 'track:1', value: 'US-AAA-26-00001', state: 'confirmed', visibility: 'delivery_safe' },
  ]

  it('excludes private and legal facts from delivery-safe output', () => {
    const metadata = deliverySafePassportMetadata(values)
    expect(metadata.facts).toEqual({ composition_title: 'A Song', isrc: 'US-AAA-26-00001' })
    expect(JSON.stringify(metadata)).not.toContain('Private Name')
    expect(JSON.stringify(metadata)).not.toContain('publishing_shares')
  })

  it('builds a human sidecar and ID3 map from the same filtered facts', () => {
    const metadata = deliverySafePassportMetadata(values)
    expect(buildPassportSidecar(metadata)).toContain('Song title: A Song')
    expect(buildPassportSidecar(metadata)).toMatch(/Metadata SHA-256: [0-9a-f]{64}/)
    expect(passportId3Fields(metadata)).toMatchObject({ title: 'A Song', isrc: 'US-AAA-26-00001' })
  })
})
