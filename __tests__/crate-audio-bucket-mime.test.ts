import { readFileSync } from 'fs'
import path from 'path'
import { CRATE_AUDIO_MIME_TYPES } from '@/lib/sync-library/crate-artifact'
import { TRACK_AUDIO_MAX_BYTES } from '@/lib/vault/track-audio'

// Migration 248 provisions the private `crate-audio` bucket with a MIME
// allowlist and a size limit written as SQL literals. SQL cannot import
// TypeScript, so the two can drift silently — and the drift is not theoretical:
// an earlier pass asserted `audio/aiff`, which this uploader has never accepted,
// while omitting three types it does.
const MIGRATION = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/248_crate_song_expand.sql'),
  'utf8'
)

function bucketArrayLiteral(): string[] {
  const m = MIGRATION.match(/allowed_mime_types\s*\)\s*VALUES[\s\S]*?ARRAY\[([\s\S]*?)\]/)
  if (!m) throw new Error('could not find the crate-audio bucket ARRAY[...] literal in migration 248')
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
}

describe('migration 248 crate-audio bucket', () => {
  it('allows exactly the MIME types the Vault uploader accepts, no more and no fewer', () => {
    expect([...bucketArrayLiteral()].sort()).toEqual([...CRATE_AUDIO_MIME_TYPES].sort())
  })

  it('does not allow audio/aiff, which this codebase has never accepted', () => {
    expect(bucketArrayLiteral()).not.toContain('audio/aiff')
  })

  it('caps the bucket at the same size the uploader enforces', () => {
    const m = MIGRATION.match(/VALUES\s*\([\s\S]*?false,\s*(\d+),/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(TRACK_AUDIO_MAX_BYTES)
  })

  it('creates the bucket private and forces it private on conflict', () => {
    expect(MIGRATION).toContain("'crate-audio'")
    expect(MIGRATION).toMatch(/ON CONFLICT \(id\) DO UPDATE SET\s*\n\s*public\s*=\s*false/)
  })
})
