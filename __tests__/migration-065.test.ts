import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/065_esign_certificate_path.sql'),
  'utf8'
)

// Executable SQL only — the header prose legitimately discusses the very
// things the structural assertions forbid (audit_log_path, uuid defaults).
const sql = migration
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 065 — esign_envelopes.certificate_path', () => {
  it('adds the column idempotently so a re-run is safe', () => {
    expect(sql).toContain('ALTER TABLE esign_envelopes')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS certificate_path TEXT')
  })

  it('leaves the column nullable — no certificate on file is a real state', () => {
    // A NOT NULL would break every envelope completed before this column
    // existed, and would turn the webhook's deliberately non-fatal
    // certificate step into a hard failure after the spend is committed.
    const alter = sql.slice(sql.indexOf('ALTER TABLE esign_envelopes'))
    expect(alter).not.toContain('NOT NULL')
    expect(alter).not.toContain('DEFAULT')
  })

  it('does not overload the provider audit-log pointer', () => {
    // certificate_path holds Funūn's OWN certificate; audit_log_path holds
    // DocuSeal's audit log, which that certificate cites as underlying
    // evidence. Collapsing them would erase the provenance distinction
    // ESIGN-19 exists to preserve.
    //
    // Asserted against the ALTER statement rather than the whole file: the
    // COMMENT ON body legitimately NAMES audit_log_path to document the
    // distinction, and a whole-file match would forbid explaining it.
    const alter = sql.slice(
      sql.indexOf('ALTER TABLE esign_envelopes'),
      sql.indexOf('COMMENT ON COLUMN')
    )
    expect(alter).not.toContain('audit_log_path')
    expect(sql).toContain('COMMENT ON COLUMN esign_envelopes.certificate_path')
  })

  it('changes no RLS policy or grant — the column inherits 062 protections', () => {
    expect(sql).not.toContain('CREATE POLICY')
    expect(sql).not.toContain('DROP POLICY')
    expect(sql).not.toContain('GRANT')
    expect(sql).not.toContain('REVOKE')
  })

  it('carries the human-gated push warning every 06x migration carries', () => {
    expect(migration).toContain('must NEVER run `supabase db push`')
  })
})
