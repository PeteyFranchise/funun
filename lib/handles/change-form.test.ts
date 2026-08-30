import { handleChangeSubmitState } from '@/lib/handles/change-form'
import { handleFormatError } from '@/lib/handles/validate'

describe('handleChangeSubmitState', () => {
  it('is unchanged for an exact byte-for-byte match', () => {
    expect(handleChangeSubmitState({ current: 'maya-reyes', next: 'maya-reyes' })).toEqual({
      kind: 'unchanged',
    })
  })

  it('is ready for a casing-only change — D-04 still submits it', () => {
    expect(handleChangeSubmitState({ current: 'maya-reyes', next: 'Maya-Reyes' })).toEqual({
      kind: 'ready',
      handle: 'Maya-Reyes',
    })
  })

  it('is invalid for a blank/whitespace-only value', () => {
    const result = handleChangeSubmitState({ current: 'maya-reyes', next: '  ' })
    expect(result.kind).toBe('invalid')
    expect((result as { message: string }).message).toBe(handleFormatError(''))
  })

  it('is invalid for consecutive separators', () => {
    const result = handleChangeSubmitState({ current: 'maya-reyes', next: 'may--a' })
    expect(result.kind).toBe('invalid')
    expect((result as { message: string }).message).toBe(handleFormatError('may--a'))
  })

  it('is ready when there is no current handle at all', () => {
    expect(handleChangeSubmitState({ current: null, next: 'maya-reyes' })).toEqual({
      kind: 'ready',
      handle: 'maya-reyes',
    })
  })

  it('trims the next value before comparing and before returning it ready', () => {
    expect(handleChangeSubmitState({ current: 'maya-reyes', next: ' new-name ' })).toEqual({
      kind: 'ready',
      handle: 'new-name',
    })
  })
})
