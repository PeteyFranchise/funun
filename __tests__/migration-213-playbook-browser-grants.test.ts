import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/213_playbook_browser_table_grant_hardening.sql'
  ),
  'utf8'
)
const gate = fs.readFileSync(
  path.join(
    process.cwd(),
    '.planning/quick/260909-playbook-production-promotion/PRE-APPLY-GATE-213.sql'
  ),
  'utf8'
)

const repairedTables = [
  'playbook_entry_revisions',
  'playbook_entry_game_plan_links',
  'playbook_review_reminders',
  'playbook_reading_assignments',
  'playbook_reading_acknowledgements',
  'playbook_reading_reminders',
  'playbook_review_rounds',
  'playbook_review_threads',
  'playbook_review_messages',
  'playbook_review_mentions',
  'playbook_review_events',
  'playbook_review_round_events',
]

describe('Playbook browser table grant hardening migration 213', () => {
  it('is human-gated and transactional', () => {
    expect(migration).toContain('HUMAN-GATED')
    expect(migration).toMatch(/\bBEGIN;/)
    expect(migration).toMatch(/COMMIT;\s*$/)
  })

  it('repairs exactly the twelve already-created Playbook tables', () => {
    for (const table of repairedTables) {
      expect(migration).toContain(`'${table}'`)
      expect(gate).toContain(`'${table}'`)
    }
    expect(migration.match(/^\s+'playbook_[a-z_]+'/gm)).toHaveLength(24)
  })

  it('revokes every table privilege from every browser role', () => {
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated'
    )
    expect(migration).toContain(
      "grants.grantee IN ('PUBLIC', 'anon', 'authenticated')"
    )
  })

  it('requires the exact observed residual grant posture before apply', () => {
    expect(gate).toContain("VALUES ('anon'::text), ('authenticated'::text)")
    expect(gate).toContain("'REFERENCES, TRIGGER, TRUNCATE'")
    expect(gate).toContain("'migration ledger version is free: 213'")
  })

  it('keeps the gate read-only and emits raw values with pass-or-stop verdicts', () => {
    expect(gate).toContain('raw_value')
    expect(gate).toContain("THEN 'PASS'")
    expect(gate).toContain("ELSE 'STOP'")
    expect(gate).not.toMatch(
      /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/im
    )
  })
})
