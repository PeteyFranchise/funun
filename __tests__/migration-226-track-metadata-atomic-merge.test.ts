import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const migrationsDir = path.join(process.cwd(), 'supabase/migrations')
const matches = readdirSync(migrationsDir).filter(name =>
  name.endsWith('_track_metadata_atomic_asset_merge.sql')
)

if (matches.length !== 1) {
  throw new Error(
    `expected exactly one track-metadata-merge migration, found ${matches.length}: ${matches.join(', ')}`
  )
}

const sql = readFileSync(path.join(migrationsDir, matches[0]), 'utf8')

const stemsRoute = readFileSync(
  path.join(process.cwd(), 'app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts'),
  'utf8'
)
const instrumentalRoute = readFileSync(
  path.join(process.cwd(), 'app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts'),
  'utf8'
)

describe('migration 226 — atomic track metadata asset merge', () => {
  // The whole point. `||` merges at the top level, so a concurrent write to a
  // DIFFERENT key succeeds instead of colliding. A compare-and-swap would have
  // detected the collision; this removes it.
  describe('the merge is done in the database', () => {
    it('sets a key by merging, never by replacing the object', () => {
      expect(sql).toContain("COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(p_key, p_value)")
    })

    it('clears a key with the JSONB minus operator, leaving siblings untouched', () => {
      expect(sql).toContain("COALESCE(metadata, '{}'::JSONB) - p_key")
    })
  })

  // Without the allowlist these would be an arbitrary metadata write primitive
  // reachable by any authenticated caller — a far larger surface than the
  // defect being fixed.
  describe('the key is an allowlist, not a passthrough', () => {
    it('rejects any key other than stems or instrumental', () => {
      expect(sql).toContain("p_key NOT IN ('stems', 'instrumental')")
      expect(sql).toContain('track_metadata_key_not_allowed')
      // Both functions carry the guard, not just the setter.
      expect(sql.match(/track_metadata_key_not_allowed/g)).toHaveLength(2)
    })

    it('rejects a value that is not a JSON object', () => {
      expect(sql).toContain("jsonb_typeof(p_value) <> 'object'")
    })
  })

  // WR-04's lesson, applied rather than relearned: migration 224 revoked from
  // PUBLIC/anon and forgot the matching grant, leaving a function that worked
  // only through Postgres's implicit default. Both halves, both functions.
  describe('grant discipline', () => {
    it('revokes from PUBLIC and anon, and grants to authenticated, for both functions', () => {
      expect(sql.match(/REVOKE EXECUTE ON FUNCTION/g)).toHaveLength(2)
      expect(sql.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(2)
      expect(sql).toContain('public.set_track_metadata_asset(UUID, UUID, TEXT, JSONB)\n  TO authenticated')
      expect(sql).toContain('public.clear_track_metadata_asset(UUID, UUID, TEXT)\n  TO authenticated')
    })

    // SECURITY INVOKER keeps the existing RLS on tracks in force; the
    // ownership predicate inside is a second, independent gate.
    it('runs as the caller, not as definer', () => {
      // Anchored to the clause on its own line: the header comment above also
      // says "SECURITY INVOKER", and an unanchored count would score it.
      expect(sql.match(/^SECURITY INVOKER$/gm)).toHaveLength(2)
      expect(sql).not.toContain('SECURITY DEFINER')
      expect(sql.match(/user_id = auth\.uid\(\)/g)).toHaveLength(2)
    })
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})

describe('M-02 — the routes no longer read-modify-write the metadata column', () => {
  it('stems POST and DELETE go through the RPCs', () => {
    expect(stemsRoute).toContain("supabase.rpc('set_track_metadata_asset'")
    expect(stemsRoute).toContain("supabase.rpc('clear_track_metadata_asset'")
    expect(stemsRoute).toContain("p_key: 'stems'")
  })

  it('instrumental POST and DELETE go through the RPCs', () => {
    expect(instrumentalRoute).toContain("supabase.rpc('set_track_metadata_asset'")
    expect(instrumentalRoute).toContain("supabase.rpc('clear_track_metadata_asset'")
    expect(instrumentalRoute).toContain("p_key: 'instrumental'")
  })

  // The exact shape of the defect: spreading the existing object and writing
  // the whole column back. If this returns, the race returns with it.
  it('neither route writes the whole metadata column any more', () => {
    for (const source of [stemsRoute, instrumentalRoute]) {
      expect(source).not.toMatch(/\.update\(\s*\{\s*metadata/)
      expect(source).not.toMatch(/metadata:\s*\{\s*\.\.\.metadata/)
      expect(source).not.toMatch(/delete nextMeta\./)
    }
  })
})
