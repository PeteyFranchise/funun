import { execFileSync } from 'child_process'

// Durable regression guard for the D-03 rename (Phase 20, plan 20-02):
// `artist_profiles` -> `user_profiles` query strings, `ArtistProfile` ->
// `UserProfile` type. Scans RUNTIME source only.
//
// Deliberately excludes:
//   - `supabase/` — migration 076 legitimately creates a compat VIEW named
//     `artist_profiles` (zero-downtime rename, D-01), and historical
//     migrations legitimately reference the old table name in their
//     immutable bodies. Neither should trip this guard.
//   - `__tests__/` — this guard file itself contains the search needle
//     (in prose above and in the grep patterns below), and several
//     migration-content tests assert against immutable historical
//     migration text that still says `artist_profiles`.
const RUNTIME_TARGETS = ['app', 'lib', 'components', 'types', 'middleware.ts']

/**
 * Runs `grep` over RUNTIME_TARGETS and returns matching `file:line:content`
 * output. grep exits non-zero (status 1) when there are zero matches — that
 * is the PASSING case for this guard, so it is caught and normalized to an
 * empty string rather than treated as a failure.
 */
function grepRuntime(pattern: string): string {
  try {
    return execFileSync(
      'grep',
      ['-rn', '-E', pattern, ...RUNTIME_TARGETS, '--include=*.ts', '--include=*.tsx'],
      { encoding: 'utf8' }
    )
  } catch (err) {
    const e = err as { status?: number; stdout?: string }
    if (typeof e.status === 'number' && e.status === 1) {
      return e.stdout ?? ''
    }
    throw err
  }
}

describe('rename regression guard: artist_profiles -> user_profiles (D-03)', () => {
  it('has zero quoted artist_profiles relation-string literals in runtime code', () => {
    const hits = grepRuntime(`['"]artist_profiles['"]`)
    expect(hits).toBe('')
  })

  it('has zero ArtistProfile type tokens in runtime code', () => {
    const hits = grepRuntime(`\\bArtistProfile\\b`)
    expect(hits).toBe('')
  })
})
