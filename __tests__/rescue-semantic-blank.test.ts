import {
  isSemanticBlankText,
  isSemanticBlankJson,
  rescueValue,
  RESCUE_FIELD_MAP,
} from '@/lib/profile/semantic-blank'

describe('isSemanticBlankText', () => {
  it('treats null, undefined, empty, and whitespace-only strings as blank', () => {
    expect(isSemanticBlankText(null)).toBe(true)
    expect(isSemanticBlankText(undefined)).toBe(true)
    expect(isSemanticBlankText('')).toBe(true)
    expect(isSemanticBlankText('   ')).toBe(true)
  })

  it('treats a real value as non-blank', () => {
    expect(isSemanticBlankText('ASCAP')).toBe(false)
  })
})

describe('isSemanticBlankJson', () => {
  it('treats null, undefined, and {} as blank', () => {
    expect(isSemanticBlankJson(null)).toBe(true)
    expect(isSemanticBlankJson(undefined)).toBe(true)
    expect(isSemanticBlankJson({})).toBe(true)
  })

  it('treats a populated object as non-blank', () => {
    expect(isSemanticBlankJson({ line1: '1 Main St' })).toBe(false)
  })
})

describe('rescueValue (canonical-wins)', () => {
  it("rescues a stranded PRO ('' canonical) over a blank canonical", () => {
    expect(rescueValue('', 'BMI', 'text')).toBe('BMI')
  })

  it('keeps a real canonical PRO over a stranded one', () => {
    expect(rescueValue('ASCAP', 'BMI', 'text')).toBe('ASCAP')
  })

  it('rescues a stranded address when the canonical mailing_address is {}', () => {
    expect(rescueValue({}, { line1: 'x' }, 'json')).toEqual({ line1: 'x' })
  })

  it('keeps a non-empty canonical address over a stranded {}', () => {
    expect(rescueValue({ line1: 'real' }, {}, 'json')).toEqual({ line1: 'real' })
  })

  it('treats whitespace-only canonical text as blank and rescues the stranded value', () => {
    expect(rescueValue('   ', 'BMI', 'text')).toBe('BMI')
  })
})

describe('RESCUE_FIELD_MAP', () => {
  it('maps phone -> contact_phone', () => {
    const mapping = RESCUE_FIELD_MAP.find((m) => m.source === 'phone')
    expect(mapping?.target).toBe('contact_phone')
  })

  it('maps display_name -> artist_name', () => {
    const mapping = RESCUE_FIELD_MAP.find((m) => m.source === 'display_name')
    expect(mapping?.target).toBe('artist_name')
  })

  it('maps bio -> bio', () => {
    const mapping = RESCUE_FIELD_MAP.find((m) => m.source === 'bio')
    expect(mapping?.target).toBe('bio')
  })

  it('maps mailing_address as a json-kind field', () => {
    const mapping = RESCUE_FIELD_MAP.find((m) => m.source === 'mailing_address')
    expect(mapping?.target).toBe('mailing_address')
    expect(mapping?.kind).toBe('json')
  })

  it('covers pro, ipi, and publisher', () => {
    const sources = RESCUE_FIELD_MAP.map((m) => m.source)
    expect(sources).toEqual(expect.arrayContaining(['pro', 'ipi', 'publisher']))
  })
})
