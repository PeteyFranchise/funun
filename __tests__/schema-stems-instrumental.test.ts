// Tests for readStems() and readInstrumental() typed readers.
// These readers must mirror the defensive-parse pattern of readMasterAudio().

import { readStems, readInstrumental } from '@/lib/metadata/schema'

// ─── readStems ────────────────────────────────────────────────────────────────

describe('readStems', () => {
  it('returns the stems ref when all fields are present', () => {
    const result = readStems({ stems: { path: 'u/p/t.stems.zip', size: 1000, name: 'a.zip' } })
    expect(result).toEqual({ path: 'u/p/t.stems.zip', size: 1000, name: 'a.zip' })
  })

  it('returns null for an empty object', () => {
    expect(readStems({})).toBeNull()
  })

  it('returns null for null input', () => {
    expect(readStems(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(readStems(undefined)).toBeNull()
  })

  it('returns null when path is an empty string', () => {
    expect(readStems({ stems: { path: '' } })).toBeNull()
  })

  it('defaults size to 0 and name to "stems.zip" when absent', () => {
    const result = readStems({ stems: { path: 'x' } })
    expect(result).toEqual({ path: 'x', size: 0, name: 'stems.zip' })
  })

  it('defaults size to 0 when size is not a number', () => {
    const result = readStems({ stems: { path: 'x', size: 'big', name: 'a.zip' } })
    expect(result?.size).toBe(0)
  })

  it('defaults name to "stems.zip" when name is not a non-empty string', () => {
    const result = readStems({ stems: { path: 'x', name: '' } })
    expect(result?.name).toBe('stems.zip')
  })
})

// ─── readInstrumental ─────────────────────────────────────────────────────────

describe('readInstrumental', () => {
  it('returns the instrumental ref when all fields are present', () => {
    const result = readInstrumental({ instrumental: { path: 'u/p/t.instrumental.mp3', size: 500, ext: 'mp3' } })
    expect(result).toEqual({ path: 'u/p/t.instrumental.mp3', size: 500, ext: 'mp3' })
  })

  it('returns null for an empty object', () => {
    expect(readInstrumental({})).toBeNull()
  })

  it('returns null for null input', () => {
    expect(readInstrumental(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(readInstrumental(undefined)).toBeNull()
  })

  it('returns null when path is an empty string', () => {
    expect(readInstrumental({ instrumental: { path: '' } })).toBeNull()
  })

  it('defaults size to 0 and ext to "mp3" when absent', () => {
    const result = readInstrumental({ instrumental: { path: 'x' } })
    expect(result).toEqual({ path: 'x', size: 0, ext: 'mp3' })
  })

  it('defaults ext to "mp3" when ext is not a non-empty string', () => {
    const result = readInstrumental({ instrumental: { path: 'x', ext: '' } })
    expect(result?.ext).toBe('mp3')
  })

  it('defaults size to 0 when size is not a number', () => {
    const result = readInstrumental({ instrumental: { path: 'x', size: 'large' } })
    expect(result?.size).toBe(0)
  })
})
