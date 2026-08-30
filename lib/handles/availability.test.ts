import { handleFieldState } from '@/lib/handles/availability'

describe('handleFieldState', () => {
  it('is idle, blocking, with no message when nothing has been typed', () => {
    expect(handleFieldState({ raw: '', checking: false, remote: null })).toEqual({
      status: 'idle',
      message: null,
      blocksSubmit: true,
    })
  })

  it('is invalid (too short) with the shared format message', () => {
    const result = handleFieldState({ raw: 'ab', checking: false, remote: null })
    expect(result.status).toBe('invalid')
    expect(result.message).toEqual(expect.any(String))
    expect(result.blocksSubmit).toBe(true)
  })

  it('is invalid on consecutive separators', () => {
    const result = handleFieldState({ raw: 'may--a', checking: false, remote: null })
    expect(result.status).toBe('invalid')
    expect(result.blocksSubmit).toBe(true)
  })

  it('is checking, non-blocking, while a debounced request is in flight', () => {
    expect(
      handleFieldState({ raw: 'maya-reyes', checking: true, remote: null })
    ).toEqual({ status: 'checking', message: null, blocksSubmit: false })
  })

  it('is available, non-blocking, on a free verdict', () => {
    expect(
      handleFieldState({
        raw: 'maya-reyes',
        checking: false,
        remote: { available: true, reason: null },
      })
    ).toEqual({ status: 'available', message: null, blocksSubmit: false })
  })

  it('is unavailable, blocking, with a pick-another message on a taken verdict', () => {
    const result = handleFieldState({
      raw: 'maya-reyes',
      checking: false,
      remote: { available: false, reason: 'unavailable' },
    })
    expect(result.status).toBe('unavailable')
    expect(result.message).toEqual(expect.any(String))
    expect(result.blocksSubmit).toBe(true)
  })

  it('is unknown, non-blocking, when the courtesy check could not reach the server (D-14)', () => {
    expect(
      handleFieldState({
        raw: 'maya-reyes',
        checking: false,
        remote: { available: null, reason: null },
      })
    ).toEqual({ status: 'unknown', message: null, blocksSubmit: false })
  })

  it('evaluates format before any remote verdict — a stale available:true cannot mask an invalid value', () => {
    const result = handleFieldState({
      raw: 'ab',
      checking: false,
      remote: { available: true, reason: null },
    })
    expect(result.status).toBe('invalid')
    expect(result.blocksSubmit).toBe(true)
  })
})
