import { readFileSync } from 'fs'
import path from 'path'

const migration151 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/151_song_passport_foundation.sql'),
  'utf8'
)

const sqlOnly = migration151
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

const TABLES = [
  'song_passports',
  'song_passport_values',
  'song_passport_field_heads',
  'song_passport_snapshots',
  'song_passport_actions',
  'song_passport_tasks',
  'song_passport_grants',
] as const

describe('migration 151 — Song Passport additive foundation', () => {
  it('is explicitly human-gated and does not alter landed domain tables', () => {
    expect(migration151).toContain('HUMAN-GATED')
    expect(migration151).toContain('owner applies')
    expect(sqlOnly).not.toMatch(/ALTER TABLE public\.(works|work_versions|collaborators|split_sheets|vault_documents|vault_projects|tracks)/i)
  })

  it('creates every planned foundation table and enables RLS', () => {
    for (const table of TABLES) {
      expect(sqlOnly).toMatch(new RegExp(`CREATE TABLE public\\.${table} \\(`))
      expect(sqlOnly).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
    }
  })

  it('enforces one canonical Passport per work', () => {
    expect(sqlOnly).toMatch(/work_id\s+UUID NOT NULL UNIQUE REFERENCES public\.works\(id\)/)
  })

  it('locks the approved layers, trust states and privacy classes', () => {
    expect(sqlOnly).toContain("layer IN ('contributor', 'composition', 'recording_version', 'release')")
    expect(sqlOnly).toContain("state IN ('inherited', 'draft', 'confirmed', 'locked', 'outdated', 'disputed')")
    expect(sqlOnly).toContain("visibility IN ('public', 'collaborators', 'delivery_safe', 'private_identity', 'legal_restricted')")
  })

  it('requires a layer-correct typed target and matching stable target key', () => {
    expect(sqlOnly).toContain('song_passport_values_target_chk')
    expect(sqlOnly).toContain("target_key = 'work'")
    expect(sqlOnly).toContain("target_key = 'user:' || subject_user_id::TEXT")
    expect(sqlOnly).toContain("target_key = 'version:' || work_version_id::TEXT")
    expect(sqlOnly).toContain("target_key = 'project:' || vault_project_id::TEXT")
    expect(sqlOnly).toContain("target_key = 'track:' || track_id::TEXT")
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.validate_song_passport_value_target()')
    expect(sqlOnly).toContain('version.work_id <> passport.work_id')
    expect(sqlOnly).toContain('track.project_id <> NEW.vault_project_id')
  })

  it('binds each current head to a value with the same Passport field and target', () => {
    expect(sqlOnly).toContain('UNIQUE (id, passport_id, layer, field_key, target_key)')
    expect(sqlOnly).toMatch(/UNIQUE \(passport_id, layer, field_key, target_key\)/)
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(current_value_id, passport_id, layer, field_key, target_key\)[\s\S]*REFERENCES public\.song_passport_values \(id, passport_id, layer, field_key, target_key\)/
    )
  })

  it('prevents cross-Passport lineage, action and task references', () => {
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(supersedes_value_id, passport_id, layer, field_key, target_key\)[\s\S]*REFERENCES public\.song_passport_values \(id, passport_id, layer, field_key, target_key\)/
    )
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(supersedes_snapshot_id, passport_id\)[\s\S]*REFERENCES public\.song_passport_snapshots \(id, passport_id\)/
    )
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(value_id, passport_id\)[\s\S]*REFERENCES public\.song_passport_values \(id, passport_id\)/
    )
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(snapshot_id, passport_id\)[\s\S]*REFERENCES public\.song_passport_snapshots \(id, passport_id\)/
    )
    expect(sqlOnly).toMatch(
      /FOREIGN KEY \(field_head_id, passport_id\)[\s\S]*REFERENCES public\.song_passport_field_heads \(id, passport_id\)/
    )
  })

  it('makes value, snapshot and authority-action history immutable at the database layer', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.reject_song_passport_ledger_mutation()')
    for (const table of ['song_passport_values', 'song_passport_snapshots', 'song_passport_actions']) {
      expect(sqlOnly).toMatch(
        new RegExp(`BEFORE UPDATE OR DELETE ON public\\.${table}[\\s\\S]*reject_song_passport_ledger_mutation`)
      )
    }
  })

  it('keeps every browser write server-mediated', () => {
    for (const table of TABLES) {
      expect(sqlOnly).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon;`)
    }
  })

  it('uses safe owner/member and scoped-visibility helpers', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.can_read_song_passport(')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.has_song_passport_grant(')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.can_view_song_passport_value(')
    expect(sqlOnly.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(3)
    expect(sqlOnly).toContain("p_visibility IN ('public', 'collaborators', 'delivery_safe')")
    expect(sqlOnly).toContain("p_visibility = 'private_identity'")
    expect(sqlOnly).toContain("'view_private_identity'")
    expect(sqlOnly).not.toContain('OR p_created_by = auth.uid()')
    expect(sqlOnly).toMatch(
      /p_visibility = 'private_identity'[\s\S]*p_subject_user_id = auth\.uid\(\)[\s\S]*OR \([\s\S]*public\.can_read_song_passport/
    )
    expect(sqlOnly).toContain("p_visibility = 'legal_restricted'")
    expect(sqlOnly).toContain("'view_legal'")
  })

  it('does not expose snapshots, actions or tasks to raw browser reads', () => {
    for (const table of ['song_passport_snapshots', 'song_passport_actions', 'song_passport_tasks']) {
      expect(sqlOnly).toContain(`REVOKE SELECT ON public.${table} FROM authenticated, anon;`)
    }
  })

  it('records that tasks do not drive readiness', () => {
    expect(migration151).toContain('Task status is operational only and MUST NOT drive readiness')
  })

  it('grants authenticated execution only on the RLS read helpers', () => {
    expect(sqlOnly).toContain('GRANT EXECUTE ON FUNCTION public.can_read_song_passport(uuid, uuid) TO authenticated;')
    expect(sqlOnly).toContain('GRANT EXECUTE ON FUNCTION public.has_song_passport_grant(uuid, uuid, text) TO authenticated;')
    expect(sqlOnly).toContain('GRANT EXECUTE ON FUNCTION public.can_view_song_passport_value(uuid, text, uuid) TO authenticated;')
  })

  it('reloads the PostgREST schema cache last', () => {
    expect(sqlOnly.trimEnd().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
