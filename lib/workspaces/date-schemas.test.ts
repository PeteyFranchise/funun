import {
  assertDateOrdering,
  isoDateSchema,
  isoDateTimeSchema,
  optionalIsoDate,
  optionalIsoDateTime,
} from '@/lib/workspaces/date-schemas'

// ─── R-14 / WSR-22 (finding F19) ─────────────────────────────────────────
// The failure this module exists to prevent: a bare `z.string()` date field
// is stored, then later compared with `new Date(x).getTime()`. A malformed
// value parses to NaN, every numeric comparison against NaN is false, and
// the field therefore reads as "no constraint" — an unbounded authority
// window. These tests assert the refusal happens at the schema, before any
// value can reach a column.

describe('isoDateSchema', () => {
  it('accepts a calendar date in YYYY-MM-DD form that names a real day', () => {
    expect(isoDateSchema.safeParse('2026-09-06').success).toBe(true)
    expect(isoDateSchema.safeParse('2024-02-29').success).toBe(true)
    expect(isoDateSchema.safeParse('2026-12-31').success).toBe(true)
  })

  it('refuses a well-formed but impossible calendar date rather than rolling it over', () => {
    // 2026 is not a leap year and February never has 30 days. A regex-only
    // check passes both; a date constructor silently rolls them into March.
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-02-29').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-04-31').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-13-01').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-00-10').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-01-00').success).toBe(false)
  })

  it('refuses a malformed string, an empty string, and a full ISO datetime', () => {
    expect(isoDateSchema.safeParse('not-a-date').success).toBe(false)
    expect(isoDateSchema.safeParse('').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-1-1').success).toBe(false)
    expect(isoDateSchema.safeParse('06/09/2026').success).toBe(false)
    expect(isoDateSchema.safeParse('2026-09-06T00:00:00.000Z').success).toBe(false)
  })

  it('surfaces a readable message naming the expected shape', () => {
    const result = isoDateSchema.safeParse('2026-02-30')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/YYYY-MM-DD/)
    }
  })

  it('refuses a non-string input without throwing', () => {
    expect(() => isoDateSchema.safeParse(20260906)).not.toThrow()
    expect(isoDateSchema.safeParse(20260906).success).toBe(false)
    expect(isoDateSchema.safeParse(null).success).toBe(false)
  })
})

describe('isoDateTimeSchema', () => {
  it('accepts a full ISO-8601 datetime carrying an explicit UTC or offset designator', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:00:00.000Z').success).toBe(true)
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:00:00Z').success).toBe(true)
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:00:00+02:00').success).toBe(true)
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:00:00-05:00').success).toBe(true)
  })

  it('refuses a bare YYYY-MM-DD', () => {
    expect(isoDateTimeSchema.safeParse('2026-09-06').success).toBe(false)
  })

  it('refuses a datetime with no timezone designator, because it is ambiguous', () => {
    // An offset-less datetime is read as server-local time, which silently
    // shifts an authority window by the host's UTC offset.
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:00:00').success).toBe(false)
  })

  it('refuses an impossible calendar date and an out-of-range clock time', () => {
    expect(isoDateTimeSchema.safeParse('2026-02-30T12:00:00Z').success).toBe(false)
    expect(isoDateTimeSchema.safeParse('2026-09-06T25:00:00Z').success).toBe(false)
    expect(isoDateTimeSchema.safeParse('2026-09-06T12:61:00Z').success).toBe(false)
  })

  it('refuses a malformed string and an empty string', () => {
    expect(isoDateTimeSchema.safeParse('not-a-date').success).toBe(false)
    expect(isoDateTimeSchema.safeParse('').success).toBe(false)
  })

  it('surfaces a readable message naming ISO 8601', () => {
    const result = isoDateTimeSchema.safeParse('2026-09-06')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/ISO 8601/)
    }
  })
})

describe('optionalIsoDate / optionalIsoDateTime', () => {
  it('accepts undefined and null so a call site never composes the wrappers by hand', () => {
    expect(optionalIsoDate.safeParse(undefined).success).toBe(true)
    expect(optionalIsoDate.safeParse(null).success).toBe(true)
    expect(optionalIsoDateTime.safeParse(undefined).success).toBe(true)
    expect(optionalIsoDateTime.safeParse(null).success).toBe(true)
  })

  it('still refuses a malformed value when one is supplied', () => {
    expect(optionalIsoDate.safeParse('2026-02-30').success).toBe(false)
    expect(optionalIsoDate.safeParse('nope').success).toBe(false)
    expect(optionalIsoDateTime.safeParse('2026-09-06').success).toBe(false)
    expect(optionalIsoDateTime.safeParse('nope').success).toBe(false)
  })

  it('passes a valid value through unchanged', () => {
    const date = optionalIsoDate.safeParse('2026-09-06')
    expect(date.success).toBe(true)
    if (date.success) expect(date.data).toBe('2026-09-06')

    const dateTime = optionalIsoDateTime.safeParse('2026-09-06T12:00:00.000Z')
    expect(dateTime.success).toBe(true)
    if (dateTime.success) expect(dateTime.data).toBe('2026-09-06T12:00:00.000Z')
  })
})

describe('assertDateOrdering', () => {
  const labels = { startLabel: 'effectiveFrom', endLabel: 'expiresAt' }

  it('accepts a start before an end', () => {
    expect(
      assertDateOrdering({ start: '2026-01-01', end: '2026-12-31T00:00:00.000Z', ...labels })
    ).toEqual({ ok: true })
  })

  it('accepts either side being absent', () => {
    expect(assertDateOrdering({ start: null, end: '2026-12-31T00:00:00.000Z', ...labels })).toEqual({
      ok: true,
    })
    expect(assertDateOrdering({ start: '2026-01-01', end: null, ...labels })).toEqual({ ok: true })
    expect(assertDateOrdering({ start: undefined, end: undefined, ...labels })).toEqual({ ok: true })
  })

  it('refuses an end at or before its start, naming both field labels', () => {
    const before = assertDateOrdering({
      start: '2026-12-31',
      end: '2026-01-01T00:00:00.000Z',
      ...labels,
    })
    expect(before.ok).toBe(false)
    if (!before.ok) {
      expect(before.error).toContain('effectiveFrom')
      expect(before.error).toContain('expiresAt')
    }

    const equal = assertDateOrdering({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-01T00:00:00.000Z',
      ...labels,
    })
    expect(equal.ok).toBe(false)
  })

  it('refuses an unparseable value rather than treating NaN as absent', () => {
    // The whole point of R-14: NaN must never read as "no constraint."
    const badStart = assertDateOrdering({ start: 'not-a-date', end: '2026-12-31', ...labels })
    expect(badStart.ok).toBe(false)
    if (!badStart.ok) expect(badStart.error).toContain('effectiveFrom')

    const badEnd = assertDateOrdering({ start: '2026-01-01', end: 'not-a-date', ...labels })
    expect(badEnd.ok).toBe(false)
    if (!badEnd.ok) expect(badEnd.error).toContain('expiresAt')
  })

  it('never throws, whatever it is handed', () => {
    expect(() =>
      assertDateOrdering({ start: '', end: '', startLabel: 'a', endLabel: 'b' })
    ).not.toThrow()
  })
})
