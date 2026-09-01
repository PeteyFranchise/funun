import { readFileSync } from 'fs'
import path from 'path'

const migration143 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/143_writer_room_presence_authorization.sql'),
  'utf8'
)

const sqlOnly = migration143
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

describe("migration 143 — private Writer's Room presence", () => {
  it('strictly parses only a Writer Room presence topic containing a UUID', () => {
    expect(sqlOnly).toMatch(/\^writers-room:/)
    expect(sqlOnly).toMatch(/:presence\$/)
    expect(sqlOnly).toContain("split_part(p_topic, ':', 2)::uuid")
    expect(sqlOnly).toContain('ELSE NULL')
  })

  it('authorizes both receiving and sending through realtime.messages', () => {
    expect(sqlOnly).toMatch(/FOR SELECT\s+TO authenticated/)
    expect(sqlOnly).toMatch(/FOR INSERT\s+TO authenticated/)
  })

  it('permits presence only, never broadcast traffic', () => {
    expect(sqlOnly.match(/extension = 'presence'/g)).toHaveLength(2)
    expect(sqlOnly).not.toMatch(/extension = 'broadcast'/)
  })

  it('reuses the canonical owner and member authorization helpers', () => {
    expect(sqlOnly.match(/public\.is_work_owner/g)).toHaveLength(2)
    expect(sqlOnly.match(/public\.work_member_tier/g)).toHaveLength(2)
    expect(sqlOnly.match(/auth\.uid\(\)/g)).toHaveLength(4)
  })

  it('does not grant anonymous access', () => {
    expect(sqlOnly).not.toMatch(/TO anon/)
    expect(sqlOnly).toMatch(/REVOKE EXECUTE[^;]+FROM PUBLIC, anon, authenticated/)
  })
})
