import {
  WRITER_DESIGNATIONS,
  PRIMARY_WRITER_DESIGNATIONS,
  WRITER_DESIGNATION_LABELS,
  WRITER_DESIGNATION_PLAIN,
  WRITER_DESIGNATION_CWR,
  WRITER_DESIGNATION_DDEX,
  asWriterDesignation,
} from './designation'

describe('writer designations — DDEX/PRO vocabulary', () => {
  it('maps every designation to a CWR code and a DDEX role (no gaps)', () => {
    for (const d of WRITER_DESIGNATIONS) {
      expect(WRITER_DESIGNATION_LABELS[d]).toBeTruthy()
      expect(WRITER_DESIGNATION_PLAIN[d]).toBeTruthy()
      expect(WRITER_DESIGNATION_CWR[d]).toBeTruthy()
      expect(WRITER_DESIGNATION_DDEX[d]).toBeTruthy()
    }
  })

  it('pins the standard CWR writer-designation codes', () => {
    expect(WRITER_DESIGNATION_CWR).toEqual({
      composer: 'C',
      lyricist: 'A',
      composer_lyricist: 'CA',
      arranger: 'AR',
      adapter: 'AD',
      translator: 'TR',
    })
  })

  it('pins the DDEX work-contributor roles', () => {
    expect(WRITER_DESIGNATION_DDEX.composer_lyricist).toBe('ComposerLyricist')
    expect(WRITER_DESIGNATION_DDEX.lyricist).toBe('Lyricist')
  })

  it('offers the three common roles first', () => {
    expect(PRIMARY_WRITER_DESIGNATIONS).toEqual(['composer', 'lyricist', 'composer_lyricist'])
  })

  it('narrows only valid values; everything else is null', () => {
    expect(asWriterDesignation('composer')).toBe('composer')
    expect(asWriterDesignation('composer_lyricist')).toBe('composer_lyricist')
    expect(asWriterDesignation('beatmaker')).toBeNull()
    expect(asWriterDesignation('')).toBeNull()
    expect(asWriterDesignation(null)).toBeNull()
    expect(asWriterDesignation(undefined)).toBeNull()
    expect(asWriterDesignation(3)).toBeNull()
  })
})
