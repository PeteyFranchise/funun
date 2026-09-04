import { isGreenRoomView, normalizeGreenRoomView } from '@/lib/green-room/views'

describe('Green Room primary views', () => {
  it.each(['room', 'people', 'network'] as const)('accepts %s', view => {
    expect(isGreenRoomView(view)).toBe(true)
    expect(normalizeGreenRoomView(view)).toBe(view)
  })

  it('falls back to the Room for invalid, absent, or repeated values', () => {
    expect(normalizeGreenRoomView(undefined)).toBe('room')
    expect(normalizeGreenRoomView('unknown')).toBe('room')
    expect(normalizeGreenRoomView(['network', 'people'])).toBe('network')
  })
})
