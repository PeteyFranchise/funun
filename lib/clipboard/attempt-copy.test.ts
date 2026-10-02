import { attemptCopy, resolveClipboard, type ClipboardWriter } from './attempt-copy'

describe('resolveClipboard', () => {
  it('returns undefined for undefined (SSR — no navigator at all)', () => {
    expect(resolveClipboard(undefined)).toBeUndefined()
  })

  it('returns undefined when the value has no clipboard property', () => {
    expect(resolveClipboard({})).toBeUndefined()
  })

  it('returns undefined when clipboard exists but has no writeText function', () => {
    expect(resolveClipboard({ clipboard: {} })).toBeUndefined()
  })

  it('returns the clipboard object when writeText is a function', () => {
    const writeText = jest.fn()
    const nav = { clipboard: { writeText } }
    expect(resolveClipboard(nav)).toBe(nav.clipboard)
  })
})

describe('attemptCopy', () => {
  it("resolves to 'unavailable' when no writer resolves (SSR — global navigator is undefined under testEnvironment: 'node')", async () => {
    const result = await attemptCopy('x')
    expect(result).toBe('unavailable')
  })

  it("resolves to 'copied' and the writer receives exactly the string passed in", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    const writer: ClipboardWriter = { writeText }
    const result = await attemptCopy('x', writer)
    expect(result).toBe('copied')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it("resolves to 'rejected' and does not throw when the writer's promise rejects", async () => {
    const writer: ClipboardWriter = {
      writeText: jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    }
    await expect(attemptCopy('x', writer)).resolves.toBe('rejected')
  })

  it("resolves to 'rejected' when the writer throws synchronously (non-secure-origin TypeError must not escape)", async () => {
    const writer: ClipboardWriter = {
      writeText: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'writeText')")
      },
    }
    await expect(attemptCopy('x', writer)).resolves.toBe('rejected')
  })
})
