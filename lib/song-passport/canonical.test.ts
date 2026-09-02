import { canonicalJson, canonicalSha256 } from '@/lib/song-passport/canonical'

describe('Song Passport canonical snapshots', () => {
  it('hashes object keys independently of insertion order', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}')
    expect(canonicalSha256({ b: 2, a: 1 })).toBe(canonicalSha256({ a: 1, b: 2 }))
  })
})
