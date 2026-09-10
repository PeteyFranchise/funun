import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const migrationFiles = [
  '201_playbook_rich_documents.sql',
  '202_playbook_reading_operations.sql',
  '204_playbook_review_threads.sql',
  '205_playbook_change_broadcasts.sql',
  '206_playbook_enablement_platform.sql',
  '207_playbook_operational_v1.sql',
]
const migrations = migrationFiles.map((file) => ({
  file,
  sql: fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'),
}))
const preApply = fs.readFileSync(
  path.join(root, '.planning/quick/260909-playbook-production-promotion/PRE-APPLY-GATE.sql'),
  'utf8'
)
const postApply = fs.readFileSync(
  path.join(root, '.planning/quick/260909-playbook-production-promotion/POST-APPLY-VERIFY.sql'),
  'utf8'
)
const applySequence = fs.readFileSync(
  path.join(root, '.planning/quick/260909-playbook-production-promotion/APPLY-SEQUENCE.md'),
  'utf8'
)

const routeTables: Record<string, string[]> = {
  'app/api/admin/playbook/entries/[id]/reviews/route.ts': [
    'playbook_review_rounds',
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
    'playbook_review_round_events',
  ],
  'app/api/admin/playbook/entries/[id]/reviews/resubmit/route.ts': [
    'playbook_review_rounds',
    'playbook_review_threads',
  ],
  'app/api/admin/playbook/reviews/[threadId]/route.ts': ['playbook_review_threads'],
  'app/api/admin/playbook/reviews/[threadId]/messages/route.ts': [
    'playbook_review_threads',
    'playbook_review_messages',
    'playbook_review_mentions',
  ],
  'app/api/admin/playbook/updates/[id]/read/route.ts': [
    'playbook_change_broadcasts',
    'playbook_change_broadcast_reads',
  ],
  'app/(admin)/admin/playbook/[room]/page.tsx': [
    'playbook_review_mentions',
    'playbook_review_messages',
    'playbook_review_threads',
    'playbook_entry_game_plan_links',
  ],
  'app/(admin)/admin/playbook/my/page.tsx': [
    'playbook_reading_assignments',
    'playbook_reading_acknowledgements',
    'playbook_review_rounds',
    'playbook_review_threads',
  ],
  'app/(admin)/admin/playbook/governance/page.tsx': [
    'playbook_entry_game_plan_links',
    'playbook_reading_assignments',
    'playbook_reading_acknowledgements',
    'playbook_review_rounds',
    'playbook_review_threads',
  ],
}

describe('Playbook production migration promotion', () => {
  it('promotes the settled migration numbers and leaves 203 retired', () => {
    for (const file of migrationFiles) {
      expect(fs.existsSync(path.join(root, 'supabase/migrations', file))).toBe(true)
    }
    expect(fs.readdirSync(path.join(root, 'supabase/migrations')).some((file) => file.startsWith('203_'))).toBe(false)
  })

  it('keeps every promoted migration transactional and human-gated', () => {
    for (const { sql } of migrations) {
      expect(sql).toContain('HUMAN-GATED')
      expect(sql).toMatch(/\bBEGIN;/)
      expect(sql).toMatch(/COMMIT;\s*$/)
    }
  })

  it('pins every owner-run paste block to its current SHA-256 digest', () => {
    for (const { file, sql } of migrations) {
      const digest = createHash('sha256').update(sql).digest('hex')
      expect(applySequence).toContain(`| \`supabase/migrations/${file}\` | \`${digest}\` |`)
    }
  })

  it('covers every created table and function in both verification artifacts', () => {
    for (const { sql } of migrations) {
      const tables = [...sql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)].map((match) => match[1])
      const functions = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/g)].map((match) => match[1])
      for (const table of tables) {
        expect(preApply).toContain(`'${table}'`)
        expect(postApply).toContain(`'${table}'`)
      }
      for (const fn of functions) {
        expect(preApply).toContain(`public.${fn}(`)
        expect(postApply).toContain(`public.${fn}(`)
      }
    }
  })

  it('binds all eight deployed routes to the same candidate-created tables', () => {
    const createdTables = new Set(
      migrations.flatMap(({ sql }) => [...sql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)/g)].map((match) => match[1]))
    )
    expect(Object.keys(routeTables)).toHaveLength(8)
    for (const [route, tables] of Object.entries(routeTables)) {
      const source = fs.readFileSync(path.join(root, route), 'utf8')
      expect(preApply).toContain(`'${route}'`)
      expect(postApply).toContain(`'${route}'`)
      for (const table of tables) {
        expect(createdTables.has(table)).toBe(true)
        expect(source).toContain(`.from('${table}')`)
        expect(preApply).toContain(`('${route}', '${table}')`)
        expect(postApply).toContain(`('${route}', '${table}')`)
      }
    }
  })

  it('keeps both production probes read-only and identity-based', () => {
    for (const sql of [preApply, postApply]) {
      expect(sql).toContain('to_regclass')
      expect(sql).toContain('to_regprocedure')
      expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/im)
      expect(sql.trimEnd().endsWith('ORDER BY ord;')).toBe(true)
    }
  })
})
