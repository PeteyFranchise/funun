import { shouldOpenCaptureShortcut, writerRoomIdFromPath } from './global-capture'

describe('global Idea capture', () => {
  it('recognizes only the canonical Writer’s Room path', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(writerRoomIdFromPath(`/vault/works/${id}`)).toBe(id)
    expect(writerRoomIdFromPath(`/vault/works/${id}/`)).toBe(id)
    expect(writerRoomIdFromPath(`/vault/${id}`)).toBeNull()
    expect(writerRoomIdFromPath('/admin')).toBeNull()
  })

  it('opens with Command/Ctrl + Shift + U but never while typing', () => {
    const base = { key: 'u', metaKey: true, ctrlKey: false, shiftKey: true, repeat: false, defaultPrevented: false, editableTarget: false }
    expect(shouldOpenCaptureShortcut(base)).toBe(true)
    expect(shouldOpenCaptureShortcut({ ...base, metaKey: false, ctrlKey: true })).toBe(true)
    expect(shouldOpenCaptureShortcut({ ...base, editableTarget: true })).toBe(false)
    expect(shouldOpenCaptureShortcut({ ...base, shiftKey: false })).toBe(false)
    expect(shouldOpenCaptureShortcut({ ...base, repeat: true })).toBe(false)
  })
})
